const { supabase } = require("../config/database");
const { stripe } = require("../config/stripe");
const { FRONTEND_URL, WEBHOOK_SECRET } = require("../config/constants");
const { logWithTimestamp } = require("../shared/logger");
const { getPriceFromPriceId } = require("../shared/pricing");

// Import des services spécialisés
const { createMembership } = require("../memberships/membershipService");
const { createTrainingPurchase } = require("../trainings/trainingService");

/**
 * Crée une session de checkout Stripe générique
 * @param {Object} params - Paramètres de la session
 * @param {string} params.priceId - ID du prix Stripe
 * @param {string} params.userId - ID de l'utilisateur
 * @param {string} params.userEmail - Email de l'utilisateur
 * @param {string} params.type - Type de paiement (membership, training, prevention, etc.)
 * @param {Object} params.metadata - Métadonnées additionnelles
 * @param {string} params.successUrl - URL de succès (optionnel)
 * @param {string} params.cancelUrl - URL d'annulation (optionnel)
 * @returns {Promise<Object>} Session Stripe
 */
async function createCheckoutSession({
  priceId,
  userId,
  userEmail,
  type,
  metadata = {},
  successUrl,
  cancelUrl,
}) {
  try {
    logWithTimestamp("info", "🛒 Création session checkout générique", {
      priceId,
      userId,
      type,
      userEmail,
    });

    // URLs par défaut
    const defaultSuccessUrl = `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${FRONTEND_URL}/payment-cancel`;

    // Récupérer les détails du prix
    const priceDetails = await getPriceFromPriceId(priceId);
    if (!priceDetails) {
      throw new Error(`Prix non trouvé pour l'ID: ${priceId}`);
    }

    // Métadonnées de base
    const sessionMetadata = {
      type,
      userId,
      userEmail,
      priceId,
      ...metadata,
    };

    // Configuration de la session
    const sessionConfig = {
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      metadata: sessionMetadata,
      customer_email: userEmail,
      billing_address_collection: "required",
      payment_intent_data: {
        metadata: sessionMetadata,
      },
    };

    // Créer la session Stripe
    const session = await stripe.checkout.sessions.create(sessionConfig);

    logWithTimestamp("info", "✅ Session checkout créée", {
      sessionId: session.id,
      type,
      amount: session.amount_total / 100,
      currency: session.currency,
    });

    return session;
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur création session checkout", {
      error: error.message,
      priceId,
      userId,
      type,
    });
    throw error;
  }
}

/**
 * Traite le succès d'un paiement
 * @param {string} sessionId - ID de la session Stripe
 * @returns {Promise<Object>} Résultat du traitement
 */
async function processPaymentSuccess(sessionId) {
  try {
    logWithTimestamp("info", "🎉 Traitement succès paiement", { sessionId });

    // Récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "customer"],
    });

    if (session.payment_status !== "paid") {
      throw new Error(`Paiement non confirmé: ${session.payment_status}`);
    }

    const { type } = session.metadata;

    logWithTimestamp("info", "📋 Session récupérée", {
      sessionId,
      type,
      paymentStatus: session.payment_status,
      amount: session.amount_total / 100,
    });

    // Traitement selon le type
    let result;
    switch (type) {
      case "membership":
        result = await createMembership(session.metadata, session);
        break;
      case "training":
        result = await createTrainingPurchase(session.metadata, session);
        break;
      case "prevention":
        // TODO: Implémenter le traitement des paiements de prévention
        result = { type: "prevention", message: "Paiement prévention traité" };
        break;
      default:
        throw new Error(`Type de paiement non supporté: ${type}`);
    }

    logWithTimestamp("info", "✅ Paiement traité avec succès", {
      sessionId,
      type,
      result,
    });

    return {
      type,
      sessionId,
      paymentIntentId: session.payment_intent?.id,
      amount: session.amount_total / 100,
      currency: session.currency,
      result,
    };
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur traitement succès paiement", {
      sessionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Traite l'échec d'un paiement
 * @param {string} sessionId - ID de la session Stripe
 * @returns {Promise<Object>} Résultat du traitement
 */
