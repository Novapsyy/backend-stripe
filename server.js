require("dotenv").config();
const express = require("express");

// Configuration imports
const { PORT, FRONTEND_URL, WEBHOOK_SECRET } = require("./config/constants");
const { supabase } = require("./config/database");
const { CONTACT_EMAIL } = require("./config/email");
const { stripe } = require("./config/stripe");

// Shared utilities imports
const { logWithTimestamp } = require("./shared/logger");
const { getMailByUser } = require("./shared/userUtils");
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
} = require("./shared/middleware");

// Business logic imports
const {
  checkIfUserIsMember,
  createMembership,
} = require("./memberships/membershipService");
const membershipRoutes = require("./memberships/membershipRoutes");

// Email modules imports
const {
  sendEmailWithRetry,
  sendContactEmail,
  sendPreventionRequest,
  testPreventionRequest,
  sendNewsletter,
} = require("./emails");

// Training modules imports
const { createTrainingPurchase, trainingRoutes } = require("./trainings");

const app = express();

// ========================
// MIDDLEWARES
// ========================

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Configuration CORS
app.use(corsMiddleware);

// ========================
// ROUTES MODULAIRES
// ========================

// Routes des adhésions
app.use("/", membershipRoutes);

// Routes des formations (refactorisées)
app.use("/", trainingRoutes);

// ========================
// WEBHOOKS STRIPE
// ========================

/**
 * POST /webhook
 * Gestionnaire des webhooks Stripe pour les paiements uniques
 * Traite les évènements: checkout.session.completed, payment_intent.*
 */
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    logWithTimestamp("error", "Erreur signature webhook", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logWithTimestamp("info", "🔔 Webhook reçu", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        logWithTimestamp("info", "📋 Session checkout complétée", {
          id: session.id,
          type: session.metadata?.type || "unknown",
          payment_status: session.payment_status,
        });

        try {
          if (session.metadata.type === "membership_onetime") {
            logWithTimestamp(
              "info",
              "👥 Traitement forfait adhésion via webhook",
              session.id
            );

            const result = await createMembership(session.metadata, session);

            logWithTimestamp(
              "info",
              "✅ Forfait adhésion créé avec succès via webhook",
              {
                session_id: session.id,
                membership_id: result.membership_id,
                user_id: session.metadata.userId,
              }
            );
          } else if (session.metadata.type === "training_purchase") {
            logWithTimestamp(
              "info",
              "🎓 Traitement achat formation via webhook",
              session.id
            );

            // Utilisation du module refactorisé
            const result = await createTrainingPurchase(
              session.metadata,
              session
            );

            logWithTimestamp(
              "info",
              "✅ Achat formation créé avec succès via webhook",
              {
                session_id: session.id,
                purchase_id: result.purchase_id,
                user_id: session.metadata.userId,
                training_id: session.metadata.trainingId,
              }
            );
          } else {
            logWithTimestamp(
              "warn",
              "⚠️ Type de transaction inconnu",
              session.metadata?.type
            );
          }
        } catch (error) {
          logWithTimestamp(
            "error",
            "❌ ERREUR CRITIQUE - Échec traitement session",
            {
              session_id: session.id,
              type: session.metadata?.type || "unknown",
              error: error.message,
            }
          );
        }
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        logWithTimestamp("info", "💰 Paiement unique réussi", {
          payment_intent_id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
        });
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        logWithTimestamp("warn", "❌ Paiement unique échoué", {
          payment_intent_id: failedPayment.id,
          amount: failedPayment.amount / 100,
        });
        break;

      default:
        logWithTimestamp("info", "ℹ️ Type d'évènement non géré", event.type);
    }
  } catch (error) {
    logWithTimestamp("error", "❌ ERREUR GLOBALE WEBHOOK", {
      event_type: event.type,
      error: error.message,
    });
  }

  res.json({ received: true });
});

// ========================
// ROUTES EMAIL REFACTORISÉES
// ========================

/**
 * POST /contact
 * Traite le formulaire de contact via module refactorisé
 */
