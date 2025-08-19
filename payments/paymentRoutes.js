const express = require("express");
const router = express.Router();

const { stripe } = require("../config/stripe");
const { logWithTimestamp } = require("../shared/logger");
const { validateRequest, validationSchemas } = require("../shared/validation");
const {
  createCheckoutSession,
  handleWebhook,
  createInvoice,
  retrievePaymentIntent,
  processPaymentSuccess,
  processPaymentFailure,
  createPaymentAttestation,
  getReceipt,
} = require("./paymentService");

/**
 * POST /webhook
 * Gestionnaire des webhooks Stripe pour les paiements
 * IMPORTANT: Cette route doit être déclarée AVANT express.json() dans server.js
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    logWithTimestamp("info", "🔔 Webhook Stripe reçu via module payments");

    try {
      const result = await handleWebhook(req.body, sig);

      logWithTimestamp("info", "✅ Webhook traité avec succès", {
        type: result.type,
        processed: result.processed,
      });

      res.json({ received: true });
    } catch (error) {
      logWithTimestamp("error", "❌ Erreur webhook dans routes", {
        error: error.message,
      });

      if (error.message.includes("Invalid signature")) {
        return res.status(400).send(`Webhook Error: ${error.message}`);
      }

      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /create-checkout-session
 * Crée une session de paiement Stripe générique
 * Body: { priceId, userId, userEmail, type, metadata, successUrl?, cancelUrl? }
 */
router.post(
  "/create-checkout-session",
  validateRequest(validationSchemas.checkoutSession),
  async (req, res) => {
    const {
      priceId,
      userId,
      userEmail,
      type, // 'membership', 'training', 'prevention', etc.
      metadata = {},
      successUrl,
      cancelUrl,
    } = req.body;

    logWithTimestamp("info", "=== CRÉATION SESSION CHECKOUT GÉNÉRIQUE ===", {
      priceId,
      userId,
      type,
      userEmail,
    });

    try {

    const session = await createCheckoutSession({
      priceId,
      userId,
      userEmail,
      type,
      metadata,
      successUrl,
      cancelUrl,
    });

    logWithTimestamp("info", "✅ Session checkout créée avec succès", {
      sessionId: session.id,
      type,
      amount: session.amount_total / 100,
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      payment_details: {
        type,
        amount: session.amount_total / 100,
        currency: session.currency,
      },
    });
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur création session checkout", {
      error: error.message,
      priceId,
      userId,
      type,
    });

    res.status(500).json({
      error: error.message,
      suggestion: "Vérifiez les paramètres de paiement",
    });
  }
});

/**
 * POST /process-payment-success
 * Traite le succès d'un paiement générique
 * Body: { sessionId }
 */
router.post(
  "/process-payment-success",
  validateRequest(validationSchemas.paymentSuccess),
  async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS PAIEMENT GÉNÉRIQUE ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId manquant" });
  }

  try {
    const result = await processPaymentSuccess(sessionId);

    logWithTimestamp("info", "✅ Paiement traité avec succès", {
      sessionId,
      type: result.type,
    });

    res.json({
      success: true,
      message: "Paiement traité avec succès",
      payment: result,
    });
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur traitement succès paiement", {
      sessionId,
      error: error.message,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /receipt/:invoiceId
 * Récupère un reçu ou une facture
 */
router.get(
  "/receipt/:invoiceId",
  validateRequest(validationSchemas.invoiceId),
  async (req, res) => {
  const { invoiceId } = req.params;

  logWithTimestamp("info", "=== RÉCUPÉRATION REÇU ===", {
    invoiceId,
  });

  try {
    const receipt = await getReceipt(invoiceId);

    if (!receipt) {
      return res.status(404).json({
        error: "Reçu non trouvé",
        invoice_id: invoiceId,
        suggestion: "Vérifiez l'ID du reçu ou de la facture",
      });
    }

    logWithTimestamp("info", "✅ Reçu récupéré avec succès", {
      invoiceId,
      type: receipt.receipt_type,
    });

    res.json(receipt);
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur récupération reçu", {
      invoiceId,
      error: error.message,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /create-invoice
 * Crée une facture pour un paiement
 * Body: { paymentIntentId, customerId?, metadata? }
 */
router.post("/create-invoice", async (req, res) => {
  const { paymentIntentId, customerId, metadata = {} } = req.body;

  logWithTimestamp("info", "=== CRÉATION FACTURE ===", {
    paymentIntentId,
    customerId,
  });

  try {
    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId requis" });
    }

    const invoice = await createInvoice({
      paymentIntentId,
      customerId,
      metadata,
    });

    logWithTimestamp("info", "✅ Facture créée avec succès", {
      invoiceId: invoice.id,
      paymentIntentId,
    });

    res.json({
      success: true,
      invoice,
    });
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur création facture", {
      paymentIntentId,
      error: error.message,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /payment-intent/:paymentIntentId
 * Récupère les détails d'un payment intent
 */
router.get(
  "/payment-intent/:paymentIntentId",
  validateRequest(validationSchemas.paymentIntentId),
  async (req, res) => {
  const { paymentIntentId } = req.params;

  logWithTimestamp("info", "=== RÉCUPÉRATION PAYMENT INTENT ===", {
    paymentIntentId,
  });

  try {
    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    logWithTimestamp("info", "✅ Payment Intent récupéré", {
      paymentIntentId,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
    });

    res.json(paymentIntent);
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur récupération payment intent", {
      paymentIntentId,
      error: error.message,
    });

    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /create-payment-attestation/:paymentIntentId
 * Crée une attestation de paiement pour un payment_intent
 */
router.post(
  "/create-payment-attestation/:paymentIntentId",
  validateRequest(validationSchemas.paymentIntentId),
  async (req, res) => {
    const { paymentIntentId } = req.params;

    logWithTimestamp("info", "=== CRÉATION ATTESTATION DE PAIEMENT ===", {
      paymentIntentId,
    });

    try {
      const attestation = await createPaymentAttestation(paymentIntentId);

      logWithTimestamp("info", "✅ Attestation créée avec succès", {
        paymentIntentId,
        amount: attestation.amount,
        currency: attestation.currency,
      });

      res.json({
        success: true,
        attestation,
        message: "Attestation de paiement générée avec succès",
      });
    } catch (error) {
      logWithTimestamp("error", "❌ Erreur création attestation", {
        paymentIntentId,
        error: error.message,
      });

      res.status(500).json({
        error: error.message,
        suggestion: "Vérifiez que l'ID du paiement est correct",
      });
    }
  }
);

module.exports = router;
