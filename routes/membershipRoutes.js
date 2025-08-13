const express = require("express");
require("dotenv").config();
const router = express.Router();
const { stripe } = require("../config/stripe");
const { FRONTEND_URL } = require("../config/constants");
const { logWithTimestamp } = require("../utils/logger");
const { getMailByUser } = require("../services/userService");
const { createMembership } = require("../services/membershipService");
const {
  getInvoiceFromPayment,
  getReceiptFromPaymentIntent,
} = require("../services/stripeService");

/**
 * POST /create-checkout-session
 * Crée une session de paiement Stripe pour un forfait d'adhésion d'un an
 * Body: { priceId, userId, associationId, userType, statusId, successUrl?, cancelUrl? }
 */
router.post("/create-checkout-session", async (req, res) => {
  const {
    priceId,
    userId,
    associationId,
    userType,
    statusId,
    successUrl,
    cancelUrl,
  } = req.body;

  logWithTimestamp("info", "=== CRÉATION SESSION FORFAIT ADHÉSION ===");
  logWithTimestamp("info", "Données reçues", {
    priceId,
    userId,
    associationId,
    userType,
    statusId,
    successUrl,
    cancelUrl,
  });

  // Validation des paramètres
  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!statusId) return res.status(400).json({ error: "statusId manquant" });
  if (
    !userType ||
    (userType === "user" && !userId) ||
    (userType === "association" && !associationId)
  ) {
    return res
      .status(400)
      .json({ error: "Informations utilisateur manquantes" });
  }

  try {
    // Récupérer l'email de l'utilisateur pour créer un customer
    let customerEmail = null;
    if (userType === "user" && userId) {
      customerEmail = await getMailByUser(userId);
    }

    // URLs par défaut ou personnalisées
    const defaultSuccessUrl = `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${FRONTEND_URL}/pricing`;

    const sessionConfig = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      payment_method_types: ["card"],
      metadata: {
        userId: userId || "",
        associationId: associationId || "",
        userType: userType,
        priceId: priceId,
        statusId: statusId.toString(),
        type: "membership_onetime",
      },
      // IMPORTANT: Ajouter ces options pour créer automatiquement un customer
      customer_creation: "always", // Force la création d'un customer
      invoice_creation: {
        enabled: true, // Active la création automatique de facture
        invoice_data: {
          description:
            userType === "association"
              ? "Adhésion Novapsy - Association"
              : "Adhésion Novapsy - Forfait annuel",
          metadata: {
            type: "membership_onetime",
            userId: userId || "",
            associationId: associationId || "",
            userType: userType,
          },
        },
      },
    };

    // Si on a un email, l'ajouter pour pré-remplir le formulaire
    if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logWithTimestamp(
      "info",
      "Session Stripe forfait adhésion créée avec succès",
      {
        sessionId: session.id,
        userType: userType,
        successUrl: sessionConfig.success_url,
        customerCreation: "always",
        invoiceCreation: true,
      }
    );
    res.status(200).json({ url: session.url });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe forfait", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /process-payment-success
 * Traite le succès d'un paiement de forfait d'adhésion
 * Body: { sessionId }
 */
router.post("/process-payment-success", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS PAIEMENT FORFAIT ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      await createMembership(session.metadata, session);
      res.json({
        success: true,
        message: "Forfait adhésion acheté avec succès",
      });
    } else {
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp(
      "error",
      "Erreur traitement succès paiement forfait",
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /membership-status/:userId/:userType
 * Vérifie le statut d'adhésion d'un utilisateur ou d'une association
 */
router.get("/membership-status/:userId/:userType", async (req, res) => {
  const { userId, userType } = req.params;

  logWithTimestamp("info", "=== VÉRIFICATION STATUT ADHÉSION ===", {
    userId,
    userType,
  });

  try {
    const { supabase } = require("../config/database");
    let query;
    
    if (userType === "user") {
      query = supabase
        .from("users_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            membership_price,
            status_id,
            stripe_invoice_id,
            stripe_session_id,
            status (
              status_name
            )
          )
        `
        )
        .eq("user_id", userId);
    } else {
      query = supabase
        .from("associations_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            membership_price,
            status_id,
            stripe_invoice_id,
            stripe_session_id,
            status (
              status_name
            )
          )
        `
        )
        .eq("association_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      logWithTimestamp("error", "Erreur récupération statut", error);
      return res.status(500).json({ error: error.message });
    }

    logWithTimestamp("info", "Statut adhésion vérifié", {
      userId,
      userType,
      membershipCount: data?.length || 0,
    });

    res.json({ memberships: data });
  } catch (err) {
    logWithTimestamp("error", "Erreur vérification statut", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /receipt/:invoiceId
 * Récupère un reçu Stripe par son ID de facture ou payment_intent
 * Params: invoiceId (string)
 */
router.get("/receipt/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;

  logWithTimestamp("info", "Récupération reçu", invoiceId);

  try {
    // 1. Essayer de récupérer comme une facture
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ["charge", "payment_intent.charges"],
      });

      const receiptData = {
        id: invoice.id,
        invoice_number: invoice.number,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        created: invoice.created,
        customer_email: invoice.customer_email,
        description: `Facture ${invoice.number || invoice.id}`,
        period_start: invoice.period_start,
        period_end: invoice.period_end,
        receipt_type: "invoice",
      };

      if (invoice.hosted_invoice_url) {
        receiptData.receipt_url = invoice.hosted_invoice_url;
        receiptData.receipt_type = "hosted_invoice";
        return res.json(receiptData);
      }

      if (invoice.invoice_pdf) {
        receiptData.receipt_url = invoice.invoice_pdf;
        receiptData.receipt_type = "invoice_pdf";
        return res.json(receiptData);
      }
    } catch (invoiceError) {
      // Si ce n'est pas une facture, essayer comme payment_intent
      logWithTimestamp(
        "info",
        "Pas une facture, essai comme payment_intent",
        invoiceId
      );
    }

    // 2. Essayer de récupérer comme un payment_intent avec reçu de charge
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoiceId, {
        expand: [
          "charges.data",
          "latest_charge",
          "latest_charge.balance_transaction",
        ],
      });

      // Chercher un reçu dans les charges
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        for (const charge of paymentIntent.charges.data) {
          if (charge.receipt_url) {
            return res.json({
              id: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              status: paymentIntent.status,
              created: paymentIntent.created,
              description: charge.description || `Paiement ${paymentIntent.id}`,
              receipt_url: charge.receipt_url,
              receipt_type: "charge_receipt",
              charge_id: charge.id,
              receipt_number: charge.receipt_number,
            });
          }
        }
      }

      // Si pas de receipt_url, essayer de générer un reçu
      if (paymentIntent.latest_charge) {
        logWithTimestamp(
          "info",
          "Tentative de génération de reçu pour la charge",
          paymentIntent.latest_charge
        );

        // Pour un payment_intent sans reçu, informer l'utilisateur
        return res.status(404).json({
          error: "Reçu non disponible pour ce paiement",
          payment_intent_id: paymentIntent.id,
          suggestion:
            "Le paiement a été effectué mais aucun reçu n'a été généré. Contactez le support pour obtenir une attestation de paiement.",
          payment_info: {
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            created: new Date(paymentIntent.created * 1000).toISOString(),
          },
        });
      }
    } catch (paymentError) {
      logWithTimestamp(
        "warn",
        "Pas un payment_intent valide",
        paymentError.message
      );
    }

    // 3. Aucun reçu disponible
    return res.status(404).json({
      error: "Document non trouvé",
      invoice_id: invoiceId,
      suggestion:
        "Ce document n'existe pas ou n'est plus disponible. Si c'est un ancien paiement, utilisez le bouton 'Find Session' pour retrouver les informations.",
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération reçu", error);
    res.status(500).json({
      error: error.message,
      suggestion:
        "Une erreur est survenue. Veuillez réessayer ou contacter le support.",
    });
  }
});

module.exports = router;
