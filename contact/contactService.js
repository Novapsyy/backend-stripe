// contact/contactService.js
// Service de traitement des formulaires de contact et tests

const { sendContactEmail, sendEmailWithRetry } = require("../emails");
const { CONTACT_EMAIL } = require("../config/email");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Traite un formulaire de contact
 * @param {Object} formData - Données du formulaire de contact
 * @returns {Object} Résultat du traitement
 */
async function processContactForm(formData) {
  logWithTimestamp("info", "🔥 === TRAITEMENT FORMULAIRE DE CONTACT ===");

  try {
    // Validation basique des données
    if (!formData) {
      return {
        success: false,
        errors: ["Données du formulaire manquantes"],
        message: "Aucune donnée reçue",
      };
    }

    // Utilisation du module email refactorisé
    const result = await sendContactEmail(formData);

    // Log du résultat
    if (result.success) {
      logWithTimestamp("info", "✅ Formulaire de contact traité avec succès", {
        messageId: result.messageId,
        attempt: result.attempt,
      });
    } else {
      logWithTimestamp("warn", "⚠️ Échec traitement formulaire de contact", {
        errors: result.errors,
        message: result.message,
      });
    }

    return result;
  } catch (error) {
    logWithTimestamp(
      "error",
      "💥 EXCEPTION CRITIQUE - Traitement formulaire de contact",
      {
        error: error.message,
        stack: error.stack,
        formData: formData ? Object.keys(formData) : "undefined",
      }
    );

    return {
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
      technical_details: error.message,
    };
  }
}

/**
 * Teste la configuration email avec un email de test
 * @returns {Object} Résultat du test
 */
async function testEmailConfiguration() {
  logWithTimestamp("info", "🧪 === TEST CONFIGURATION EMAIL ===");

  try {
    // Création du contenu HTML de test
    const testHTML = `
      <div style="padding: 30px; font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🧪 Test de Configuration Email</h2>
        <p>✅ La configuration Resend fonctionne correctement</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>To :</strong> ${CONTACT_EMAIL}</p>
        <p><strong>Module :</strong> contact/contactService.js</p>
        <p><strong>Type :</strong> Test configuration depuis module refactorisé</p>
        <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 8px;">
          <h3 style="color: #0369a1; margin: 0 0 10px 0;">📋 Détails Techniques</h3>
          <ul style="margin: 0; color: #374151;">
            <li>Module emails: ✅ Chargé</li>
            <li>Fonction: sendEmailWithRetry()</li>
            <li>Retry logic: ✅ Activé</li>
            <li>Timestamp: ${new Date().toISOString()}</li>
          </ul>
        </div>
      </div>
    `;

    // Envoi de l'email de test
    const result = await sendEmailWithRetry(
      CONTACT_EMAIL,
      "🧪 Test Configuration Resend - Novapsy (Module Contact Refactorisé)",
      testHTML
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test email envoyé avec succès", {
        messageId: result.messageId,
        to: CONTACT_EMAIL,
        attempt: result.attempt,
      });

      return {
        success: true,
        message:
          "Configuration email fonctionnelle (module contact refactorisé)",
        details: {
          messageId: result.messageId,
          to: CONTACT_EMAIL,
          attempt: result.attempt,
          module: "contact/contactService.js",
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      logWithTimestamp("error", "❌ Test email échoué", {
        error: result.error,
        details: result.details,
      });

      return {
        success: false,
        error: "Configuration email défaillante",
        details: result.error,
        module: "contact/contactService.js",
      };
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION - Test configuration email", {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: "Erreur lors du test",
      message: error.message,
      module: "contact/contactService.js",
    };
  }
}

/**
 * Valide les données d'un formulaire de contact
 * @param {Object} formData - Données à valider
 * @returns {Object} Résultat de la validation
 */
function validateContactForm(formData) {
  const errors = [];

  // Validation email
  if (!formData.email || !formData.email.includes("@")) {
    errors.push("Email invalide");
  }

  // Validation nom
  if (!formData.name || formData.name.trim().length < 2) {
    errors.push("Nom trop court (minimum 2 caractères)");
  }

  // Validation message
  if (!formData.message || formData.message.trim().length < 10) {
    errors.push("Message trop court (minimum 10 caractères)");
  }

  // Validation sujet si présent
  if (formData.subject && formData.subject.length > 200) {
    errors.push("Sujet trop long (maximum 200 caractères)");
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    cleanData: {
      email: formData.email?.trim().toLowerCase(),
      name: formData.name?.trim(),
      subject: formData.subject?.trim() || "Nouveau message de contact",
      message: formData.message?.trim(),
    },
  };
}

module.exports = {
  processContactForm,
  testEmailConfiguration,
  validateContactForm,
};
