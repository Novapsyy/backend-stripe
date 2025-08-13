const express = require('express');
const router = express.Router();
const { CONTACT_EMAIL, FROM_EMAIL } = require('../config/constants');
const { logWithTimestamp } = require('../utils/logger');
const { validateContactData } = require('../services/validationService');
const { sendEmailWithRetry, generateContactEmailHTML, generateConfirmationEmailHTML } = require('../services/emailService');

/**
 * POST /contact
 * Traite les messages du formulaire de contact
 * Body: { name, email, phone?, message }
 */
router.post('/', async (req, res) => {
  logWithTimestamp("info", "🔥 === NOUVEAU MESSAGE DE CONTACT ===");

  const { name, email, phone, message } = req.body;

  logWithTimestamp("info", "📋 Données reçues", {
    name: name || "MANQUANT",
    email: email || "MANQUANT",
    phone: phone || "Non fourni",
    messageLength: message ? message.length : 0,
  });

  // Validation des données
  const validation = validateContactData({ name, email, phone, message });

  if (!validation.isValid) {
    logWithTimestamp("warn", "❌ Validation échouée", validation.errors);
    return res.status(400).json({
      success: false,
      error: "Données invalides",
      errors: validation.errors,
    });
  }

  try {
    // Préparer les données propres
    const cleanData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      message: message.trim(),
    };

    // Générer l'email HTML
    const emailSubject = `[Site Web] Nouveau message de ${cleanData.name}`;
    const emailHTML = generateContactEmailHTML(cleanData);

    logWithTimestamp(
      "info",
      "🚀 ENVOI EMAIL PRINCIPAL vers contact@novapsy.info"
    );

    // Envoyer l'email principal avec reply-to
    const emailResult = await sendEmailWithRetry(
      CONTACT_EMAIL,
      emailSubject,
      emailHTML,
      {
        reply_to: cleanData.email, // Permet de répondre directement
        headers: {
          "X-Priority": "1", // Haute priorité
          "X-Contact-Form": "novapsy-website",
        },
      }
    );

    if (emailResult.success) {
      logWithTimestamp("info", "🎉 SUCCESS - Email principal envoyé", {
        messageId: emailResult.messageId,
        attempt: emailResult.attempt,
      });

      // Envoyer email de confirmation en arrière-plan (optionnel)
      setImmediate(async () => {
        try {
          const confirmationSubject = "Confirmation - Message reçu par Novapsy";
          const confirmationHTML = generateConfirmationEmailHTML(
            cleanData.name,
            cleanData.message
          );

          const confirmResult = await sendEmailWithRetry(
            cleanData.email,
            confirmationSubject,
            confirmationHTML
          );

          if (confirmResult.success) {
            logWithTimestamp("info", "✅ Confirmation utilisateur envoyée", {
              to: cleanData.email,
              messageId: confirmResult.messageId,
            });
          } else {
            logWithTimestamp(
              "warn",
              "⚠️ Échec confirmation utilisateur (non critique)",
              {
                to: cleanData.email,
                error: confirmResult.error,
              }
            );
          }
        } catch (error) {
          logWithTimestamp(
            "warn",
            "⚠️ Exception confirmation utilisateur (ignorée)",
            {
              error: error.message,
            }
          );
        }
      });

      // Réponse de succès
      return res.status(200).json({
        success: true,
        message: "Votre message a été envoyé avec succès !",
        details: "Nous vous répondrons dans les plus brefs délais.",
        messageId: emailResult.messageId,
      });
    } else {
      // Échec de l'email principal
      logWithTimestamp(
        "error",
        "💥 ÉCHEC CRITIQUE - Email principal non envoyé",
        {
          error: emailResult.error,
          totalAttempts: emailResult.totalAttempts,
        }
      );

      return res.status(500).json({
        success: false,
        error: "Impossible d'envoyer votre message",
        details:
          "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
        technical: {
          attempts: emailResult.totalAttempts,
          lastError: emailResult.error,
        },
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans formulaire contact", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    });
  }
});

/**
 * GET /test
 * Test de la configuration email
 */
router.get('/test', async (req, res) => {
  logWithTimestamp("info", "🧪 === TEST CONFIGURATION EMAIL ===");

  try {
    const testHTML = `
      <div style="padding: 30px; font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🧪 Test de Configuration Email</h2>
        <p>✅ La configuration Resend fonctionne correctement</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>From :</strong> ${FROM_EMAIL}</p>
        <p><strong>To :</strong> ${CONTACT_EMAIL}</p>
      </div>
    `;

    const result = await sendEmailWithRetry(
      CONTACT_EMAIL,
      "🧪 Test Configuration Resend - Novapsy",
      testHTML
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test email envoyé avec succès");
      return res.json({
        success: true,
        message: "Configuration email fonctionnelle",
        details: {
          messageId: result.messageId,
          from: FROM_EMAIL,
          to: CONTACT_EMAIL,
          attempt: result.attempt,
        },
      });
    } else {
      logWithTimestamp("error", "❌ Test email échoué", result.error);
      return res.status(500).json({
        success: false,
        error: "Configuration email défaillante",
        details: result.error,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test email", error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      details: error.message,
    });
  }
});

module.exports = router;