const { sendEmail } = require("./emailCore");
const {
  generateTrainingPurchaseConfirmationHTML,
} = require("./emailTemplates");
const { getMailByUser } = require("../shared/userUtils");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Envoie un email de confirmation d'achat de formation
 * @param {string} userId - UUID de l'utilisateur
 * @param {object} purchaseData - Données de l'achat
 * @param {object} trainingDetails - Détails de la formation
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendTrainingPurchaseConfirmationEmail(
  userId,
  purchaseData,
  trainingDetails
) {
  try {
    const userEmail = await getMailByUser(userId);
    if (!userEmail) {
      logWithTimestamp(
        "warn",
        "Email utilisateur non trouvé pour confirmation formation",
        { userId }
      );
      return false;
    }

    const subject = `Confirmation d'achat - Formation ${trainingDetails.name}`;
    const html = generateTrainingPurchaseConfirmationHTML(
      purchaseData,
      trainingDetails
    );

    return await sendEmail(userEmail, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation formation", {
      userId,
      error: error.message,
    });
    return false;
  }
}

module.exports = {
  sendTrainingPurchaseConfirmationEmail,
};