app.post("/contact", async (req, res) => {
  logWithTimestamp("info", "🔥 === NOUVEAU MESSAGE DE CONTACT ===");

  try {
    const result = await sendContactEmail(req.body);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(result.errors ? 400 : 500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans route contact", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    });
  }
});

/**
 * POST /api/send-prevention-request
 * Traite une demande de prévention via module refactorisé
 */
app.post("/api/send-prevention-request", async (req, res) => {
  logWithTimestamp("info", "🎯 === NOUVELLE DEMANDE DE PRÉVENTION ===");

  const { to, subject, requestData } = req.body;

  try {
    const result = await sendPreventionRequest(requestData, to, subject);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(result.errors ? 400 : 500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans route prévention", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    });
  }
});

/**
 * POST /api/test-prevention-request
 * Test des demandes de prévention via module refactorisé
 */
app.post("/api/test-prevention-request", async (req, res) => {
  logWithTimestamp("info", "🧪 === TEST DEMANDE PRÉVENTION ===");

  const { theme } = req.body;

  try {
    const result = await testPreventionRequest(theme);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test demande prévention", error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    });
  }
});

/**
 * GET /contact/test
 * Test de la configuration email via module refactorisé
 */
app.get("/contact/test", async (req, res) => {
  logWithTimestamp("info", "🧪 === TEST CONFIGURATION EMAIL ===");

  try {
    const testHTML = `
      <div style="padding: 30px; font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🧪 Test de Configuration Email</h2>
        <p>✅ La configuration Resend fonctionne correctement</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>To :</strong> ${CONTACT_EMAIL}</p>
        <p><strong>Module :</strong> emailCore.sendEmailWithRetry()</p>
      </div>
    `;

    const result = await sendEmailWithRetry(
      CONTACT_EMAIL,
      "🧪 Test Configuration Resend - Novapsy (Refactorisé)",
      testHTML
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test email envoyé avec succès");
      return res.json({
        success: true,
        message: "Configuration email fonctionnelle (modules refactorisés)",
        details: {
          messageId: result.messageId,
          to: CONTACT_EMAIL,
          attempt: result.attempt,
          module: "emails/emailCore.js",
        },
      });
    } else {
      logWithTimestamp("error", "❌ Test email échoué", result.error);
      return res.status(500).json({
        success: false,
        error: "Configuration email défaillante",
        details: result.error,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test email", error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    });
  }
});

/**
 * POST /send-newsletter
 * Envoie une newsletter via module refactorisé
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

// ========================
// ROUTES DE SANTÉ ET DEBUG
// ========================

/**
 * GET /health
 * Endpoint de santé du serveur
 */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "2.3.0-trainings-refactored",
    services: {
      email: {
        configured: !!process.env.RESEND_API_KEY,
        to: CONTACT_EMAIL,
      },
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
      },
      supabase: {
        configured: !!process.env.SUPABASE_URL,
      },
    },
    features: {
      contact_form: true,
      email_retry: true,
      email_confirmation: true,
      prevention_requests: true,
      membership_management: true,
      training_purchases: true,
      newsletter: true,
    },
    refactoring: {
      memberships: "✅ Refactorisé",
      emails: "✅ Refactorisé",
      trainings: "✅ REFACTORISÉ", // ← Nouveau !
      contact: "⏳ En cours",
      prevention: "⏳ En cours",
      payments: "⏳ En cours",
      health: "⏳ En cours",
    },
    modules: {
      emails: "✅ 9 fichiers modulaires",
      trainings: "✅ 3 fichiers modulaires", // ← Nouveau !
      templates: "✅ Centralisés",
      validation: "✅ Centralisée",
      core: "✅ Avec retry logic",
    },
  });
});

/**
 * GET /user-email/:userId
 * Récupère l'email d'un utilisateur (pour debug)
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
    // Vérification des variables d'environnement critiques
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
      logWithTimestamp("info", "✅ Backend Novapsy - TRAININGS REFACTORISÉS");
      logWithTimestamp(
        "info",
        "📁 Modules refactorisés: emails (9 fichiers) + trainings (3 fichiers)"
      );
      logWithTimestamp(
        "info",
        "🔧 Prochaines étapes: refactoriser payments, health, contact, prevention"
      );
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
