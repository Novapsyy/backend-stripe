const express = require("express");
const {
  processPreventionRequest,
  testPreventionRequest,
  getPreventionStats,
} = require("./preventionService");
const { logWithTimestamp } = require("../shared/logger");
const router = express.Router();

/**
 * POST /api/send-prevention-request
 */
router.post("/api/send-prevention-request", async (req, res) => {
  logWithTimestamp("info", "📥 Nouvelle demande de prévention");
  try {
    const { to, subject, requestData } = req.body;
    if (!to || !subject || !requestData) {
      return res
        .status(400)
        .json({ success: false, error: "Données manquantes" });
    }
    const result = await processPreventionRequest(requestData, to, subject);
    const statusCode = result.errors ? 400 : result.success ? 200 : 500;
    return res.status(statusCode).json(result);
  } catch (error) {
    logWithTimestamp("error", "💥 Erreur route send-prevention-request", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

/**
 * POST /api/test-prevention-request
 */
router.post("/api/test-prevention-request", async (req, res) => {
  logWithTimestamp("info", "🧪 Test demande de prévention");
  try {
    const { theme } = req.body;
    if (!theme) {
      return res.status(400).json({ success: false, error: "Thème manquant" });
    }
    const result = await testPreventionRequest(theme);
    const statusCode = result.errors ? 400 : result.success ? 200 : 500;
    return res.status(statusCode).json(result);
  } catch (error) {
    logWithTimestamp("error", "💥 Erreur route test-prevention-request", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

/**
 * GET /api/prevention/stats
 */
router.get("/api/prevention/stats", (req, res) => {
  try {
    const stats = getPreventionStats();
    return res.status(200).json(stats);
  } catch (error) {
    logWithTimestamp("error", "Erreur route prevention/stats", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;
