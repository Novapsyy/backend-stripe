const { sendEmail } = require("./emailCore");
const {
  generateMembershipConfirmationHTML,
  generateAssociationMembershipConfirmationHTML,
} = require("./emailTemplates");
const { supabase } = require("../config/database");
const { logWithTimestamp } = require("../shared/logger");
const { getMailByUser } = require("../shared/userUtils");

/**
 * Envoie un email de confirmation d'adhésion
 * @param {string} userId - UUID de l'utilisateur
 * @param {object} membershipData - Données de l'adhésion
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendMembershipConfirmationEmail(userId, membershipData) {
  try {
    const userEmail = await getMailByUser(userId);
    if (!userEmail) {
      logWithTimestamp(
        "warn",
        "Email utilisateur non trouvé pour confirmation adhésion",
        { userId }
      );
      return false;
    }

    const subject = "Confirmation de votre adhésion";
    const html = generateMembershipConfirmationHTML(membershipData);

    return await sendEmail(userEmail, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation adhésion", {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Envoie un email de confirmation d'adhésion pour une association
 * @param {string} associationId - UUID de l'association
 * @param {object} membershipData - Données de l'adhésion
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendAssociationMembershipConfirmationEmail(
  associationId,
  membershipData
) {
  try {
    // Récupérer les infos de l'association
    const { data: association, error } = await supabase
      .from("associations")
      .select("association_name, association_mail")
      .eq("association_id", associationId)
      .single();

    if (error || !association?.association_mail) {
      logWithTimestamp(
        "warn",
        "Email association non trouvé pour confirmation adhésion",
        { associationId }
      );
      return false;
    }

    const subject = `Confirmation d'adhésion - ${association.association_name}`;
    const html = generateAssociationMembershipConfirmationHTML(
      association,
      membershipData
    );

    return await sendEmail(association.association_mail, subject, html);
  } catch (error) {
    logWithTimestamp(
      "error",
      "Erreur envoi email confirmation adhésion association",
      {
        associationId,
        error: error.message,
      }
    );
    return false;
  }
}

module.exports = {
  sendMembershipConfirmationEmail,
  sendAssociationMembershipConfirmationEmail,
};
