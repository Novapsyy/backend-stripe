const express = require('express');
const router = express.Router();
const { stripe } = require('../config/stripe');
const { FRONTEND_URL } = require('../config/constants');
const { logWithTimestamp } = require('../utils/logger');
const { getTrainingDetails, calculateDiscountedPrice } = require('../services/priceService');
const { getMailByUser, checkIfUserIsMember } = require('../services/userService');
const { createTrainingPurchase } = require('../services/trainingService');
const { supabase } = require('../config/database');

/**
 * POST /create-training-checkout
 * Crée une session de paiement Stripe pour une formation
 * Body: { priceId, userId, trainingId }
 */
router.post('/create-training-checkout', async (req, res) => {
  const { priceId, userId, trainingId } = req.body;

  logWithTimestamp("info", "=== CRÉATION SESSION FORMATION ===");
  logWithTimestamp("info", "Données reçues", { priceId, userId, trainingId });

  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!userId) return res.status(400).json({ error: "userId manquant" });
  if (!trainingId)
    return res.status(400).json({ error: "trainingId manquant" });

  try {
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      return res.status(400).json({ error: "Formation non trouvée" });
    }

    const isMember = await checkIfUserIsMember(userId);
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

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
        originalPrice: trainingDetails.base_price.toString(),
        discountedPrice: finalPrice.toString(),
        isMember: isMember.toString(),
        type: "training_purchase",
        trainingName: trainingDetails.full_name,
        duration: trainingDetails.duration.toString(),
      },
      // IMPORTANT: Ajouter ces options pour créer automatiquement un customer
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

    logWithTimestamp("info", "Session Stripe formation créée avec succès", {
      sessionId: session.id,
      originalPrice: trainingDetails.base_price,
      finalPrice: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      isMember,
      customerCreation: "always",
    });

    res.status(200).json({
      url: session.url,
      training_details: {
        name: trainingDetails.name,
        full_name: trainingDetails.full_name,
        original_price: trainingDetails.base_price,
        final_price: finalPrice,
        discount: isMember ? trainingDetails.member_discount : 0,
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
router.get('/check-training-purchase/:userId/:trainingId', async (req, res) => {
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
router.post('/process-training-purchase', async (req, res) => {
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
router.get('/training-details/:priceId/:userId', async (req, res) => {
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

module.exports = router;