const { resend, FROM_EMAIL } = require("../config/email");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Envoie un email via Resend (version de base)
 * @param {string} to - Email du destinataire
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendEmail(to, subject, html) {
  try {
    logWithTimestamp("info", "Envoi email", { to, subject });

    if (!to || !to.includes("@")) {
      logWithTimestamp("error", "Email invalide", { to });
      return false;
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: to,
      subject: subject,
      html: html,
    });

    if (result.data && result.data.id) {
      logWithTimestamp("info", "✅ Email envoyé avec succès", {
        to,
        subject,
        messageId: result.data.id,
      });
      return true;
    } else {
      logWithTimestamp("error", "❌ Résultat Resend suspect", {
        to,
        subject,
        result: result,
      });
      return false;
    }
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur envoi email", {
      to,
      subject,
      error: error.message,
    });
    return false;
  }
}

/**
 * Envoie un email via Resend avec retry et options avancées
 * @param {string} to - Email du destinataire
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @param {object} options - Options supplémentaires (reply_to, headers, etc.)
 * @returns {Promise<object>} Résultat détaillé de l'envoi
 */
async function sendEmailWithRetry(to, subject, html, options = {}) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWithTimestamp(
        "info",
        `Tentative ${attempt}/${maxRetries} d'envoi email`,
        { to, subject }
      );

      const emailData = {
        from: FROM_EMAIL,
        to: to,
        subject: subject,
        html: html,
        ...options,
      };

      const result = await resend.emails.send(emailData);

      if (result.data && result.data.id) {
        logWithTimestamp("info", "✅ Email envoyé avec succès", {
          to,
          messageId: result.data.id,
          attempt,
        });
        return {
          success: true,
          messageId: result.data.id,
          attempt,
        };
      }

      if (result.error) {
        lastError = result.error;
        logWithTimestamp("error", `❌ Erreur Resend (tentative ${attempt})`, {
          to,
          error: result.error,
        });
      }
    } catch (error) {
      lastError = error.message;
      logWithTimestamp(
        "error",
        `❌ Exception envoi email (tentative ${attempt})`,
        {
          to,
          error: error.message,
        }
      );
    }

    // Attendre avant retry (sauf dernière tentative)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  logWithTimestamp("error", "💥 Échec définitif envoi email", {
    to,
    totalAttempts: maxRetries,
    lastError,
  });

  return {
    success: false,
    error: lastError,
    totalAttempts: maxRetries,
  };
}

module.exports = {
  sendEmail,
  sendEmailWithRetry,
};
