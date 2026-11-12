const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWorkItem } = require("../lib/workItemQueries");

function fixture(fields) {
  return { get: () => ({
    id: 42,
    title: "[TEST] normalization sample",
    description: "Dummy work item used only by this test.",
    status: "Pending",
    priority: "Medium",
    department: "Operations",
    createdAt: "2026-11-12T00:00:00.000Z",
    dueDate: "2026-11-20",
    deadline: null,
    assignedTo: 7,
    ticketId: "TKT-TEST-42",
    assignee: { id: 7, name: "Test Assignee", department: "Operations", position: "EMPLOYEE" },
    creator: { id: 8, name: "Test Creator", position: "TEAM_LEAD" },
    ...fields,
  }) };
}

test("normalizes a dummy task using the task priority map", () => {
  const item = normalizeWorkItem(fixture({}), "tasks");

  assert.equal(item.type, "task");
  assert.equal(item.referenceId, "TASK-42");
  assert.equal(item.priority, "MEDIUM");
  assert.equal(item.status, "PENDING");
});

test("normalizes a dummy ticket using the ticket priority map", () => {
  const item = normalizeWorkItem(fixture({ priority: "P1", status: "In-Progress" }), "tickets");

  assert.equal(item.type, "ticket");
  assert.equal(item.referenceId, "TKT-TEST-42");
  assert.equal(item.priority, "HIGH");
  assert.equal(item.status, "IN_PROGRESS");
});

test("preserves unrecognized priorities without throwing", () => {
  const item = normalizeWorkItem(fixture({ priority: "CUSTOM" }), "tasks");

  assert.equal(item.priority, "CUSTOM");
});
