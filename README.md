# Taskmanager

## RBAC foundation

The application uses an Express 5 API, Sequelize, and MySQL. Permission checks
and resource scoping run on the API; the Next.js route middleware is only an
early navigation guard and is not an authorization boundary.

### Database and initial administrator

1. Configure the MySQL and JWT environment variables in `.env`. `JWT_SECRET`
   must be a unique random value of at least 32 characters. Set `CORS_ORIGIN`
   to the exact frontend origin (or a comma-separated list); wildcard origins
   are intentionally rejected for credentialed requests.
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

`✓` means the permission is granted. The authoritative grants are seeded from
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
assigned to their managed users. Employees
can only read/update their assigned tasks. Only `SUPER_ADMIN` has system-wide
permissions.

### Adding a permission

1. Add its string key and description to `permissionDescriptions` in
   [`src/lib/permissionCatalog.js`](./src/lib/permissionCatalog.js).
2. Add the key to only the intended role arrays in `rolePermissions`.
3. Run `npm run db:seed` to add the permission and missing grants.
4. Protect the API route with `requirePermission("permission:key")`; apply the
   appropriate scope helper to the resource query. Gate matching UI affordances
   with the shared `can(user, "permission:key")` helper.
5. Add role-matrix and scope tests under `src/tests`.

### Phase 1 coverage and validation

Phase 1 provides database-backed roles/permissions, shared `can()`, scoped
project/task/ticket/user queries, route-level API authorization, server-side
resource checks, Zod request validation for authentication and work endpoints,
and focused RBAC/scope unit tests. User/team administration, the expanded task
workflow, reports, audit log UI, and notifications remain in their later
approved phases.

Run the focused tests with `npm test`.
