# Taskmanager

## RBAC foundation

The application uses an Express 5 API, Sequelize, and MySQL. Permission checks
and resource scoping run on the API; the Next.js route middleware is only an
early navigation guard and is not an authorization boundary.

### Database and initial administrator

1. Configure the MySQL and JWT environment variables in `.env`. Remote
   database connections use TLS by default; set `DB_SSL=true` to require TLS
   explicitly or `DB_SSL=false` only for a trusted database that does not
   support TLS. `JWT_SECRET` must be a unique random value of at least 32
   characters. Set `CORS_ORIGIN` to the exact frontend origin (or a
   comma-separated list); wildcard origins are intentionally rejected for
   credentialed requests. Configure the same value in the deployment
   environment, including the deployed frontend URL.
2. Run `npm run db:migrate` against the existing Taskmanager database. It
   creates the new RBAC tables without altering existing columns, applies the
   versioned migration, maps legacy `Admin` and
   `Member` values to `ADMIN` and `EMPLOYEE`, and adds ownership/status fields.
   It also adds a default-zero task progress column and backfills completed
   tasks to 100%; progress and future task changes are recorded in task history.
   The ticket workflow migration adds ticket resolution metadata, deadlines,
   project/task links, notifications, and attachment metadata without removing
   ticket records. Existing tickets, comments, and history are preserved.
   Existing records and identifiers are preserved. A legacy employee is linked
   to an Admin only when all projects containing that employee's assigned tasks
   have the same owner; ambiguous and unassigned employees remain unowned.
3. Run `npm run db:seed` to seed roles, permissions, and role grants. The
   optional `MANAGER_ENABLED=true` setting enables the otherwise-disabled
   `MANAGER` role.
4. Register the initial account through the app. Set `SUPER_ADMIN_EMAIL` in
   `.env` to that account's email and run `npm run db:seed` again to promote
   only that account to `SUPER_ADMIN`.
5. Start the app with `npm run dev`. Server startup checks the migration state;
   it no longer runs `sequelize.sync({ alter: true })`.

### Department and position hierarchy

The hierarchy migration is `202611020001-department-hierarchy.js`; apply it
with `npm run db:migrate` before deploying code that uses the new fields. It
adds department, position, reporting, employee ID, activity, deadline history,
and activity-log data while retaining existing records. Legacy accounts are
placed in Operations/Employee by default, except existing `SUPER_ADMIN` and
`MANAGER` roles, which are preserved as Managers.

The member-details and deadline-extension features also require
`202611020002-deadline-extension-requests.js`. Back up the database, then run
`npm run db:migrate` to apply both pending hierarchy migrations before
deployment. Member detail/update routes are `GET /api/users/members/:id` and
`PATCH /api/users/members/:id`. Assigned users can submit deadline requests at
`POST /api/tasks/:id/deadline-requests`; authorized supervisors can list and
review them at `GET /api/tasks/deadline-requests` and
`PUT /api/tasks/deadline-requests/:requestId`. Approval updates the task
deadline and records deadline history in the same transaction.

### Shared Tasks/Tickets list

The authenticated `GET /api/work-items` endpoint serves both separate Sequelize
models through one paginated response. `view=tasks|tickets` selects the source;
`status=PENDING|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED|ALL` selects the status
group. The default is Tasks/PENDING, mapped to the existing `Pending` task
status and `Open` ticket status (and their legacy aliases). Optional filters
include `assignedTo`, comma-separated `assigneePosition`, `createdBy`,
comma-separated `department` and `priority`, `deadlineFrom`, `deadlineTo`,
`createdFrom`, `createdTo`, `overdue`, and `search`. Sorting and page
parameters are `sortBy`, `sortOrder`, `page`, and `pageSize`.

The response includes the paginated normalized `data`, `total`, grouped status
`counts`, cross-view `viewCounts`, and permission-scoped `filterOptions`.
Counts and result queries use database scopes and never load the full item sets
into application memory. The active Next.js dashboard renders the shared
`WorkItemsTable` for every hierarchy position; employee and intern views omit
team-management filters while the API continues enforcing the caller's scope.
The index migration
`202611030001-work-items-dashboard-indexes.js` adds the missing composite
indexes; apply it with `npm run db:migrate` before deploying this query.

Public registration requires a department, position, and eligible same-
department reporting manager (except Managers). A Manager signup is accepted
only when its email exactly matches `SUPER_ADMIN_EMAIL`; configure that value
before registering the initial Manager. New Managers receive the existing
`SUPER_ADMIN` permission role. The API, not the browser, validates the selected
reporting relationship.

Ticket attachments are stored outside the web root in `storage/ticket-attachments`
by default. Set `TICKET_ATTACHMENT_DIR` to a persistent, access-controlled
directory in deployed environments, and include that directory in backups.
Uploads are limited to 8 MB per file (JPEG, PNG, GIF, WebP, PDF, or plain text)
and are downloaded only through authenticated, ticket-scoped API routes.
Deadline and overdue notifications are deduplicated per ticket and recipient;
the server checks them at startup, hourly, and when ticket lists are loaded.

