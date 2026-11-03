const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canViewUser,
  canAssignTask,
  canEditTask,
  canEditDeadline,
  canUpdateProgress,
  canDeleteTask,
  permissionsForPosition,
  canManageDeadlines,
  canManagePriority,
} = require("../lib/permissions");
const { registerBody } = require("../validators/schemas");

const manager = {
  id: 1,
  department: "Development",
  position: "MANAGER",
};
const developmentLead = {
  id: 2,
  department: "Development",
  position: "TEAM_LEAD",
};
const developmentEmployee = {
  id: 3,
  department: "Development",
  position: "EMPLOYEE",
};
const legalEmployee = {
  id: 4,
  department: "Legal",
  position: "EMPLOYEE",
};

test("Manager permissions are cross-department while other positions stay scoped", () => {
  assert.equal(canViewUser(manager, legalEmployee), true);
  assert.equal(canAssignTask(manager, legalEmployee), true);
  assert.equal(canViewUser(developmentLead, developmentEmployee), true);
  assert.equal(canViewUser(developmentLead, legalEmployee), false);
  assert.equal(canAssignTask(developmentLead, legalEmployee), false);
});

test("users can view themselves but cannot assign tasks to equal or higher positions", () => {
  assert.equal(canViewUser(developmentEmployee, developmentEmployee), true);
  assert.equal(canAssignTask(developmentLead, developmentLead), false);
  assert.equal(canAssignTask(developmentEmployee, developmentLead), false);
  assert.equal(canAssignTask(developmentLead, developmentEmployee), true);
  assert.equal(canAssignTask(developmentEmployee, { ...developmentEmployee, id: 5, position: "INTERN" }), true);
});

test("deadline edits require higher rank; assignees can still update their progress", () => {
  const task = { assignedTo: developmentEmployee.id, assignee: developmentEmployee };
  assert.equal(canEditTask(developmentLead, task), true);
  assert.equal(canEditDeadline(developmentLead, task), true);
  assert.equal(canEditDeadline(developmentEmployee, task), false);
  assert.equal(canUpdateProgress(developmentEmployee, task), true);
  assert.equal(canUpdateProgress(developmentLead, task), true);
});

test("task deletion requires Manager or creator authority over the assignee", () => {
  const task = {
    createdById: developmentLead.id,
    assignedTo: developmentEmployee.id,
    assignee: developmentEmployee,
  };
  assert.equal(canDeleteTask(developmentLead, task), true);
  assert.equal(canDeleteTask(developmentEmployee, task), false);
  assert.equal(canDeleteTask(manager, { ...task, assignee: legalEmployee }), true);
});

test("position capabilities expose only hierarchy dashboard actions", () => {
  const subManagerPermissions = permissionsForPosition(
    { position: "SUB_MANAGER" },
    ["task:view:own", "ticket:view:own"],
  );
  assert.ok(subManagerPermissions.includes("project:create"));
  assert.ok(subManagerPermissions.includes("task:create"));
  assert.ok(subManagerPermissions.includes("ticket:create"));

  const teamLeadPermissions = permissionsForPosition(
    { position: "TEAM_LEAD" },
    ["task:view:own"],
  );
  assert.ok(teamLeadPermissions.includes("task:create"));
  assert.ok(teamLeadPermissions.includes("ticket:create"));
  assert.ok(teamLeadPermissions.includes("task:assign"));
  assert.ok(teamLeadPermissions.includes("user:view:team"));
  assert.ok(!teamLeadPermissions.includes("user:view:any"));

  const employeePermissions = permissionsForPosition(
    { position: "EMPLOYEE" },
    ["task:view:own"],
  );
  assert.ok(!employeePermissions.includes("task:create"));
  assert.ok(!employeePermissions.includes("user:view:team"));
  assert.ok(permissionsForPosition(
    { position: "EMPLOYEE" },
    ["task:view:own", "task:create", "task:assign"],
  ).includes("task:create"));
  const internPermissions = permissionsForPosition(
    { position: "INTERN" },
    ["ticket:create", "task:create", "task:assign", "ticket:assign", "task:update:any"],
  );
  assert.ok(internPermissions.includes("ticket:create"));
  assert.ok(!internPermissions.includes("task:create"));
  assert.ok(!internPermissions.includes("task:assign"));
  assert.ok(!internPermissions.includes("ticket:assign"));
  assert.ok(!internPermissions.includes("task:update:any"));

  const managerPermissions = permissionsForPosition({ position: "MANAGER" }, []);
  assert.ok(managerPermissions.includes("project:create"));
  assert.ok(managerPermissions.includes("task:view:any"));
  assert.ok(managerPermissions.includes("ticket:view:any"));
  assert.ok(managerPermissions.includes("settings:manage"));
});

test("only Managers, Sub-Managers, and Team Leads can manage deadlines and priorities", () => {
  for (const position of ["MANAGER", "SUB_MANAGER", "TEAM_LEAD"]) {
    const actor = { position };
    assert.equal(canManageDeadlines(actor), true);
    assert.equal(canManagePriority(actor), true);
  }
  for (const position of ["EMPLOYEE", "INTERN"]) {
    const actor = { position };
    assert.equal(canManageDeadlines(actor), false);
    assert.equal(canManagePriority(actor), false);
  }
});

test("registration schema requires department, position, and valid reporting selection", () => {
  const base = {
    name: "Test User",
    email: "test@example.com",
    password: "long-password",
    department: "Development",
    position: "EMPLOYEE",
    reportsToId: 2,
  };
  assert.equal(registerBody.safeParse(base).success, true);
  assert.equal(registerBody.safeParse({ ...base, reportsToId: null }).success, false);
  assert.equal(
    registerBody.safeParse({ ...base, position: "MANAGER", reportsToId: null }).success,
    true
  );
  assert.equal(
    registerBody.safeParse({ ...base, position: "MANAGER", reportsToId: 2 }).success,
    false
  );
  assert.equal(registerBody.safeParse({ ...base, department: "Unknown" }).success, false);
});
