// health/healthRoutes.js
// Routes pour la santé et monitoring du système

const express = require("express");
const { getSystemHealth } = require("./healthService");
const { logWithTimestamp } = require("../shared/logger");

const router = express.Router();

/**
 * GET /health
 * Endpoint de santé du serveur avec checks complets
 * Query params:
 *   - test_email=true : Inclut un test d'envoi d'email
 */
router.get("/health", async (req, res) => {
  try {
    // Vérifier si on doit inclure le test email
    const includeEmailTest = req.query.test_email === "true";

    if (includeEmailTest) {
      logWithTimestamp("info", "📧 Test email demandé dans le health check");
    }

    // Récupérer l'état de santé complet
    const healthData = await getSystemHealth(includeEmailTest);

    // Retourner le statut HTTP approprié selon l'état
    const statusCode =
      healthData.status === "healthy"
        ? 200
        : healthData.status === "degraded"
          ? 206
          : 503;

    res.status(statusCode).json(healthData);
  } catch (error) {
    logWithTimestamp("error", "💥 Erreur lors du health check", {
      error: error.message,
      stack: error.stack,
    });

    // En cas d'erreur critique, retourner un statut minimal
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Erreur critique lors du health check",
      message: error.message,
      version: "2.3.0-health-refactored",
    });
  }
});

module.exports = router;
