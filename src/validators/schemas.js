const { z } = require("zod");

const positiveId = z.coerce.number().int().positive();
const shortText = (min, max) =>
  z.string().trim().min(min).max(max);

const loginBody = z
  .object({
    email: z.string().trim().email().max(150).transform((email) => email.toLowerCase()),
    password: z.string().min(1).max(255),
  })
  .strict();

const registerBody = z
  .object({
    name: shortText(2, 100),
    email: z.string().trim().email().max(150).transform((email) => email.toLowerCase()),
    password: z.string().min(8).max(255),
  })
  .strict();

const createProjectBody = z
  .object({
    title: shortText(3, 200),
    description: shortText(1, 10000),
  })
  .strict();

const createTaskBody = z
  .object({
    title: shortText(3, 200),
    description: z.string().trim().max(10000).optional().nullable(),
    dueDate: z.string().date(),
    projectId: positiveId,
    assignedTo: positiveId,
    priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  })
  .strict();

const taskStatusBody = z
  .object({
    status: z.enum(["Pending", "In-Progress", "Completed"]),
    completedBy: z.string().trim().min(1).max(150).optional(),
    completedAt: z.string().date().optional(),
  })
  .strict();

const taskPriorityBody = z
  .object({ priority: z.enum(["Low", "Medium", "High", "Urgent"]) })
  .strict();

const taskProgressBody = z
  .object({ progress: z.coerce.number().int().min(0).max(100) })
  .strict();

const memberSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
}).strict();

const memberOverviewQuery = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  projectId: positiveId.optional(),
  status: z.enum(["Pending", "In-Progress", "Completed"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  page: z.coerce.number().int().positive().max(1000000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
}).strict().refine(
  (query) => !query.startDate || !query.endDate || query.startDate <= query.endDate,
  { message: "startDate must be on or before endDate.", path: ["startDate"] }
);

const taskQuery = z
  .object({
    status: z
      .string()
      .max(100)
      .refine((value) =>
        value.split(",").every((item) => ["Pending", "In-Progress", "Completed"].includes(item.trim()))
      )
      .optional(),
    priority: z
      .string()
      .max(100)
      .refine((value) =>
        value.split(",").every((item) => ["Low", "Medium", "High", "Urgent"].includes(item.trim()))
      )
      .optional(),
    assignedTo: positiveId.optional(),
    projectId: positiveId.optional(),
    overdue: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(["dueDate", "priority", "status", "createdAt"]).optional(),
    sortOrder: z.enum(["ASC", "DESC", "asc", "desc"]).optional(),
  })
  .strict();

const idParams = z.object({ id: positiveId }).strict();
const attachmentParams = z.object({ id: positiveId, attachmentId: positiveId }).strict();

const createTicketBody = z
  .object({
    title: shortText(3, 200),
    description: z.string().trim().max(10000).optional().nullable(),
    screenshotUrl: z
      .union([z.literal(""), z.string().url().max(500)])
      .optional()
      .nullable()
      .transform((value) => (value === "" ? null : value)),
    priority: z.enum(["P0", "P1", "P2"]),
    department: shortText(1, 100),
    assignedTo: positiveId.optional().nullable(),
    deadline: z.string().date().optional().nullable(),
    projectId: positiveId.optional().nullable(),
    taskId: positiveId.optional().nullable(),
  })
  .strict();

const resolveTicketBody = z
  .object({
    rootCause: shortText(1, 10000),
    department: shortText(1, 100),
    assignedTo: positiveId,
  })
  .strict();

const createTicketCommentBody = z
  .object({ comment: shortText(1, 10000) })
  .strict();

const ticketStatusBody = z.object({
  status: z.enum(["In-Progress", "Resolved", "Closed"]),
  resolutionNote: shortText(1, 10000).optional(),
}).strict().refine(
  (body) => body.status !== "Resolved" || !!body.resolutionNote,
  { message: "A resolution note is required.", path: ["resolutionNote"] }
);
const ticketAssignmentBody = z.object({ assignedTo: positiveId.nullable() }).strict();
const ticketDeadlineBody = z.object({ deadline: z.string().date().nullable() }).strict();
const reopenTicketBody = z.object({ reason: shortText(1, 10000) }).strict();

const ticketQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z
      .string()
      .max(100)
      .refine((value) =>
        value.split(",").every((item) => ["Open", "In-Progress", "Resolved", "Closed"].includes(item.trim()))
      )
      .optional(),
    priority: z
      .string()
      .max(20)
      .refine((value) => value.split(",").every((item) => ["P0", "P1", "P2"].includes(item.trim())))
      .optional(),
    department: z.string().trim().max(100).optional(),
    assignee: z.union([positiveId, z.literal("unassigned")]).optional(),
    view: z.enum(["all", "assigned", "created"]).default("all"),
    overdue: z.enum(["true", "false"]).optional(),
    sort: z.enum(["newest", "oldest", "priority", "deadline"]).default("newest"),
    page: z.coerce.number().int().positive().max(1000000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

module.exports = {
  loginBody,
  registerBody,
  createProjectBody,
  createTaskBody,
  taskStatusBody,
  taskPriorityBody,
  taskProgressBody,
  taskQuery,
  memberSearchQuery,
  memberOverviewQuery,
  idParams,
  attachmentParams,
  createTicketBody,
  resolveTicketBody,
  createTicketCommentBody,
  ticketStatusBody,
  ticketAssignmentBody,
  ticketDeadlineBody,
  reopenTicketBody,
  ticketQuery,
};
