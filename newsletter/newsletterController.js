// newsletter/newsletterController.js
const { logWithTimestamp } = require("../shared/logger");
const { sendNewsletter } = require("../emails");

/**
 * Contrôleur pour l'envoi de newsletter
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const sendNewsletterController = async (req, res) => {
  logWithTimestamp("info", "=== ENVOI NEWSLETTER ===");

  const { subject, html } = req.body;

  // Validation des données
  if (!subject || !html) {
    logWithTimestamp("warn", "Données manquantes pour l'envoi de newsletter");
    return res.status(400).json({
      success: false,
      error: "Le sujet et le contenu HTML sont requis",
    });
  }

  try {
    const result = await sendNewsletter(subject, html);

    if (result.success) {
      logWithTimestamp("info", "Newsletter envoyée avec succès", {
        subject,
        recipientsCount: result.recipientsCount || 0,
      });
      return res.status(200).json(result);
    } else {
      logWithTimestamp("error", "Échec envoi newsletter", result);
      return res.status(500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  sendNewsletterController,
};
