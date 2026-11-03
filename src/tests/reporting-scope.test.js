const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { reportingManagerScope } = require("../lib/reportingScope");

test("reporting scope includes Managers across departments and other leaders only in selected department", () => {
  const scope = reportingManagerScope({
    department: "Development",
    position: "EMPLOYEE",
  });
  const [allowedPositions, departmentRule, active, isActive] = scope[Op.and];

  assert.deepEqual(allowedPositions.position[Op.in], ["TEAM_LEAD", "SUB_MANAGER", "MANAGER"]);
  assert.deepEqual(departmentRule[Op.or], [
    { position: "MANAGER" },
    { department: "Development" },
  ]);
  assert.deepEqual(active, { status: "ACTIVE" });
  assert.deepEqual(isActive, { isActive: true });
});

test("reporting scope excludes Managers when position cannot report to a Manager", () => {
  const scope = reportingManagerScope({
    department: "Development",
    position: "MANAGER",
  });
  const [allowedPositions, departmentRule] = scope[Op.and];

  assert.deepEqual(allowedPositions.position[Op.in], []);
  assert.deepEqual(departmentRule[Op.or], [
    { position: "MANAGER" },
    { department: "Development" },
  ]);
});
