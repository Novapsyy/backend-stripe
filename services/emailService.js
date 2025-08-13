const { resend, FROM_EMAIL } = require('../config/email');
const { logWithTimestamp } = require('../utils/logger');
const { getMailByUser } = require('./userService');

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
 * Envoie un email avec retry
 * @param {string} to - Email du destinataire
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @param {object} options - Options (maxRetries, retryDelay)
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendEmailWithRetry(to, subject, html, options = {}) {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWithTimestamp("info", `Tentative d'envoi email ${attempt}/${maxRetries}`, {
        to,
        subject,
        attempt
      });

      const success = await sendEmail(to, subject, html);
      
      if (success) {
        logWithTimestamp("info", "Email envoyé avec succès", {
          to,
          subject,
          attempt
        });
        return true;
      }
      
      if (attempt < maxRetries) {
        logWithTimestamp("warn", `Échec tentative ${attempt}, retry dans ${retryDelay}ms`, {
          to,
          subject,
          attempt
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      logWithTimestamp("error", `Erreur tentative ${attempt}`, {
        to,
        subject,
        attempt,
        error: error.message
      });
      
      if (attempt === maxRetries) {
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  logWithTimestamp("error", "Échec définitif envoi email après toutes les tentatives", {
    to,
    subject,
    maxRetries
  });
  return false;
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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Votre formation a été achetée avec succès !</h2>
        
        <p>Nous vous confirmons l'achat de votre formation.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de votre achat :</h3>
          <p><strong>Formation :</strong> ${trainingDetails.full_name}</p>
          <p><strong>Durée :</strong> ${trainingDetails.duration} heures</p>
          <p><strong>Prix payé :</strong> ${purchaseData.purchase_amount}€</p>
          ${
            purchaseData.member_discount > 0
              ? `<p><strong>Réduction adhérent :</strong> -${purchaseData.member_discount}€</p>`
              : ""
          }
          <p><strong>Date d'achat :</strong> ${new Date(
            purchaseData.purchase_date
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <p>Vous recevrez prochainement les informations concernant l'organisation de votre formation.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

    return await sendEmail(userEmail, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation formation", {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Valide un email
 * @param {string} email - Email à valider
 * @returns {boolean} True si l'email est valide
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Génère le HTML pour un email de confirmation de contact
 * @param {string} userName - Nom de l'utilisateur
 * @param {string} userMessage - Message de l'utilisateur
 * @returns {string} HTML de l'email
 */
function generateConfirmationEmailHTML(userName, userMessage) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Merci pour votre message !</h1>
          <div style="width: 50px; height: 3px; background-color: #3498db; margin: 15px auto;"></div>
        </div>
        
        <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Bonjour <strong>${userName}</strong>,
        </p>
        
        <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          Nous avons bien reçu votre message et nous vous en remercions. Notre équipe l'examinera attentivement et vous répondra dans les plus brefs délais.
        </p>
        
        <div style="background-color: #ecf0f1; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #3498db;">
          <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px;">Récapitulatif de votre message :</h3>
          <p style="color: #34495e; font-style: italic; margin: 0; line-height: 1.5;">
            "${userMessage}"
          </p>
        </div>
        
        <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          En attendant notre réponse, n'hésitez pas à consulter notre site web pour découvrir nos services et actualités.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="color: #7f8c8d; font-size: 14px; margin: 0;">
            Cet email est envoyé automatiquement, merci de ne pas y répondre directement.
          </p>
        </div>
        
        <div style="border-top: 1px solid #ecf0f1; padding-top: 20px; text-align: center;">
          <p style="color: #34495e; font-size: 16px; margin: 0;">
            Cordialement,<br>
            <strong style="color: #2c3e50;">L'équipe Novapsy</strong>
          </p>
        </div>
      </div>
    </div>
  `;
}

module.exports = {
  sendEmail,
  sendEmailWithRetry,
  sendMembershipConfirmationEmail,
  sendTrainingPurchaseConfirmationEmail,
  isValidEmail,
  generateConfirmationEmailHTML
};