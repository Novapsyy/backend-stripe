const { supabase } = require('../config/database');
const { logWithTimestamp } = require('../utils/logger');
const { getTrainingDetails } = require('./priceService');
const { sendTrainingPurchaseConfirmationEmail } = require('./emailService');

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

    // Envoi email de confirmation
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

module.exports = {
  createTrainingPurchase
};