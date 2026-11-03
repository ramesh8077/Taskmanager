const { Op } = require("sequelize");
const db = require("../models");
const { canEditDeadline, canManageDeadlines, isManager } = require("../lib/permissions");
const { visibleUserIds } = require("../lib/queryFilters");

const Task = db.Task;
const User = db.User;
const DeadlineExtensionRequest = db.DeadlineExtensionRequest;
const DeadlineHistory = db.DeadlineHistory;
const TaskHistory = db.TaskHistory;
const ActivityLog = db.ActivityLog;

async function createRequest(req, res) {
  try {
    if (req.user.position === "INTERN") {
      return res.status(403).json({ success: false, message: "Interns cannot request deadline extensions." });
    }
    const { id: taskId } = req.validatedParams || req.params;
    const { requestedDeadline, reason } = req.body;
    const task = await Task.findOne({
      where: { id: taskId, assignedTo: req.user.id },
    });
    if (!task) {
      return res.status(404).json({ success: false, message: "Assigned task not found." });
    }
    if (task.status === "Completed" || task.status === "DONE") {
      return res.status(409).json({ success: false, message: "Completed tasks cannot request a deadline extension." });
    }
    if (requestedDeadline <= task.dueDate) {
      return res.status(400).json({ success: false, message: "The requested deadline must be later than the current deadline." });
    }
    if (requestedDeadline <= new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ success: false, message: "The requested deadline must be in the future." });
    }

    const request = await db.sequelize.transaction(async (transaction) => {
      const currentTask = await Task.findOne({
        where: { id: taskId, assignedTo: req.user.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!currentTask) return null;
      if (currentTask.status === "Completed" || currentTask.status === "DONE") {
        return { error: "COMPLETED" };
      }
      if (requestedDeadline <= currentTask.dueDate) {
        return { error: "DEADLINE_NOT_EXTENDED" };
      }
      if (requestedDeadline <= new Date().toISOString().slice(0, 10)) {
        return { error: "REQUESTED_DATE_PASSED" };
      }
      const pending = await DeadlineExtensionRequest.findOne({
        where: { taskId, status: "PENDING" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (pending) return { error: "PENDING" };
      return DeadlineExtensionRequest.create({
        taskId,
        requestedById: req.user.id,
        currentDeadline: currentTask.dueDate,
        requestedDeadline,
        reason,
      }, { transaction });
    });
    if (request === null) {
      return res.status(404).json({ success: false, message: "Assigned task not found." });
    }
    if (request?.error === "COMPLETED") {
      return res.status(409).json({ success: false, message: "Completed tasks cannot request a deadline extension." });
    }
    if (request?.error === "DEADLINE_NOT_EXTENDED") {
      return res.status(400).json({ success: false, message: "The requested deadline must be later than the current deadline." });
    }
    if (request?.error === "REQUESTED_DATE_PASSED") {
      return res.status(400).json({ success: false, message: "The requested deadline must be in the future." });
    }
    if (request?.error === "PENDING") {
      return res.status(409).json({ success: false, message: "This task already has a pending deadline request." });
    }
    return res.status(201).json({ success: true, data: { request } });
  } catch (error) {
    console.error("Create Deadline Extension Request Error:", error);
    return res.status(500).json({ success: false, message: "Unable to submit the deadline request." });
  }
}

async function listRequests(req, res) {
  try {
    const query = req.validatedQuery || req.query;
    const visibleIds = isManager(req.user) ? null : await visibleUserIds(User, req.user);
    if (query.assigneeId && visibleIds && !visibleIds.includes(Number(query.assigneeId))) {
      return res.status(403).json({ success: false, message: "You cannot view requests for this assignee." });
    }
    const taskWhere = query.taskId ? { id: query.taskId } : {};
    if (query.assigneeId) taskWhere.assignedTo = query.assigneeId;
    else if (!isManager(req.user)) taskWhere.assignedTo = { [Op.in]: visibleIds };
    const tasks = await Task.findAll({
      where: taskWhere,
      attributes: ["id"],
      raw: true,
    });
    const taskIds = tasks.map(({ id }) => id);
    const requests = taskIds.length
      ? await DeadlineExtensionRequest.findAll({
        where: {
          taskId: { [Op.in]: taskIds },
          ...(query.status ? { status: query.status } : {}),
        },
        include: [
          { model: Task, as: "task", attributes: ["id", "title", "dueDate", "assignedTo"] },
          { model: User, as: "requester", attributes: ["id", "name", "employeeId", "position"] },
          { model: User, as: "reviewer", attributes: ["id", "name"], required: false },
        ],
        order: [["createdAt", "DESC"], ["id", "DESC"]],
      })
      : [];
    return res.status(200).json({ success: true, data: { requests } });
  } catch (error) {
    console.error("List Deadline Extension Requests Error:", error);
    return res.status(500).json({ success: false, message: "Unable to load deadline requests." });
  }
}

async function reviewRequest(req, res) {
  try {
    const { requestId } = req.validatedParams || req.params;
    const { decision, responseNote = null } = req.body;
    const result = await db.sequelize.transaction(async (transaction) => {
      const request = await DeadlineExtensionRequest.findByPk(requestId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
        include: [{
          model: Task,
          as: "task",
          include: [{
            model: User,
            as: "assignee",
            attributes: ["id", "name", "department", "position"],
            required: false,
          }],
        }],
      });
      if (!request) return { error: "NOT_FOUND" };
      const visibleAssigneeIds = await visibleUserIds(User, req.user);
      if (
        !request.task ||
        !visibleAssigneeIds.includes(Number(request.task.assignedTo)) ||
        !canManageDeadlines(req.user) ||
        !canEditDeadline(req.user, request.task)
      ) return { error: "FORBIDDEN" };
      if (request.status !== "PENDING") return { error: "ALREADY_REVIEWED" };
      if (request.task.dueDate !== request.currentDeadline) return { error: "DEADLINE_CHANGED" };
      if (
        decision === "APPROVED" &&
        request.requestedDeadline <= new Date().toISOString().slice(0, 10)
      ) return { error: "REQUESTED_DATE_PASSED" };

      request.status = decision;
      request.reviewedById = req.user.id;
      request.reviewedAt = new Date();
      request.responseNote = responseNote;
      if (decision === "APPROVED") {
        request.task.dueDate = request.requestedDeadline;
        await request.task.save({ transaction });
        await TaskHistory.create({
          taskId: request.task.id,
          changedBy: req.user.id,
          field: "dueDate",
          oldValue: request.currentDeadline,
          newValue: request.requestedDeadline,
          action: "deadline_changed",
        }, { transaction });
        await DeadlineHistory.create({
          taskId: request.task.id,
          oldDeadline: request.currentDeadline,
          newDeadline: request.requestedDeadline,
          changedById: req.user.id,
          reason: responseNote
            ? `${request.reason}\n\nReview: ${responseNote}`
            : request.reason,
        }, { transaction });
        await ActivityLog.create({
          actorId: req.user.id,
          action: "task.deadline_extended",
          entityType: "task",
          entityId: String(request.task.id),
          metadata: {
            oldDeadline: request.currentDeadline,
            newDeadline: request.requestedDeadline,
            requestId: request.id,
          },
        }, { transaction });
      }
      await request.save({ transaction });
      return { request };
    });

    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Deadline request not found." });
    if (result.error === "FORBIDDEN") return res.status(403).json({ success: false, message: "You cannot review this deadline request." });
    if (result.error === "ALREADY_REVIEWED") return res.status(409).json({ success: false, message: "This deadline request has already been reviewed." });
    if (result.error === "DEADLINE_CHANGED") return res.status(409).json({ success: false, message: "The task deadline changed after this request was submitted." });
    if (result.error === "REQUESTED_DATE_PASSED") return res.status(409).json({ success: false, message: "The requested deadline has passed; ask the assignee to submit a new request." });
    return res.status(200).json({ success: true, data: { request: result.request } });
  } catch (error) {
    console.error("Review Deadline Extension Request Error:", error);
    return res.status(500).json({ success: false, message: "Unable to review the deadline request." });
  }
}

module.exports = {
  createRequest,
  listRequests,
  reviewRequest,
};
