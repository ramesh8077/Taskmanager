const test = require("node:test");
const assert = require("node:assert/strict");
const {
  registerBody,
  taskQuery,
  taskProgressBody,
  memberOverviewQuery,
  ticketQuery,
  ticketStatusBody,
  ticketAssignmentBody,
  createTicketBody,
} = require("../validators/schemas");

test("public registration rejects client-supplied roles", () => {
  const result = registerBody.safeParse({
    name: "Example User",
    email: "user@example.com",
    password: "a-strong-password",
    role: "SUPER_ADMIN",
  });
  assert.equal(result.success, false);
});

test("task query validation rejects unsupported statuses and fields", () => {
  assert.equal(taskQuery.safeParse({ status: "Completed,Pending" }).success, true);
  assert.equal(taskQuery.safeParse({ status: "Deleted" }).success, false);
  assert.equal(taskQuery.safeParse({ status: "Pending", ownerId: 99 }).success, false);
});

test("task progress accepts only integer percentages from zero through one hundred", () => {
  assert.equal(taskProgressBody.safeParse({ progress: 0 }).success, true);
  assert.equal(taskProgressBody.safeParse({ progress: 100 }).success, true);
  assert.equal(taskProgressBody.safeParse({ progress: 100.5 }).success, false);
  assert.equal(taskProgressBody.safeParse({ progress: -1 }).success, false);
  assert.equal(taskProgressBody.safeParse({ progress: 101 }).success, false);
});

test("member overview filters validate date ranges, filters, and pagination", () => {
  const valid = memberOverviewQuery.safeParse({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "In-Progress",
    priority: "High",
    page: "2",
    pageSize: "25",
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.page, 2);
  assert.equal(memberOverviewQuery.safeParse({ startDate: "2026-02-01", endDate: "2026-01-01" }).success, false);
  assert.equal(memberOverviewQuery.safeParse({ pageSize: "101" }).success, false);
});

test("ticket listing validates workflow filters, sorting, and pagination", () => {
  const valid = ticketQuery.safeParse({
    search: "104",
    status: "Open,In-Progress",
    priority: "P0,P2",
    assignee: "unassigned",
    view: "created",
    overdue: "true",
    sort: "deadline",
    page: "3",
    pageSize: "50",
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.page, 3);
  assert.equal(ticketQuery.safeParse({ status: "Pending" }).success, false);
  assert.equal(ticketQuery.safeParse({ sort: "random" }).success, false);
  assert.equal(ticketQuery.safeParse({ pageSize: "101" }).success, false);
});

test("ticket workflow requires resolution notes and validates assignee IDs", () => {
  assert.equal(ticketStatusBody.safeParse({ status: "Resolved" }).success, false);
  assert.equal(ticketStatusBody.safeParse({ status: "Resolved", resolutionNote: "Fixed" }).success, true);
  assert.equal(ticketStatusBody.safeParse({ status: "Closed" }).success, true);
  assert.equal(ticketAssignmentBody.safeParse({ assignedTo: null }).success, true);
  assert.equal(ticketAssignmentBody.safeParse({ assignedTo: 0 }).success, false);
});

test("ticket creation validates optional deadline and project/task links", () => {
  const valid = createTicketBody.safeParse({
    title: "Login issue",
    description: "Unable to sign in",
    priority: "P1",
    department: "Support",
    assignedTo: 4,
    deadline: "2026-10-01",
    projectId: 2,
    taskId: 8,
  });
  assert.equal(valid.success, true);
  assert.equal(createTicketBody.safeParse({
    title: "Login issue",
    priority: "P1",
    department: "Support",
    deadline: "not-a-date",
  }).success, false);
});
