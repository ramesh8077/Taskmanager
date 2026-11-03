const { POSITION_RANK } = require("../../shared/organization");

const positionOf = (user) => user?.position;
const rankOf = (user) => POSITION_RANK[positionOf(user)] || 0;
const idOf = (user) => Number(user?.id);

const POSITION_PERMISSIONS = Object.freeze({
  MANAGER: [
    "project:create",
    "task:create",
    "task:view:any",
    "task:update:any",
    "ticket:view:any",
    "user:view:any",
    "report:view:any",
    "settings:manage",
  ],
  SUB_MANAGER: ["task:create", "user:view:team"],
  TEAM_LEAD: ["task:create", "user:view:team"],
});

function permissionsForPosition(user, grantedPermissions = []) {
  return [...new Set([
    ...grantedPermissions,
    ...(POSITION_PERMISSIONS[user?.position] || []),
  ])];
}

function isManager(actor) {
  return positionOf(actor) === "MANAGER";
}

function canViewUser(actor, target) {
  if (!actor || !target) return false;
  if (idOf(actor) === idOf(target)) return true;
  if (isManager(actor)) return true;
  return (
    actor.department === target.department &&
    rankOf(actor) > rankOf(target)
  );
}

function canAssignTask(actor, assignee) {
  if (!actor || !assignee) return false;
  if (isManager(actor)) return true;
  return (
    actor.department === assignee.department &&
    rankOf(actor) > rankOf(assignee)
  );
}

function taskAssignee(task) {
  return task?.assignee || task?.assignedUser || task?.assignedToUser || null;
}

function canEditTask(actor, task) {
  if (!actor || !task) return false;
  return isManager(actor) || canAssignTask(actor, taskAssignee(task));
}

function canEditDeadline(actor, task) {
  return canEditTask(actor, task);
}

function canUpdateProgress(actor, task) {
  if (!actor || !task) return false;
  if (isManager(actor)) return true;

  const assignee = taskAssignee(task);
  const assignedUserId =
    task.assignedToId ?? task.assignedTo ?? assignee?.id;
  if (assignedUserId != null && idOf(actor) === Number(assignedUserId)) {
    return true;
  }
  return canAssignTask(actor, assignee);
}

function canDeleteTask(actor, task) {
  if (!actor || !task) return false;
  if (isManager(actor)) return true;

  const creatorId =
    task.createdById ?? task.createdBy ?? task.assignedById ?? task.assignedBy;
  return (
    creatorId != null &&
    idOf(actor) === Number(creatorId) &&
    canAssignTask(actor, taskAssignee(task))
  );
}

module.exports = {
  POSITION_RANK,
  permissionsForPosition,
  isManager,
  canViewUser,
  canAssignTask,
  canEditTask,
  canEditDeadline,
  canUpdateProgress,
  canDeleteTask,
};
