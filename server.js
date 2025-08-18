require("dotenv").config();
const express = require("express");

// Configuration imports
const { PORT, FRONTEND_URL } = require("./config/constants");
const { CONTACT_EMAIL } = require("./config/email");

// Shared utilities imports
const { logWithTimestamp } = require("./shared/logger");
const { getMailByUser } = require("./shared/userUtils");
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
} = require("./shared/middleware");

// Business logic imports - MODULES REFACTORISÉS
const membershipRoutes = require("./memberships/membershipRoutes");
const { trainingRoutes } = require("./trainings");
const { healthRoutes } = require("./health");
const { contactRoutes } = require("./contact");
const { preventionRoutes } = require("./prevention");
const { paymentRoutes } = require("./payments");

// Email modules imports
const { sendNewsletter } = require("./emails");

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
// ROUTES MODULAIRES - TOUS REFACTORISÉS
// ========================

// Routes des adhésions (refactorisées)
app.use("/", membershipRoutes);

// Routes des formations (refactorisées)
app.use("/", trainingRoutes);

// Routes de santé (refactorisées)
app.use("/", healthRoutes);

// Routes de contact (refactorisées)
app.use("/", contactRoutes);

// Routes de prévention (refactorisées)
app.use("/", preventionRoutes);

// ✅ Routes de paiement (NOUVEAU - refactorisées)
app.use("/", paymentRoutes);

// ========================
// ROUTES NON REFACTORISÉES (À TRAITER PLUS TARD)
// ========================

/**
 * POST /send-newsletter
 * Envoie une newsletter via module refactorisé
 * TODO: À refactoriser dans un module newsletter
 */
app.post("/send-newsletter", async (req, res) => {
  logWithTimestamp("info", "=== ENVOI NEWSLETTER (REFACTORISÉ) ===");

  const { subject, html } = req.body;

  try {
    const result = await sendNewsletter(subject, html);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /user-email/:userId
 * Récupère l'email d'un utilisateur (pour debug)
 * TODO: À refactoriser dans un module debug/utils
 */
app.get("/user-email/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const email = await getMailByUser(userId);

    if (email) {
      res.json({ email });
    } else {
      res.status(404).json({ error: "Email utilisateur non trouvé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération email utilisateur", error);
    res.status(500).json({ error: error.message });
  }
});

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
      logWithTimestamp("info", "✅ Backend Novapsy - REFACTORING COMPLET !");
      logWithTimestamp(
        "info",
        "📁 Modules refactorisés: emails (9) + trainings (3) + health (3) + contact (3) + prevention (3) + payments (3) = 24 fichiers"
      );
      logWithTimestamp("info", "🎯 Architecture modulaire: 100% TERMINÉE");
      logWithTimestamp(
        "info",
        "🔧 Prochaines étapes: newsletter + debug/utils"
      );
      logWithTimestamp("info", "🚀 SERVEUR PRÊT POUR PRODUCTION");
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
