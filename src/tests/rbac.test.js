const test = require("node:test");
const assert = require("node:assert/strict");
const { can, normalizedRole } = require("../../shared/rbac");
const { permissionDescriptions, rolePermissions } = require("../lib/permissionCatalog");
const { requirePermission } = require("../middlewares/authMiddleware");
const apiResponse = require("../middlewares/apiResponse");

test("can() enforces every seeded role-permission grant", () => {
  for (const [role, grants] of Object.entries(rolePermissions)) {
    const user = { id: 7, role, permissions: grants };
    for (const permission of Object.keys(permissionDescriptions)) {
      assert.equal(
        can(user, permission),
        grants.includes(permission),
        `${role} ${grants.includes(permission) ? "should" : "should not"} have ${permission}`
      );
    }
  }
});

test("can() scopes own-resource permissions to the actor", () => {
  const admin = { id: 7, role: "ADMIN", permissions: rolePermissions.ADMIN };
  const employee = { id: 12, role: "EMPLOYEE", permissions: rolePermissions.EMPLOYEE };
  assert.equal(can(admin, "task:view:own", { assignedById: 7 }), true);
  assert.equal(can(admin, "task:view:own", { assignedById: 8 }), false);
  assert.equal(can(employee, "task:view:own", { assignedTo: 12 }), true);
  assert.equal(can(employee, "task:view:own", { assignedTo: 13 }), false);
});

test("legacy role labels normalize without granting extra permissions", () => {
  assert.equal(normalizedRole("Admin"), "ADMIN");
  assert.equal(normalizedRole("Member"), "EMPLOYEE");
  assert.equal(
    can({ id: 7, role: "Admin", permissions: rolePermissions.ADMIN }, "audit:view"),
    false
  );
});

test("permission middleware returns 403 when the requested permission is absent", () => {
  const middleware = requirePermission("audit:view");
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  middleware(
    {
      user: { id: 7, role: "ADMIN", permissions: rolePermissions.ADMIN },
    },
    response,
    () => assert.fail("A denied request must not continue.")
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, "FORBIDDEN");
});

test("API responses preserve the legacy success key and add the standard envelope", () => {
  let sentBody;
  const response = {
    statusCode: 403,
    json(body) {
      sentBody = body;
      return this;
    },
  };
  apiResponse(
    {},
    response,
    () => response.json({ success: false, message: "Forbidden." })
  );
  assert.deepEqual(sentBody, {
    success: false,
    message: "Forbidden.",
    ok: false,
    error: { code: "FORBIDDEN", message: "Forbidden." },
  });
});
