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
  getPriceFromPriceId,
  getTrainingDetails,
  calculateDiscountedPrice,
} = require("./shared/pricing");
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
  sendTrainingPurchaseConfirmationEmail,
} = require("./emails");

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

// ========================
// FONCTIONS MÉTIER - FORMATIONS
// ========================

/**
 * Crée un achat de formation
 * @param {object} metadata - Métadonnées de la session Stripe
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<object>} Données de l'achat créé
 */
async function createTrainingPurchase(metadata, session) {
  const {
    userId,
    trainingId,
    priceId,
    originalPrice,
    discountedPrice,
    isMember,
  } = metadata;

  logWithTimestamp("info", "=== 🎓 DÉBUT CRÉATION ACHAT FORMATION ===");
  logWithTimestamp("info", "📋 Metadata reçues", {
    userId,
    trainingId,
    priceId,
    originalPrice,
    discountedPrice,
    isMember,
    sessionId: session.id,
  });

  try {
    // Vérifier que l'achat n'existe pas déjà
    const { data: existingPurchase, error: checkError } = await supabase
      .from("trainings_purchase")
      .select("purchase_id")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      logWithTimestamp(
        "error",
        "Erreur vérification achat existant",
        checkError
      );
      throw checkError;
    }

    if (existingPurchase) {
      logWithTimestamp("warn", "⚠️ Achat déjà existant", {
        purchase_id: existingPurchase.purchase_id,
        session_id: session.id,
      });
      return existingPurchase;
    }

    // Récupérer les détails de la formation
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      throw new Error(`Formation non trouvée pour priceId: ${priceId}`);
    }

    logWithTimestamp("info", "📚 Détails formation", trainingDetails);

    // Données à insérer
    const purchaseData = {
      user_id: userId,
      training_id: trainingId,
      purchase_date: new Date().toISOString(),
      purchase_amount: parseFloat(discountedPrice),
      original_price: parseFloat(originalPrice),
      member_discount:
        isMember === "true"
          ? parseFloat(originalPrice) - parseFloat(discountedPrice)
          : 0,
      payment_status: "paid",
      stripe_session_id: session.id,
      hours_purchased: trainingDetails.duration,
      hours_consumed: 0,
    };

    logWithTimestamp(
      "info",
      "💾 Données achat formation à insérer",
      purchaseData
    );

    const { data: purchase, error: purchaseError } = await supabase
      .from("trainings_purchase")
      .insert(purchaseData)
      .select()
      .single();

    if (purchaseError) {
      logWithTimestamp("error", "❌ Erreur création achat formation", {
        error: purchaseError.message,
        code: purchaseError.code,
        details: purchaseError.details,
        purchaseData,
      });
      throw purchaseError;
    }

    logWithTimestamp("info", "✅ Achat formation créé avec succès", {
      purchase_id: purchase.purchase_id,
      user_id: purchase.user_id,
      training_id: purchase.training_id,
      amount: purchase.purchase_amount,
    });

    // Envoi email de confirmation via module refactorisé
    await sendTrainingPurchaseConfirmationEmail(
      userId,
      purchase,
      trainingDetails
    );

    logWithTimestamp(
      "info",
      "=== 🎉 FIN CRÉATION ACHAT FORMATION - SUCCÈS ==="
    );
    return purchase;
  } catch (error) {
    logWithTimestamp("error", "=== ❌ ERREUR CRÉATION ACHAT FORMATION ===", {
      error: error.message,
      code: error.code,
      details: error.details,
      metadata,
      sessionId: session.id,
    });
    throw error;
  }
}

// ========================
// ROUTES API - FORMATIONS
// ========================

/**
 * POST /create-training-checkout
 * Crée une session de paiement pour une formation avec réduction adhérent
 * Body: { priceId, userId, trainingId }
 */
