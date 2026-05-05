/**
 * Models Index File
 * 
 * This is the central hub for Sequelize:
 *   1. Creates the Sequelize instance connected to MySQL.
 *   2. Imports all models and registers them with the instance.
 *   3. Defines all inter-model associations (relationships).
 *   4. Exports the `db` object for use across the application.
 */

const { Sequelize } = require("sequelize");
const dbConfig = require("../config/db.config");

// ─── 1. Create Sequelize Instance ────────────────────────────────────────────

let sequelize;

if (dbConfig.url) {
  // Connect via DATABASE_URL connection string
  sequelize = new Sequelize(dbConfig.url, {
    dialect: dbConfig.dialect,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions,
    logging: dbConfig.logging,
  });
} else {
  // Connect via individual config parameters
  sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
    host: dbConfig.HOST,
    port: dbConfig.PORT,
    dialect: dbConfig.dialect,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions,
    logging: dbConfig.logging,
  });
}

// ─── 2. Initialize Models ───────────────────────────────────────────────────

const db = {};

db.Sequelize = Sequelize;   // Class reference (for DataTypes, Op, etc.)
db.sequelize = sequelize;    // Instance reference (for queries, sync, etc.)

// Register models
db.User = require("./user.model")(sequelize);
db.Project = require("./project.model")(sequelize);
db.Task = require("./task.model")(sequelize);
db.TaskHistory = require("./taskHistory.model")(sequelize);
db.Ticket = require("./ticket.model")(sequelize);
db.TicketComment = require("./ticketComment.model")(sequelize);
db.TicketHistory = require("./ticketHistory.model")(sequelize);

// ─── 3. Define Associations ─────────────────────────────────────────────────

/**
 * USER ↔ PROJECT (One-to-Many)
 * 
 * - A User (Admin) can create many Projects.
 * - Each Project belongs to exactly one User (the creator/Admin).
 * 
 * FK: projects.created_by → users.id
 */
db.User.hasMany(db.Project, {
  foreignKey: "createdBy",
  as: "projects",           // User.getProjects(), include: { as: "projects" }
  onDelete: "CASCADE",      // If user is deleted, delete their projects too
  onUpdate: "CASCADE",
});

db.Project.belongsTo(db.User, {
  foreignKey: "createdBy",
  as: "creator",            // Project.getCreator(), include: { as: "creator" }
});

/**
 * PROJECT ↔ TASK (One-to-Many)
 * 
 * - A Project can have many Tasks.
 * - Each Task belongs to exactly one Project.
 * 
 * FK: tasks.project_id → projects.id
 */
db.Project.hasMany(db.Task, {
  foreignKey: "projectId",
  as: "tasks",              // Project.getTasks(), include: { as: "tasks" }
  onDelete: "CASCADE",      // If project is deleted, delete its tasks too
  onUpdate: "CASCADE",
});

db.Task.belongsTo(db.Project, {
  foreignKey: "projectId",
  as: "project",            // Task.getProject(), include: { as: "project" }
});

/**
 * USER ↔ TASK (One-to-Many) — Assignment
 * 
 * - A User (Member) can be assigned many Tasks.
 * - Each Task is assigned to exactly one User.
 * 
 * FK: tasks.assigned_to → users.id
 */
db.User.hasMany(db.Task, {
  foreignKey: "assignedTo",
  as: "assignedTasks",      // User.getAssignedTasks()
  onDelete: "SET NULL",     // If user is deleted, unassign their tasks (don't delete)
  onUpdate: "CASCADE",
});

db.Task.belongsTo(db.User, {
  foreignKey: "assignedTo",
  as: "assignee",           // Task.getAssignee(), include: { as: "assignee" }
});

/**
 * TASK ↔ TASK_HISTORY (One-to-Many)
 * 
 * - A Task can have many history entries.
 * - Each history entry belongs to exactly one Task.
 * 
 * FK: task_history.task_id → tasks.id
 */
db.Task.hasMany(db.TaskHistory, {
  foreignKey: "taskId",
  as: "history",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

db.TaskHistory.belongsTo(db.Task, {
  foreignKey: "taskId",
  as: "task",
});

/**
 * USER ↔ TASK_HISTORY (One-to-Many)
 * 
 * - A User can make many history entries (changes).
 * - Each history entry tracks who made the change.
 * 
 * FK: task_history.changed_by → users.id
 */
db.User.hasMany(db.TaskHistory, {
  foreignKey: "changedBy",
  as: "changes",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});

db.TaskHistory.belongsTo(db.User, {
  foreignKey: "changedBy",
  as: "changedByUser",
});

/**
 * TICKET ASSOCIATIONS
 */
db.User.hasMany(db.Ticket, {
  foreignKey: "createdBy",
  as: "createdTickets",
});
db.Ticket.belongsTo(db.User, {
  foreignKey: "createdBy",
  as: "creator",
});

db.User.hasMany(db.Ticket, {
  foreignKey: "assignedTo",
  as: "assignedTickets",
});
db.Ticket.belongsTo(db.User, {
  foreignKey: "assignedTo",
  as: "assignee",
});

/**
 * TICKET COMMENT ASSOCIATIONS
 */
db.Ticket.hasMany(db.TicketComment, {
  foreignKey: "ticketId",
  as: "comments",
  onDelete: "CASCADE",
});
db.TicketComment.belongsTo(db.Ticket, {
  foreignKey: "ticketId",
  as: "ticket",
});

db.User.hasMany(db.TicketComment, {
  foreignKey: "userId",
  as: "ticketComments",
});
db.TicketComment.belongsTo(db.User, {
  foreignKey: "userId",
  as: "user",
});

/**
 * TICKET HISTORY ASSOCIATIONS
 */
db.Ticket.hasMany(db.TicketHistory, {
  foreignKey: "ticketId",
  as: "history",
  onDelete: "CASCADE",
});
db.TicketHistory.belongsTo(db.Ticket, {
  foreignKey: "ticketId",
  as: "ticket",
});

db.User.hasMany(db.TicketHistory, {
  foreignKey: "changedBy",
  as: "ticketChanges",
});
db.TicketHistory.belongsTo(db.User, {
  foreignKey: "changedBy",
  as: "changedByUser",
});

module.exports = db;

