const { supabase } = require("../config/database");
const { logWithTimestamp } = require("../shared/logger");
const { getTrainingDetails } = require("../shared/pricing");
const {
  sendTrainingPurchaseConfirmationEmail,
  sendTrainingRefundEmail,
} = require("../emails");
const { stripe } = require("../config/stripe");
const { REFUND_RULES } = require("../config/constants");

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

    // Résoudre le payment_intent_id : direct sur la session ou via l'invoice
    // (quand invoice_creation est activé, Stripe l'attache parfois à l'invoice)
    let paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

    if (!paymentIntentId && session.invoice) {
      const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id;
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        paymentIntentId = typeof invoice.payment_intent === "string"
          ? invoice.payment_intent
          : invoice.payment_intent?.id || null;
        logWithTimestamp("info", "💳 payment_intent_id récupéré via invoice", { invoiceId, paymentIntentId });
      }
    }

    logWithTimestamp("info", "💳 payment_intent_id résolu", { paymentIntentId });

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
      payment_intent_id: paymentIntentId,
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

/**
 * Calcule le pourcentage de remboursement selon la date de début de session
 * @param {Date} sessionFirstDay - Date du premier jour de la session
 * @returns {{ percent: number, daysUntil: number }}
 */
function computeRefundPercent(sessionFirstDay) {
  const now = new Date();
  const daysUntil = Math.ceil(
    (sessionFirstDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  let percent = 0;
  if (daysUntil >= REFUND_RULES.FULL_REFUND_DAYS) {
    percent = 100;
  } else if (daysUntil >= REFUND_RULES.PARTIAL_REFUND_DAYS) {
    percent = REFUND_RULES.PARTIAL_REFUND_PERCENT;
  }

  return { percent, daysUntil };
}

/**
 * Annule un achat de formation et émet un remboursement Stripe selon les règles métier
 * @param {number} purchaseId - ID de l'achat dans trainings_purchase
 * @param {string} userId - UUID de l'utilisateur (sécurité)
 * @returns {Promise<object>} Résultat de l'annulation
 */
async function cancelTrainingPurchase(purchaseId, userId) {
  logWithTimestamp("info", "=== 🔄 DÉBUT ANNULATION FORMATION ===", {
    purchaseId,
    userId,
  });

  try {
    // 1. Récupérer l'achat et vérifier l'appartenance
    const { data: purchase, error: purchaseError } = await supabase
      .from("trainings_purchase")
      .select("*")
      .eq("purchase_id", purchaseId)
      .eq("user_id", userId)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) {
      throw Object.assign(new Error("Achat introuvable ou accès non autorisé"), { status: 404 });
    }
    if (purchase.payment_status === "refunded") {
      throw Object.assign(new Error("Cet achat a déjà été remboursé"), { status: 409 });
    }
    if (purchase.payment_status === "cancelled") {
      throw Object.assign(new Error("Cet achat a déjà été annulé"), { status: 409 });
    }

    // 2. Trouver la session de l'utilisateur pour cette formation
    const { data: userTraining, error: utError } = await supabase
      .from("users_trainings")
      .select("session_id")
      .eq("user_id", userId)
      .eq("training_id", purchase.training_id)
      .maybeSingle();

    if (utError) throw utError;

    // 3. Récupérer la date du premier jour de la session
    let sessionFirstDay = null;
    if (userTraining?.session_id) {
      const { data: days, error: daysError } = await supabase
        .from("session_days")
        .select("day_date")
        .eq("session_id", userTraining.session_id)
        .order("day_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (daysError) throw daysError;
      if (days?.day_date) {
        sessionFirstDay = new Date(days.day_date);
      }
    }

    // 4. Calculer le remboursement
    let refundPercent = 100;
    let daysUntil = null;

    if (sessionFirstDay) {
      const result = computeRefundPercent(sessionFirstDay);
      refundPercent = result.percent;
      daysUntil = result.daysUntil;
    }

    logWithTimestamp("info", "💰 Calcul remboursement", {
      purchaseId,
      sessionFirstDay,
      daysUntil,
      refundPercent,
      purchaseAmount: purchase.purchase_amount,
    });

    const refundAmount = Math.floor((purchase.purchase_amount * refundPercent) / 100);

    // 5. Émettre le remboursement Stripe si montant > 0
    let stripeRefund = null;
    if (refundAmount > 0) {
      if (!purchase.payment_intent_id) {
        throw Object.assign(
          new Error("payment_intent_id manquant, remboursement impossible"),
          { status: 422 }
        );
      }

      stripeRefund = await stripe.refunds.create({
        payment_intent: purchase.payment_intent_id,
        amount: refundAmount * 100, // centimes
        reason: "requested_by_customer",
        metadata: {
          purchase_id: purchaseId.toString(),
          user_id: userId,
          refund_percent: refundPercent.toString(),
          days_until_training: daysUntil !== null ? daysUntil.toString() : "unknown",
        },
      });

      logWithTimestamp("info", "✅ Remboursement Stripe créé", {
        refundId: stripeRefund.id,
        amount: refundAmount,
        percent: refundPercent,
      });
    }

    // 6. Mettre à jour le statut dans la BDD
    const newStatus = refundPercent === 100 ? "refunded" : refundPercent > 0 ? "partially_refunded" : "cancelled";

    const { error: updateError } = await supabase
      .from("trainings_purchase")
      .update({
        payment_status: newStatus,
        refund_amount: refundAmount,
        refund_date: new Date().toISOString(),
        stripe_refund_id: stripeRefund?.id || null,
      })
      .eq("purchase_id", purchaseId);

    if (updateError) throw updateError;

    // 7. Supprimer l'inscription à la session si elle existe
    if (userTraining?.session_id) {
      await supabase
        .from("users_trainings")
        .delete()
        .eq("user_id", userId)
        .eq("training_id", purchase.training_id);
    }

    // 8. Envoyer l'email de confirmation
    const trainingDetails = getTrainingDetails(purchase.stripe_session_id) || {
      name: purchase.training_id,
      full_name: purchase.training_id,
    };

    await sendTrainingRefundEmail(userId, {
      purchase,
      refundAmount,
      refundPercent,
      daysUntil,
      sessionFirstDay,
      stripeRefundId: stripeRefund?.id || null,
      trainingDetails,
    });

    const result = {
      success: true,
      purchase_id: purchaseId,
      refund_percent: refundPercent,
      refund_amount: refundAmount,
      days_until_training: daysUntil,
      stripe_refund_id: stripeRefund?.id || null,
      new_status: newStatus,
    };

    logWithTimestamp("info", "=== 🎉 ANNULATION FORMATION TERMINÉE ===", result);
    return result;
  } catch (error) {
    logWithTimestamp("error", "=== ❌ ERREUR ANNULATION FORMATION ===", {
      error: error.message,
      purchaseId,
      userId,
    });
    throw error;
  }
}

module.exports = {
  createTrainingPurchase,
  checkTrainingPurchase,
  getTrainingDetailsForUser,
  cancelTrainingPurchase,
};
