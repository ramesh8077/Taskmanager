const { Op, col, where } = require("sequelize");
const { normalizedRole } = require("./rbac");

function scopedTaskQuery(user) {
  const role = normalizedRole(user?.role);
  if (role === "SUPER_ADMIN") return {};
  if (role === "ADMIN" || role === "MANAGER") {
    return {
      [Op.or]: [
        { assignedById: user.id },
        where(col("assignee.created_by_id"), user.id),
        where(col("project.created_by"), user.id),
      ],
    };
  }
  return user?.id ? { assignedTo: user.id } : { id: { [Op.in]: [] } };
}

function scopedTaskByIdQuery(user, taskId) {
  return { [Op.and]: [{ id: taskId }, scopedTaskQuery(user)] };
}

function scopedProjectQuery(user) {
  const role = normalizedRole(user?.role);
  if (role === "SUPER_ADMIN") return {};
  if (role === "ADMIN" || role === "MANAGER") return { createdBy: user.id };
  return { id: { [Op.in]: [] } };
}

function scopedTicketQuery(user) {
  const role = normalizedRole(user?.role);
  if (role === "SUPER_ADMIN") return {};
  if (role === "ADMIN" || role === "MANAGER") {
    return {
      [Op.or]: [
        { createdBy: user.id },
        { assignedTo: user.id },
        where(col("assignee.created_by_id"), user.id),
      ],
    };
  }
  return { [Op.or]: [{ createdBy: user.id }, { assignedTo: user.id }] };
}

function scopedTicketByIdQuery(user, ticketId) {
  return { [Op.and]: [{ id: ticketId }, scopedTicketQuery(user)] };
}

function scopedUserQuery(user) {
  const role = normalizedRole(user?.role);
  if (role === "SUPER_ADMIN") return {};
  if (role === "ADMIN" || role === "MANAGER") {
    return { createdById: user.id, role: "EMPLOYEE" };
  }
  return user?.id ? { id: user.id } : { id: { [Op.in]: [] } };
}

module.exports = {
  scopedTaskQuery,
  scopedTaskByIdQuery,
  scopedProjectQuery,
  scopedTicketQuery,
  scopedTicketByIdQuery,
  scopedUserQuery,
};
