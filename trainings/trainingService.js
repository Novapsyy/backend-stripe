const { supabase } = require("../config/database");
const { logWithTimestamp } = require("../shared/logger");
const { getTrainingDetails } = require("../shared/pricing");
const { sendTrainingPurchaseConfirmationEmail } = require("../emails");

/**
 * Crée un achat de formation avec email de confirmation
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

/**
 * Vérifie si un utilisateur a déjà acheté une formation
 * @param {string} userId - UUID de l'utilisateur
 * @param {string} trainingId - ID de la formation
 * @returns {Promise<object>} Résultat de la vérification
 */
async function checkTrainingPurchase(userId, trainingId) {
  try {
    logWithTimestamp("info", "Vérification achat formation", {
      userId,
      trainingId,
    });

    const { data, error } = await supabase
      .from("trainings_purchase")
      .select("*")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .single();

    if (error && error.code !== "PGRST116") {
      logWithTimestamp("error", "Erreur vérification achat formation", error);
      throw error;
    }

    const purchased = !!data;
    logWithTimestamp("info", "Résultat vérification achat", {
      userId,
      trainingId,
      purchased,
    });

    return {
      purchased,
      purchase_details: data || null,
    };
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification achat formation", {
      userId,
      trainingId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Récupère les détails d'une formation avec prix calculé pour un utilisateur
 * @param {string} priceId - ID du prix Stripe
 * @param {string} userId - UUID de l'utilisateur
 * @param {function} checkIfUserIsMember - Fonction pour vérifier le statut membre
 * @param {function} calculateDiscountedPrice - Fonction pour calculer le prix final
 * @returns {Promise<object>} Détails de la formation avec prix
 */
async function getTrainingDetailsForUser(
  priceId,
  userId,
  checkIfUserIsMember,
  calculateDiscountedPrice
) {
  try {
    logWithTimestamp(
      "info",
      "Récupération détails formation pour utilisateur",
      {
        priceId,
        userId,
      }
    );

    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      throw new Error(`Formation non trouvée pour priceId: ${priceId}`);
    }

    const isMember = await checkIfUserIsMember(userId);
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

    const result = {
      ...trainingDetails,
      final_price: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      is_member: isMember,
    };

    logWithTimestamp("info", "Détails formation calculés", {
      priceId,
      userId,
      originalPrice: trainingDetails.base_price,
      finalPrice,
      discount: result.discount,
      isMember,
    });

    return result;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération détails formation", {
      priceId,
      userId,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createTrainingPurchase,
  checkTrainingPurchase,
  getTrainingDetailsForUser,
};
