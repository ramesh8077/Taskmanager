const ROLE_ALIASES = Object.freeze({
  Admin: "ADMIN",
  Member: "EMPLOYEE",
});

function normalizedRole(role) {
  return ROLE_ALIASES[role] || role;
}

function can(user, permission, resource) {
  if (!user || !Array.isArray(user.permissions)) return false;
  if (!user.permissions.includes(permission)) return false;
  if (!resource || !permission.endsWith(":own")) return true;

  const id = Number(user.id);
  const role = normalizedRole(user.role);
  const resourceType = permission.split(":")[0];

  if (resourceType === "task") {
    if (role === "EMPLOYEE") {
      return Number(resource.assignedTo ?? resource.assigneeId) === id;
    }
    return (
      Number(resource.assignedById ?? resource.assignedBy) === id ||
      Number(resource.assignee?.createdById) === id ||
      Number(resource.project?.createdBy ?? resource.project?.ownerId) === id
    );
  }

  if (resourceType === "project") {
    return Number(resource.ownerId ?? resource.createdBy) === id;
  }

  if (resourceType === "ticket") {
    return (
      Number(resource.createdById ?? resource.createdBy) === id ||
      Number(resource.assignedToId ?? resource.assignedTo) === id ||
      (role !== "EMPLOYEE" && Number(resource.assignee?.createdById) === id)
    );
  }

  if (resourceType === "user") {
    return Number(resource.createdById ?? resource.createdBy) === id;
  }

  return false;
}

module.exports = { can, normalizedRole };
