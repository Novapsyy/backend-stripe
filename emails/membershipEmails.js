const { supabase } = require("../config/database");
const { resend, FROM_EMAIL } = require("../config/email");
const { logWithTimestamp } = require("../shared/logger");
const { getMailByUser } = require("../shared/userUtils");

/**
 * Envoie un email via Resend
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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Bienvenue ! Votre adhésion est confirmée</h2>
        
        <p>Nous sommes ravis de vous confirmer que votre adhésion a été activée avec succès.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de votre adhésion :</h3>
          <p><strong>Prix :</strong> ${membershipData.membership_price}€</p>
          <p><strong>Début :</strong> ${new Date(
            membershipData.membership_start
          ).toLocaleDateString("fr-FR")}</p>
          <p><strong>Fin :</strong> ${new Date(
            membershipData.membership_end
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <p>Vous pouvez maintenant profiter de tous les avantages de votre adhésion, notamment les réductions sur nos formations.</p>
        <p><strong>Important :</strong> Votre adhésion est valable exactement un an. Vous recevrez des notifications avant expiration pour renouveler si vous le souhaitez.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Bienvenue ! Votre association est maintenant adhérente</h2>
        
        <p>Nous sommes ravis de confirmer que l'adhésion de <strong>${association.association_name}</strong> a été activée avec succès.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de votre adhésion :</h3>
          <p><strong>Prix :</strong> ${membershipData.membership_price}€</p>
          <p><strong>Début :</strong> ${new Date(
            membershipData.membership_start
          ).toLocaleDateString("fr-FR")}</p>
          <p><strong>Fin :</strong> ${new Date(
            membershipData.membership_end
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2d5a2d;">🎉 Avantages pour tous vos membres :</h3>
          <ul style="color: #2d5a2d;">
            <li>Accès prioritaire aux événements</li>
            <li>Réductions sur les formations</li>
            <li>Support technique dédié</li>
            <li>Accès à la plateforme premium</li>
          </ul>
        </div>
        
        <p><strong>Important :</strong> Tous vos membres actuels et futurs bénéficient automatiquement de ces avantages. Aucune action supplémentaire n'est requise !</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

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
