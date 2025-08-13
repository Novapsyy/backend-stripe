const { stripe } = require('../config/stripe');
const { logWithTimestamp } = require('../utils/logger');

/**
 * Crée une facture Stripe pour un paiement unique si elle n'existe pas
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<string|null>} ID de la facture créée ou null
 */
async function createInvoiceForPayment(session) {
  try {
    logWithTimestamp("info", "Création facture pour paiement", session.id);

    if (!session.payment_intent) {
      logWithTimestamp(
        "warn",
        "Pas de payment_intent dans la session",
        session.id
      );
      return null;
    }

    // Récupérer le payment_intent avec les charges
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent,
      {
        expand: ["charges.data", "latest_charge"],
      }
    );

    // Si pas de customer, on ne peut pas créer de facture
    // Retourner le payment_intent pour utiliser le reçu de charge à la place
    if (!paymentIntent.customer && !session.customer) {
      logWithTimestamp(
        "warn",
        "Pas de customer pour créer une facture, utilisation du reçu de charge",
        paymentIntent.id
      );

      // Vérifier si on a un reçu de charge disponible
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        const charge = paymentIntent.charges.data[0];
        if (charge.receipt_url) {
          logWithTimestamp(
            "info",
            "Reçu de charge disponible",
            charge.receipt_url
          );
        }
      }

      return paymentIntent.id; // Retourner le payment_intent ID pour utiliser le reçu
    }

    const customerId = paymentIntent.customer || session.customer;

    // Vérifier si une facture existe déjà
    const existingInvoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    const existingInvoice = existingInvoices.data.find(
      (inv) => inv.payment_intent === paymentIntent.id
    );

    if (existingInvoice) {
      logWithTimestamp("info", "Facture existante trouvée", existingInvoice.id);
      return existingInvoice.id;
    }

    // Pour les paiements déjà effectués, on ne peut pas créer de facture rétroactivement
    // Retourner le payment_intent pour utiliser le reçu
    logWithTimestamp(
      "info",
      "Paiement déjà effectué, utilisation du reçu au lieu de créer une facture",
      paymentIntent.id
    );
    return paymentIntent.id;
  } catch (error) {
    logWithTimestamp("error", "Erreur création facture", error);
    return null;
  }
}

/**
 * Récupère l'ID de la facture ou du reçu pour un paiement
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<string|null>} ID de la facture/reçu ou null
 */
async function getInvoiceFromPayment(session) {
  try {
    logWithTimestamp("info", "Récupération Invoice pour paiement", session.id);

    // 1. Si on a déjà une invoice dans la session, l'utiliser
    if (session.invoice) {
      logWithTimestamp(
        "info",
        "Invoice trouvée dans la session",
        session.invoice
      );
      return session.invoice;
    }

    // 2. Chercher une facture existante via payment_intent
    if (session.payment_intent) {
      const invoices = await stripe.invoices.list({
        limit: 100,
        expand: ["data.payment_intent"],
      });

      const invoice = invoices.data.find(
        (inv) => inv.payment_intent === session.payment_intent
      );

      if (invoice) {
        logWithTimestamp(
          "info",
          "Invoice trouvée via payment_intent",
          invoice.id
        );
        return invoice.id;
      }
    }

    // 3. Si pas de facture mais un payment_intent, retourner le payment_intent pour le reçu
    if (session.payment_intent) {
      logWithTimestamp(
        "info",
        "Pas de facture trouvée, utilisation du payment_intent comme reçu",
        session.payment_intent
      );
      return session.payment_intent;
    }

    logWithTimestamp(
      "warn",
      "Aucune Invoice ou payment_intent trouvé pour le paiement",
      session.id
    );
    return null;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération Invoice paiement", error);
    return null;
  }
}

/**
 * Récupère un reçu depuis un payment_intent
 * @param {string} paymentIntentId - ID du payment_intent
 * @returns {Promise<object|null>} Données du reçu ou null
 */
async function getReceiptFromPaymentIntent(paymentIntentId) {
  try {
    logWithTimestamp(
      "info",
      "Récupération reçu depuis payment_intent",
      paymentIntentId
    );

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["charges.data", "latest_charge"],
      }
    );

    if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
      const charge = paymentIntent.charges.data[0];
      if (charge.receipt_url) {
        logWithTimestamp(
          "info",
          "Reçu trouvé via charge",
          charge.receipt_url
        );
        return {
          type: "receipt",
          url: charge.receipt_url,
          charge_id: charge.id,
          payment_intent_id: paymentIntentId,
        };
      }
    }

    logWithTimestamp(
      "warn",
      "Aucun reçu trouvé pour le payment_intent",
      paymentIntentId
    );
    return null;
  } catch (error) {
    logWithTimestamp(
      "error",
      "Erreur récupération reçu payment_intent",
      error
    );
    return null;
  }
}

module.exports = {
  createInvoiceForPayment,
  getInvoiceFromPayment,
  getReceiptFromPaymentIntent
};