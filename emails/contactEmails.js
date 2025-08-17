const { sendEmailWithRetry } = require("./emailCore");
const {
  generateContactEmailHTML,
  generateConfirmationEmailHTML,
} = require("./emailTemplates");
const { validateContactData } = require("./emailValidation");
const { CONTACT_EMAIL } = require("../config/email");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Traite et envoie un email de contact
 * @param {object} contactData - Données du formulaire de contact
 * @returns {Promise<object>} Résultat de l'envoi
 */
async function sendContactEmail(contactData) {
  logWithTimestamp("info", "🔥 Traitement nouveau message de contact");

  const { name, email, phone, message } = contactData;

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
    return {
      success: false,
      error: "Données invalides",
      errors: validation.errors,
    };
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
      return {
        success: true,
        message: "Votre message a été envoyé avec succès !",
        details: "Nous vous répondrons dans les plus brefs délais.",
        messageId: emailResult.messageId,
      };
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

      return {
        success: false,
        error: "Impossible d'envoyer votre message",
        details:
          "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
        technical: {
          attempts: emailResult.totalAttempts,
          lastError: emailResult.error,
        },
      };
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans formulaire contact", {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    };
  }
}

module.exports = {
  sendContactEmail,
};
