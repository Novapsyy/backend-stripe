require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { logWithTimestamp } = require("../utils/logger");

// Import des routes modulaires
const membershipRoutes = require("../routes/membershipRoutes");
const trainingRoutes = require("../routes/trainingRoutes");
const contactRoutes = require("../routes/contactRoutes");
const webhookRoutes = require("../routes/webhookRoutes");
const utilityRoutes = require("../routes/utilityRoutes");

const app = express();

// Configuration CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://novapsy.fr",
      "https://www.novapsy.fr",
    ],
    credentials: true,
  })
);

// Middleware pour les webhooks Stripe (doit être avant express.json())
app.use("/api/webhook", webhookRoutes);

// Middleware pour parser le JSON
app.use(express.json());

// Configuration des routes
app.use("/api", membershipRoutes);
app.use("/api/training", trainingRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api", utilityRoutes);

// Route par défaut
app.get("/", (req, res) => {
  res.json({
    message: "API Novapsy - Backend Stripe",
    version: "2.0.0-refactored",
    endpoints: {
      membership: [
        "POST /api/create-checkout-session",
        "POST /api/process-payment-success",
        "GET /api/membership-status/:userId/:userType",
      ],
      training: [
        "POST /api/training/create-training-checkout",
        "GET /api/training/check-training-purchase/:userId/:trainingId",
        "POST /api/training/process-training-purchase",
        "GET /api/training/training-details/:priceId/:userId",
      ],
      contact: ["POST /api/contact", "GET /api/contact/test"],
      webhook: ["POST /api/webhook"],
      utility: [
        "GET /api/health",
        "GET /api/user-email/:userId",
        "POST /api/send-newsletter",
      ],
    },
  });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
  logWithTimestamp("error", "Erreur non gérée", {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    error: "Erreur interne du serveur",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Une erreur est survenue",
  });
});

// Gestion des routes non trouvées
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route non trouvée",
    path: req.originalUrl,
    method: req.method,
  });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    logWithTimestamp("info", `🚀 Serveur démarré sur le port ${PORT}`);
    logWithTimestamp("info", "📋 Routes disponibles:");
    logWithTimestamp(
      "info",
      "  - Adhésions: /api/create-checkout-session, /api/process-payment-success"
    );
    logWithTimestamp("info", "  - Formations: /api/training/*");
    logWithTimestamp("info", "  - Contact: /api/contact");
    logWithTimestamp("info", "  - Webhooks: /api/webhook");
    logWithTimestamp(
      "info",
      "  - Utilitaires: /api/health, /api/user-email, /api/send-newsletter"
    );
  });
}

module.exports = app;
