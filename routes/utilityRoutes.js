const express = require('express');
const router = express.Router();
const { FROM_EMAIL, CONTACT_EMAIL } = require('../config/constants');
const { supabase } = require('../config/database');
const { logWithTimestamp } = require('../utils/logger');
const { getMailByUser } = require('../services/userService');
const { sendEmail } = require('../services/emailService');

/**
 * GET /health
 * Endpoint de santé pour vérifier le statut du service
 */
router.get('/health', (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "2.0.0-contact-focused",
    services: {
      email: {
        configured: !!process.env.RESEND_API_KEY,
        from: FROM_EMAIL,
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
    },
  });
});

/**
 * GET /user-email/:userId
 * Récupère l'email d'un utilisateur (pour debug)
 * Params: userId (UUID)
 */
router.get('/user-email/:userId', async (req, res) => {
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

/**
 * POST /send-newsletter
 * Envoie une newsletter à tous les abonnés
 * Body: { subject, html }
 */
router.post('/send-newsletter', async (req, res) => {
  const { subject, html } = req.body;

  logWithTimestamp("info", "=== ENVOI NEWSLETTER ===");
  logWithTimestamp("info", "Données reçues", { subject });

  if (!subject) {
    return res.status(400).json({ error: "Le sujet est requis" });
  }

  if (!html) {
    return res.status(400).json({ error: "Le contenu HTML est requis" });
  }

  try {
    // Récupérer les emails des utilisateurs abonnés à la newsletter
    const { data: subscribers, error: subscribersError } = await supabase.from(
      "newsletter_subscribers"
    ).select(`
        users(user_email)
      `);

    if (subscribersError) {
      logWithTimestamp("error", "Erreur détaillée récupération abonnés", {
        message: subscribersError.message,
        details: subscribersError.details,
        hint: subscribersError.hint,
      });
      return res.status(500).json({
        error: "Erreur récupération abonnés",
        details: subscribersError.message,
      });
    }

    if (!subscribers || subscribers.length === 0) {
      logWithTimestamp("info", "Aucun abonné trouvé");
      return res.status(404).json({ error: "Aucun abonné trouvé" });
    }

    // Extraire les emails des utilisateurs
    const subscribersEmails = subscribers.map(
      (subscriber) => subscriber.users.user_email
    );

    let sentCount = 0;
    let errorCount = 0;

    // Envoyer la newsletter à chaque abonné
    for (const email of subscribersEmails) {
      const success = await sendEmail(email, subject, html);
      if (success) {
        sentCount++;
      } else {
        errorCount++;
      }
    }

    logWithTimestamp("info", "Newsletter envoyée avec succès", {
      sent: sentCount,
      errors: errorCount,
      total: subscribers.length,
    });

    res.json({
      success: true,
      message: "Newsletter envoyée avec succès",
      stats: {
        sent: sentCount,
        errors: errorCount,
        total: subscribers.length,
      },
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /debug/association-membership/:associationId
 * Debug des adhésions d'association
 */
router.get('/debug/association-membership/:associationId', async (req, res) => {
  const { associationId } = req.params;

  logWithTimestamp("info", "=== DEBUG ADHÉSION ASSOCIATION ===", {
    associationId,
  });

  try {
    // Récupérer toutes les adhésions de l'association
    const { data: memberships, error: membershipsError } = await supabase
      .from("associations_memberships")
      .select("*")
      .eq("association_id", associationId)
      .order("membership_start", { ascending: false });

    if (membershipsError) {
      logWithTimestamp("error", "Erreur récupération adhésions", membershipsError);
      return res.status(500).json({ error: membershipsError.message });
    }

    // Récupérer les infos de l'association
    const { data: association, error: associationError } = await supabase
      .from("associations")
      .select("association_name, association_mail")
      .eq("association_id", associationId)
      .single();

    if (associationError) {
      logWithTimestamp("error", "Erreur récupération association", associationError);
    }

    // Vérifier l'adhésion active
    const activeMembership = memberships?.find(
      (m) =>
        m.membership_status === "active" &&
        new Date(m.membership_end) > new Date()
    );

    const debugInfo = {
      association: {
        id: associationId,
        name: association?.association_name || "Non trouvée",
        email: association?.association_mail || "Non trouvé",
      },
      memberships: {
        total: memberships?.length || 0,
        active: activeMembership ? 1 : 0,
        list: memberships || [],
      },
      status: {
        hasActiveMembership: !!activeMembership,
        activeMembershipEnd: activeMembership?.membership_end || null,
        daysRemaining: activeMembership
          ? Math.ceil(
              (new Date(activeMembership.membership_end) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          : 0,
      },
    };

    logWithTimestamp("info", "Debug adhésion association", debugInfo);

    res.json(debugInfo);
  } catch (error) {
    logWithTimestamp("error", "Erreur debug adhésion association", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /verify-association-membership/:associationId
 * Vérifie le statut d'adhésion d'une association
 */
router.get('/verify-association-membership/:associationId', async (req, res) => {
  const { associationId } = req.params;

  try {
    const { data: membership, error } = await supabase
      .from("associations_memberships")
      .select("*")
      .eq("association_id", associationId)
      .eq("membership_status", "active")
      .gte("membership_end", new Date().toISOString())
      .order("membership_end", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      logWithTimestamp("error", "Erreur vérification adhésion association", error);
      return res.status(500).json({ error: error.message });
    }

    const isActive = !!membership;

    res.json({
      associationId,
      isActive,
      membership: membership || null,
      expiresAt: membership?.membership_end || null,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification adhésion association", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;