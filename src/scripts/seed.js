require("dotenv").config();

const db = require("../models");
const { permissionDescriptions, rolePermissions } = require("../lib/permissionCatalog");

async function seed() {
  const configuredEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  await db.sequelize.authenticate();

  const roles = {};
  for (const name of Object.keys(rolePermissions)) {
    const [role] = await db.Role.findOrCreate({
      where: { name },
      defaults: {
        name,
        isActive: name !== "MANAGER" || process.env.MANAGER_ENABLED === "true",
      },
    });
    if (name === "MANAGER") {
      role.isActive = process.env.MANAGER_ENABLED === "true";
      await role.save();
    }
    roles[name] = role;
  }

  const permissions = {};
  for (const [name, description] of Object.entries(permissionDescriptions)) {
    const [permission] = await db.Permission.findOrCreate({
      where: { name },
      defaults: { name, description },
    });
    permissions[name] = permission;
  }

  for (const [roleName, names] of Object.entries(rolePermissions)) {
    await db.RolePermission.bulkCreate(
      names.map((name) => ({
        roleId: roles[roleName].id,
        permissionId: permissions[name].id,
      })),
      { ignoreDuplicates: true }
    );
  }

  if (configuredEmail) {
    const superAdmin = await db.User.findOne({
      where: db.sequelize.where(
        db.sequelize.fn("LOWER", db.sequelize.col("email")),
        configuredEmail
      ),
    });
    if (!superAdmin) {
      throw new Error(`No existing user found for SUPER_ADMIN_EMAIL=${configuredEmail}.`);
    }
    superAdmin.role = "SUPER_ADMIN";
    superAdmin.status = "ACTIVE";
    await superAdmin.save();
    console.log(`RBAC roles and permissions seeded; ${configuredEmail} is SUPER_ADMIN.`);
  } else {
    console.log("RBAC roles and permissions seeded. Set SUPER_ADMIN_EMAIL to promote an existing account.");
  }
}

seed()
  .catch((error) => {
    console.error("RBAC seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
