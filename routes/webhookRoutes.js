const express = require('express');
const router = express.Router();
const { stripe } = require('../config/stripe');
const { WEBHOOK_SECRET } = require('../config/constants');
const { logWithTimestamp } = require('../utils/logger');
const { createMembership } = require('../services/membershipService');
const { createTrainingPurchase } = require('../services/trainingService');

/**
 * POST /webhook
 * Gère les webhooks Stripe pour les événements de paiement
 */
router.post('/', async (req, res) => {
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

module.exports = router;