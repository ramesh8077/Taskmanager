const express = require("express");
const router = express.Router();
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { getWorkspaceSettings } = require("../controllers/settingsController");

router.get("/", verifyToken, requirePermission("settings:manage"), getWorkspaceSettings);

module.exports = router;
