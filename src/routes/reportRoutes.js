const express = require("express");
const router = express.Router();
const { verifyToken, requirePermission } = require("../middlewares/authMiddleware");
const { getWorkspaceReport } = require("../controllers/reportController");

router.get("/", verifyToken, requirePermission("report:view:any"), getWorkspaceReport);

module.exports = router;
