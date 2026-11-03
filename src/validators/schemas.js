const { z } = require("zod");
const {
  DEPARTMENTS,
  POSITIONS,
  REPORTING_POSITIONS,
} = require("../../shared/organization");

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
    department: z.enum(DEPARTMENTS),
    position: z.enum(POSITIONS),
    reportsToId: positiveId.nullable(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.position === "MANAGER" && body.reportsToId !== null) {
      context.addIssue({
        code: "custom",
        path: ["reportsToId"],
        message: "A Manager cannot report to another user.",
      });
    }
    if (body.position !== "MANAGER" && body.reportsToId === null) {
      context.addIssue({
        code: "custom",
        path: ["reportsToId"],
        message: "Select a reporting manager.",
      });
    }
  });

const reportingOptionsQuery = z
  .object({
    department: z.enum(DEPARTMENTS),
    position: z.enum(POSITIONS),
  })
  .strict();

const registrationOptions = Object.freeze({
  departments: DEPARTMENTS,
  positions: POSITIONS,
  reportingPositions: REPORTING_POSITIONS,
});

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

const deadlineExtensionRequestBody = z.object({
  requestedDeadline: z.string().date(),
  reason: shortText(5, 2000),
}).strict();
const deadlineExtensionReviewBody = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  responseNote: z.string().trim().max(2000).optional(),
}).strict();
const deadlineExtensionQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  taskId: positiveId.optional(),
  assigneeId: positiveId.optional(),
}).strict();

const memberSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
}).strict();

const memberUpdateBody = z.object({
  name: shortText(2, 100).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  position: z.enum(POSITIONS).optional(),
  reportsToId: positiveId.nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  (body) => Object.keys(body).length > 0,
  { message: "Provide at least one member field to update." }
);

const memberOverviewQuery = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  projectId: positiveId.optional(),
  status: z.enum(["Pending", "In-Progress", "Completed"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  search: z.string().trim().max(100).optional(),
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
    createdBy: positiveId.optional(),
    projectId: positiveId.optional(),
    overdue: z.enum(["true", "false"]).optional(),
    dueWithin48h: z.enum(["true", "false"]).optional(),
    deadlineExtended: z.enum(["true", "false"]).optional(),
    assignedToMe: z.enum(["true", "false"]).optional(),
    createdByMe: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(100).optional(),
    deadlineFrom: z.string().date().optional(),
    deadlineTo: z.string().date().optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
    minProgress: z.coerce.number().int().min(0).max(100).optional(),
    maxProgress: z.coerce.number().int().min(0).max(100).optional(),
    sortBy: z.enum(["dueDate", "priority", "status", "createdAt", "progress", "name", "title"]).optional(),
    sortOrder: z.enum(["ASC", "DESC", "asc", "desc"]).optional(),
    department: z.string().trim().max(100).optional(),
    assigneePosition: z.enum(POSITIONS).optional(),
    page: z.coerce.number().int().positive().max(1000000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(100),
  })
  .strict()
  .refine(
    (query) => !query.deadlineFrom || !query.deadlineTo || query.deadlineFrom <= query.deadlineTo,
    { message: "deadlineFrom must be on or before deadlineTo.", path: ["deadlineFrom"] }
  )
  .refine(
    (query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo,
    { message: "createdFrom must be on or before createdTo.", path: ["createdFrom"] }
  )
  .refine(
    (query) => query.minProgress === undefined || query.maxProgress === undefined || query.minProgress <= query.maxProgress,
    { message: "minProgress must be less than or equal to maxProgress.", path: ["minProgress"] }
  );

const updateTaskBody = z.object({
  title: shortText(3, 200).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
  dueDate: z.string().date().optional(),
  reason: shortText(1, 2000).optional(),
}).strict().refine(
  (body) => Object.keys(body).some((key) => key !== "reason"),
  { message: "Provide at least one task field to update." }
).refine(
  (body) => !Object.hasOwn(body, "dueDate") || !!body.reason,
  { message: "A reason is required when changing the deadline.", path: ["reason"] }
);

const idParams = z.object({ id: positiveId }).strict();
const deadlineExtensionRequestParams = z.object({ requestId: positiveId }).strict();
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
    department: shortText(1, 100).optional(),
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
const ticketDeadlineBody = z.object({
  deadline: z.string().date(),
  reason: shortText(1, 2000),
}).strict();
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

const workItemListQuery = z
  .object({
    view: z.enum(["tasks", "tickets"]).default("tasks"),
    status: z.enum(["PENDING", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "ALL"]).default("PENDING"),
    assignedTo: positiveId.optional(),
    assigneePosition: z.string().max(100).transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
      .pipe(z.array(z.enum(["MANAGER", "SUB_MANAGER", "TEAM_LEAD", "EMPLOYEE", "INTERN"])).max(5))
      .optional(),
    createdBy: positiveId.optional(),
    department: z.string().max(500).transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
      .pipe(z.array(z.enum(DEPARTMENTS)).max(DEPARTMENTS.length))
      .optional(),
    priority: z.string().max(100).transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
      .pipe(z.array(z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"])).max(4))
      .optional(),
    deadlineFrom: z.string().date().optional(),
    deadlineTo: z.string().date().optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
    overdue: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().positive().max(1000000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.enum(["createdAt", "deadline", "priority"]).default("deadline"),
    sortOrder: z.enum(["ASC", "DESC"]).default("ASC"),
  })
  .strict()
  .refine(
    (query) => !query.deadlineFrom || !query.deadlineTo || query.deadlineFrom <= query.deadlineTo,
    { message: "deadlineFrom must be before or equal to deadlineTo.", path: ["deadlineFrom"] },
  )
  .refine(
    (query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo,
    { message: "createdFrom must be before or equal to createdTo.", path: ["createdFrom"] },
  );

module.exports = {
  loginBody,
  registerBody,
  reportingOptionsQuery,
  registrationOptions,
  createProjectBody,
  createTaskBody,
  taskStatusBody,
  taskPriorityBody,
  taskProgressBody,
  updateTaskBody,
  taskQuery,
  memberSearchQuery,
  memberUpdateBody,
  memberOverviewQuery,
  deadlineExtensionRequestParams,
  deadlineExtensionRequestBody,
  deadlineExtensionReviewBody,
  deadlineExtensionQuery,
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
  workItemListQuery,
};
