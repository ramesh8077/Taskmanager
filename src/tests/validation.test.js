const test = require("node:test");
const assert = require("node:assert/strict");
const {
  registerBody,
  taskQuery,
  taskProgressBody,
  memberOverviewQuery,
  memberUpdateBody,
  deadlineExtensionRequestBody,
  deadlineExtensionReviewBody,
  deadlineExtensionQuery,
  ticketQuery,
  ticketStatusBody,
  ticketProgressBody,
  ticketAssignmentBody,
  createTicketBody,
  ticketDescriptionBody,
  projectDescriptionBody,
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
  assert.equal(taskQuery.safeParse({ sortBy: "title" }).success, true);
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

test("member updates and deadline extension requests validate their allowed fields", () => {
  assert.equal(memberUpdateBody.safeParse({ name: "Team member", isActive: false }).success, true);
  assert.equal(memberUpdateBody.safeParse({ department: "Unknown" }).success, false);
  assert.equal(memberUpdateBody.safeParse({}).success, false);

  assert.equal(deadlineExtensionRequestBody.safeParse({
    requestedDeadline: "2030-12-31",
    reason: "Waiting for a required dependency",
  }).success, true);
  assert.equal(deadlineExtensionRequestBody.safeParse({
    requestedDeadline: "not-a-date",
    reason: "No",
  }).success, false);
  assert.equal(deadlineExtensionReviewBody.safeParse({ decision: "APPROVED" }).success, true);
  assert.equal(deadlineExtensionReviewBody.safeParse({ decision: "PENDING" }).success, false);
  assert.equal(deadlineExtensionQuery.safeParse({ assigneeId: "5", status: "PENDING" }).success, true);
  assert.equal(deadlineExtensionQuery.safeParse({ otherDepartment: "Legal" }).success, false);
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

test("ticket progress accepts work percentages below completion", () => {
  assert.equal(ticketProgressBody.safeParse({ progress: 0 }).success, true);
  assert.equal(ticketProgressBody.safeParse({ progress: 99 }).success, true);
  assert.equal(ticketProgressBody.safeParse({ progress: 100 }).success, false);
  assert.equal(ticketProgressBody.safeParse({ progress: 24.5 }).success, false);
});

test("project and ticket description updates validate editable text", () => {
  assert.equal(projectDescriptionBody.safeParse({ description: "Revised project scope" }).success, true);
  assert.equal(projectDescriptionBody.safeParse({ description: "   " }).success, false);
  assert.equal(ticketDescriptionBody.safeParse({ description: "Revised ticket details" }).success, true);
  assert.equal(ticketDescriptionBody.safeParse({ description: null }).success, true);
  assert.equal(ticketDescriptionBody.safeParse({ description: "x".repeat(10001) }).success, false);
});

test("ticket creation validates optional deadline and project/task links", () => {
  const valid = createTicketBody.safeParse({
    title: "Login issue",
    description: "Unable to sign in",
    priority: "P1",
    department: "Legal",
    assignedTo: 4,
    deadline: "2026-10-01",
    projectId: 2,
    taskId: 8,
  });
  assert.equal(valid.success, true);
  assert.equal(createTicketBody.safeParse({
    title: "Login issue",
    priority: "P1",
    department: "Legal",
    deadline: "not-a-date",
  }).success, false);
});