app.post("/create-training-checkout", async (req, res) => {
  const { priceId, userId, trainingId } = req.body;

  logWithTimestamp("info", "=== CRÉATION SESSION FORMATION ===");
  logWithTimestamp("info", "Données reçues", { priceId, userId, trainingId });

  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!userId) return res.status(400).json({ error: "userId manquant" });
  if (!trainingId)
    return res.status(400).json({ error: "trainingId manquant" });

  try {
    const trainingDetails = getTrainingDetails(priceId);
    logWithTimestamp("info", "🎓 Training details récupérés", trainingDetails);

    if (!trainingDetails) {
      return res.status(400).json({ error: "Formation non trouvée" });
    }

    const isMember = await checkIfUserIsMember(userId);
    logWithTimestamp("info", "👤 Statut adhérent vérifié", {
      userId,
      isMember,
    });

    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);
    logWithTimestamp("info", "💰 Prix calculé", {
      originalPrice: trainingDetails.base_price || trainingDetails.price,
      isMember,
      finalPrice,
      memberDiscount: trainingDetails.member_discount || 0,
    });

    // Récupérer l'email de l'utilisateur
    const userEmail = await getMailByUser(userId);

    const sessionConfig = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Formation ${trainingDetails.name}`,
              description: `${trainingDetails.full_name} - ${trainingDetails.duration} heures`,
              metadata: {
                training_type: trainingDetails.training_type,
                duration: trainingDetails.duration.toString(),
              },
            },
            unit_amount: Math.round(finalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/success-training?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/formations`,
      payment_method_types: ["card"],
      metadata: {
        userId: userId.toString(),
        trainingId: trainingId.toString(),
        priceId: priceId,
        originalPrice: (
          trainingDetails.base_price || trainingDetails.price
        ).toString(),
        discountedPrice: finalPrice.toString(),
        isMember: isMember.toString(),
        type: "training_purchase",
        trainingName: trainingDetails.full_name,
        duration: trainingDetails.duration.toString(),
      },
      customer_creation: "always",
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Formation ${trainingDetails.full_name}`,
          metadata: {
            type: "training_purchase",
            userId: userId.toString(),
            trainingId: trainingId.toString(),
          },
        },
      },
    };

    // Si on a un email, l'ajouter
    if (userEmail) {
      sessionConfig.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logWithTimestamp("info", "✅ Session Stripe formation créée avec succès", {
      sessionId: session.id,
      originalPrice: trainingDetails.base_price || trainingDetails.price,
      finalPrice: finalPrice,
      stripeAmount: Math.round(finalPrice * 100),
      discount: isMember ? trainingDetails.member_discount || 0 : 0,
      isMember,
      customerCreation: "always",
    });

    res.status(200).json({
      url: session.url,
      training_details: {
        name: trainingDetails.name,
        full_name: trainingDetails.full_name,
        original_price: trainingDetails.base_price || trainingDetails.price,
        final_price: finalPrice,
        discount: isMember ? trainingDetails.member_discount || 0 : 0,
        is_member: isMember,
      },
    });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe formation", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /check-training-purchase/:userId/:trainingId
 * Vérifie si un utilisateur a déjà acheté une formation
 */
app.get("/check-training-purchase/:userId/:trainingId", async (req, res) => {
  const { userId, trainingId } = req.params;

  try {
    const { data, error } = await supabase
      .from("trainings_purchase")
      .select("*")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .single();

    if (error && error.code !== "PGRST116") {
      logWithTimestamp("error", "Erreur vérification achat formation", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      purchased: !!data,
      purchase_details: data || null,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification achat formation", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /process-training-purchase
 * Traite le succès d'un paiement de formation
 */
app.post("/process-training-purchase", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS FORMATION ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    logWithTimestamp("info", "Session Stripe récupérée", {
      id: session.id,
      payment_status: session.payment_status,
      mode: session.mode,
    });

    if (session.payment_status === "paid") {
      await createTrainingPurchase(session.metadata, session);
      logWithTimestamp(
        "info",
        "Achat formation créé avec succès pour la session",
        session.id
      );
      res.json({ success: true, message: "Formation achetée avec succès" });
    } else {
      logWithTimestamp("warn", "Paiement non confirmé", session.payment_status);
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur traitement succès formation", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /training-details/:priceId/:userId
 * Récupère les détails d'une formation avec prix calculé
 */
app.get("/training-details/:priceId/:userId", async (req, res) => {
  const { priceId, userId } = req.params;

  logWithTimestamp("info", "Récupération détails formation", {
    priceId,
    userId,
  });

  try {
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    const isMember = await checkIfUserIsMember(userId);
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

    res.json({
      ...trainingDetails,
      final_price: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      is_member: isMember,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération détails formation", error);
    res.status(500).json({ error: error.message });
  }
});

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
    version: "2.2.0-emails-refactored",
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
      emails: "✅ REFACTORISÉ COMPLET", // ← Mise à jour
      trainings: "⏳ En cours",
      contact: "⏳ En cours",
      prevention: "⏳ En cours",
    },
    modules: {
      emails: "✅ 9 fichiers modulaires",
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
      logWithTimestamp(
        "info",
        "✅ Backend Novapsy - EMAILS REFACTORISÉS COMPLETS"
      );
      logWithTimestamp(
        "info",
        "📁 Modules emails: 9 fichiers modulaires avec templates centralisés"
      );
      logWithTimestamp(
        "info",
        "🔧 Prochaines étapes: refactoriser trainings, contact, prevention"
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