public registration always creates an `EMPLOYEE`. A submitted role field is
rejected; role assignment is never accepted from an unauthenticated client.
Authentication uses a secure-in-production, HTTP-only, SameSite=Lax cookie.
Login attempts are rate-limited. Use same-site frontend/API hosting or the
included development proxy so the cookie remains available.

### Permission matrix

`✓` means the legacy permission is granted. These grants are seeded from
[`src/lib/permissionCatalog.js`](./src/lib/permissionCatalog.js).

| Permission | SUPER_ADMIN | ADMIN | MANAGER* | EMPLOYEE |
|---|:---:|:---:|:---:|:---:|
| `user:view:any`, `user:manage:any` | ✓ |  |  |  |
| `user:view:team`, `user:manage:team` | ✓ | ✓ |  |  |
| `role:manage`, `permission:manage`, `settings:manage` | ✓ |  |  |  |
| `audit:view` | ✓ |  |  |  |
| `project:create` | ✓ | ✓ |  |  |
| `project:view:any` | ✓ |  |  |  |
| `project:view:own` | ✓ | ✓ | ✓ |  |
| `task:create`, `task:assign` | ✓ | ✓ |  |  |
| `task:view:any`, `task:update:any` | ✓ |  |  |  |
| `task:view:own`, `task:update:own` | ✓ | ✓ | ✓ | ✓ |
| `ticket:create`, `ticket:assign` | ✓ | ✓ |  | `ticket:create` only |
| `ticket:view:any`, `ticket:update:any` | ✓ |  |  |  |
| `ticket:view:own` | ✓ | ✓ | ✓ | ✓ |
| `ticket:update:own` | ✓ | ✓ |  |  |
| `ticket:comment:create:own`, `attachment:create:own` | ✓ | ✓ | ✓ | ✓ |
| `report:view:any` | ✓ |  |  |  |
| `report:view:own` | ✓ | ✓ | ✓ |  |

*`MANAGER` grants are seeded but the role is disabled unless
`MANAGER_ENABLED=true`. Resource scopes further restrict every `:own`
permission. `ADMIN` is limited to owned projects, tasks they assigned, tasks
assigned to their managed users, and tickets they created/assigned or that are
assigned to their managed users. The department/position rules below apply to
work-resource APIs independently of these legacy grants.

### Hierarchy API access

The authenticated user's department and position are loaded from the database
for every request. Managers can access all departments; other positions are
limited to themselves and lower-ranked users in their own department. Task and
ticket filters can only narrow those scopes. Task assignment and updates,
project task lists, ticket visibility and assignment, and team search/overview
use these hierarchy checks on the server. Client-supplied role or department
values do not grant access.

The dashboard uses the same position hierarchy: Managers and positions with
lower-ranked reports see the scoped team workspace and search; Interns see
their personal task dashboard. Project creation is available to Managers,
while task assignment options are limited to users below the signed-in
position in the same department.

Dashboard capabilities that depend on hierarchy position are added to the
authenticated permission list after role grants are loaded: Managers receive
the Manager dashboard capabilities, while Sub Managers and Team Leads receive
team-view and task-creation capabilities. The task creation route enforces
`task:create`; Employees and Interns do not receive that capability.

### Adding a permission

1. Add its string key and description to `permissionDescriptions` in
   [`src/lib/permissionCatalog.js`](./src/lib/permissionCatalog.js).
2. Add the key to only the intended role arrays in `rolePermissions`.
3. Run `npm run db:seed` to add the permission and missing grants.
4. Protect the API route with `requirePermission("permission:key")`; apply the
   appropriate scope helper to the resource query. Gate matching UI affordances
   with the shared `can(user, "permission:key")` helper.
5. Add role-matrix and scope tests under `src/tests`.

### Hierarchy API coverage and validation

The hierarchy API layer applies database-backed position scopes to task,
project, ticket, and user/team endpoints. Work-resource API checks combine
those scopes with the shared legacy permission framework where appropriate.
Member details and updates, deadline extension requests, and URL-persisted team
search filters use the same server-side hierarchy checks. Zod validation and
focused tests cover registration, query filters, and permission boundaries.

### Hierarchy verification checklist

- [ ] Manager can view and edit members/tasks across departments.
- [ ] Development Sub Manager cannot view, assign, or edit Legal users/tasks.
- [ ] Team Lead cannot assign tasks to a Team Lead or higher position.
- [ ] Intern and Employee cannot change a task deadline.
- [ ] A forbidden direct API action returns HTTP 403.
- [ ] Development Sub Manager using `?department=Legal` still sees only Development data.
- [ ] Intern cannot search for or view other users, including by exact name.
- [ ] Team search, task filters, and pagination work together and persist after refresh.

Run the focused tests with `npm test`.