async function processPaymentFailure(sessionId) {
  try {
    logWithTimestamp("warn", "❌ Traitement échec paiement", { sessionId });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const { type, userId } = session.metadata;

    // Log de l'échec
    logWithTimestamp("warn", "💳 Paiement échoué", {
      sessionId,
      type,
      userId,
      paymentStatus: session.payment_status,
    });

    // TODO: Implémenter la logique de nettoyage si nécessaire
    // Par exemple, supprimer des enregistrements temporaires

    return {
      type,
      sessionId,
      status: "failed",
      message: "Paiement échoué",
    };
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur traitement échec paiement", {
      sessionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Gère les webhooks Stripe
 * @param {Buffer} body - Corps de la requête
 * @param {string} signature - Signature Stripe
 * @returns {Promise<Object>} Résultat du traitement
 */
async function handleWebhook(body, signature) {
  try {
    // Vérifier la signature
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      WEBHOOK_SECRET
    );

    logWithTimestamp("info", "🔔 Webhook reçu", {
      type: event.type,
      id: event.id,
    });

    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        logWithTimestamp("info", "📋 Session checkout complétée", {
          id: session.id,
          type: session.metadata?.type || "unknown",
          payment_status: session.payment_status,
        });

        if (session.payment_status === "paid") {
          await processPaymentSuccess(session.id);
        }
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        logWithTimestamp("info", "💳 Payment Intent réussi", {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        });
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        logWithTimestamp("warn", "❌ Payment Intent échoué", {
          id: failedPayment.id,
          last_payment_error: failedPayment.last_payment_error?.message,
        });
        break;

      default:
        logWithTimestamp("info", "🔔 Événement webhook non traité", {
          type: event.type,
        });
    }

    return { processed: true, type: event.type };
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur webhook", {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Récupère les détails d'un payment intent
 * @param {string} paymentIntentId - ID du payment intent
 * @returns {Promise<Object>} Payment intent Stripe
 */
async function retrievePaymentIntent(paymentIntentId) {
  try {
    logWithTimestamp("info", "🔍 Récupération payment intent", {
      paymentIntentId,
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["customer", "latest_charge", "charges.data"],
      }
    );

    logWithTimestamp("info", "✅ Payment intent récupéré", {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    });

    return paymentIntent;
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur récupération payment intent", {
      paymentIntentId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Crée une facture pour un paiement
 * @param {Object} params - Paramètres de la facture
 * @param {string} params.paymentIntentId - ID du payment intent
 * @param {string} params.customerId - ID du customer (optionnel)
 * @param {Object} params.metadata - Métadonnées (optionnel)
 * @returns {Promise<Object>} Facture Stripe
 */
async function createInvoice({ paymentIntentId, customerId, metadata = {} }) {
  try {
    logWithTimestamp("info", "📄 Création facture", {
      paymentIntentId,
      customerId,
    });

    // Récupérer le payment intent
    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`Payment intent non réussi: ${paymentIntent.status}`);
    }

    // Utiliser le customer du payment intent si pas fourni
    const finalCustomerId = customerId || paymentIntent.customer;
    if (!finalCustomerId) {
      throw new Error("Aucun customer associé au paiement");
    }

    // Créer la facture
    const invoice = await stripe.invoices.create({
      customer: finalCustomerId,
      collection_method: "charge_automatically",
      auto_advance: false,
      metadata: {
        payment_intent_id: paymentIntentId,
        retroactive_invoice: "true",
        ...metadata,
      },
      description: "Facture Novapsy",
    });

    // Ajouter un item à la facture
    await stripe.invoiceItems.create({
      customer: finalCustomerId,
      invoice: invoice.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      description: `Paiement Novapsy - Référence: ${paymentIntentId}`,
      metadata: {
        payment_intent_id: paymentIntentId,
      },
    });

    // Finaliser et marquer comme payée
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
      paid_out_of_band: true,
    });

    logWithTimestamp("info", "✅ Facture créée avec succès", {
      invoiceId: paidInvoice.id,
      paymentIntentId,
      amount: paidInvoice.amount_paid / 100,
    });

    return paidInvoice;
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur création facture", {
      paymentIntentId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Récupère un reçu ou une facture
 * @param {string} invoiceId - ID de la facture ou du payment intent
 * @returns {Promise<Object|null>} Reçu ou facture
 */
async function getReceipt(invoiceId) {
  try {
    logWithTimestamp("info", "🧾 Récupération reçu", { invoiceId });

    // 1. Essayer comme facture Stripe
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      logWithTimestamp("info", "📄 Facture Stripe trouvée", {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
      });

      return {
        id: invoice.id,
        invoice_number: invoice.number,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        created: invoice.created,
        description: `Facture Stripe ${invoice.number}`,
        receipt_url: invoice.hosted_invoice_url,
        receipt_type: "stripe_invoice",
        invoice_pdf: invoice.invoice_pdf,
      };
    } catch (invoiceError) {
      logWithTimestamp("info", "Pas une facture Stripe", invoiceError.message);
    }

    // 2. Essayer comme payment intent
    try {
      const paymentIntent = await retrievePaymentIntent(invoiceId);

      // Chercher un reçu dans les charges
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        for (const charge of paymentIntent.charges.data) {
          if (charge.receipt_url) {
            logWithTimestamp("info", "🧾 Receipt URL trouvé", {
              chargeId: charge.id,
              receiptUrl: charge.receipt_url,
            });

            return {
              id: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              status: paymentIntent.status,
              created: paymentIntent.created,
              description: `Paiement ${paymentIntent.id}`,
              receipt_url: charge.receipt_url,
              receipt_type: "charge_receipt",
              charge_id: charge.id,
              receipt_number: charge.receipt_number,
            };
          }
        }
      }

      // Pas de reçu disponible
      logWithTimestamp("warn", "Aucun reçu disponible", {
        paymentIntentId: paymentIntent.id,
      });
      return null;
    } catch (paymentError) {
      logWithTimestamp("warn", "Pas un payment intent valide", {
        error: paymentError.message,
      });
    }

    return null;
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur récupération reçu", {
      invoiceId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Crée une attestation de paiement
 * @param {string} paymentIntentId - ID du payment intent
 * @returns {Promise<Object>} Attestation de paiement
 */
async function createPaymentAttestation(paymentIntentId) {
  try {
    logWithTimestamp("info", "📜 Création attestation paiement", {
      paymentIntentId,
    });

    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`Ce paiement n'est pas réussi: ${paymentIntent.status}`);
    }

    // Créer les données d'attestation
    const attestationData = {
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      status: "PAYÉ",
      created: paymentIntent.created,
      created_date: new Date(paymentIntent.created * 1000).toISOString(),
      description: `Attestation de paiement pour ${paymentIntent.id}`,
    };

    // Ajouter les détails de la charge si disponible
    if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
      const charge = paymentIntent.charges.data[0];
      if (charge) {
        attestationData.charge_id = charge.id;
        attestationData.payment_method =
          charge.payment_method_details?.type || "carte bancaire";
        attestationData.last4 = charge.payment_method_details?.card?.last4;
        attestationData.brand = charge.payment_method_details?.card?.brand;
      }
    }

    logWithTimestamp("info", "✅ Attestation créée", {
      paymentIntentId,
      amount: attestationData.amount,
      currency: attestationData.currency,
    });

    return attestationData;
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur création attestation", {
      paymentIntentId,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  processPaymentSuccess,
  processPaymentFailure,
  handleWebhook,
  retrievePaymentIntent,
  createInvoice,
  getReceipt,
  createPaymentAttestation,
};
