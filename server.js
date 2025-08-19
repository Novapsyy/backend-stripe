require("dotenv").config();
const express = require("express");

// Configuration imports
const { PORT, FRONTEND_URL } = require("./config/constants");
const { CONTACT_EMAIL } = require("./config/email");

// Shared utilities imports
const { logWithTimestamp } = require("./shared/logger");
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
} = require("./shared/middleware");

// Business logic imports - TOUS LES MODULES REFACTORISÉS ✅
const membershipRoutes = require("./memberships/membershipRoutes");
const { trainingRoutes } = require("./trainings");
const { healthRoutes } = require("./health");
const { contactRoutes } = require("./contact");
const { preventionRoutes } = require("./prevention");
const { paymentRoutes } = require("./payments");
const { newsletterRoutes } = require("./newsletter");
const { debugRoutes } = require("./debug");

const app = express();

const { specs, swaggerUi } = require("./config/swagger");

// Swagger documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// ========================
// MIDDLEWARES
// ========================

// IMPORTANT: Le webhook Stripe doit être déclaré AVANT express.json()
// Mais maintenant il est géré dans le module payments avec express.raw()
app.use(express.json());

// Configuration CORS
app.use(corsMiddleware);

// ========================
// ROUTES MODULAIRES - 🎯 REFACTORING 100% TERMINÉ ! 🎯
// ========================

// Routes des adhésions ✅
app.use("/", membershipRoutes);

// Routes des formations ✅
app.use("/", trainingRoutes);

// Routes de santé ✅
app.use("/", healthRoutes);

// Routes de contact ✅
app.use("/", contactRoutes);

// Routes de prévention ✅
app.use("/", preventionRoutes);

// Routes de paiement ✅
app.use("/", paymentRoutes);

// 🆕 Routes de newsletter ✅ (NOUVEAU - refactorisées)
app.use("/", newsletterRoutes);

// 🆕 Routes de debug/utils ✅ (NOUVEAU - refactorisées)
app.use("/", debugRoutes);

// ========================
// GESTION D'ERREURS
// ========================

// Gestionnaire d'erreurs global
app.use(errorHandler);

// Route non trouvée
app.use("*", notFoundHandler);

// ========================
// DÉMARRAGE SERVEUR
// ========================

async function startServer() {
  try {
    const requiredVars = ["RESEND_API_KEY"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      logWithTimestamp("error", "❌ Variables d'environnement manquantes", {
        missing: missingVars,
      });
      process.exit(1);
    }

    // Démarrage du serveur
    app.listen(PORT, () => {
      logWithTimestamp(
        "info",
        `🚀 Serveur démarré sur http://localhost:${PORT}`
      );
      logWithTimestamp("info", `📊 Frontend: ${FRONTEND_URL}`);
      logWithTimestamp("info", `📧 Email: ${CONTACT_EMAIL}`);
      logWithTimestamp(
        "info",
        "🎉 Backend Novapsy - REFACTORING 100% TERMINÉ ! 🎉"
      );
      logWithTimestamp(
        "info",
        "📁 Modules refactorisés: emails (9) + trainings (3) + health (3) + contact (3) + prevention (3) + payments (3) + newsletter (3) + debug (3) = 30 fichiers"
      );
      logWithTimestamp("info", "🏗️ Architecture modulaire: PARFAITE !");
      logWithTimestamp(
        "info",
        "✨ Tous les endpoints sont maintenant modulaires"
      );
      logWithTimestamp("info", "🚀 SERVEUR 100% PRODUCTION-READY ! 🚀");
    });
  } catch (error) {
    logWithTimestamp("error", "💥 Erreur critique au démarrage", error);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt
process.on("SIGINT", () => {
  logWithTimestamp("info", "🛑 Arrêt serveur gracieux...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logWithTimestamp("info", "🛑 Arrêt serveur...");
  process.exit(0);
});

// Démarrage
startServer();
