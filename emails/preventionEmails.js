const { sendEmailWithRetry } = require("./emailCore");
const { generatePreventionRequestEmailHTML } = require("./emailTemplates");
const { validatePreventionRequest } = require("./emailValidation");
const { CONTACT_EMAIL } = require("../config/email");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Traite et envoie une demande de prévention personnalisée
 * @param {object} requestData - Données de la demande
 * @param {string} to - Email de destination (optionnel, défaut: CONTACT_EMAIL)
 * @param {string} subject - Sujet de l'email (optionnel)
 * @returns {Promise<object>} Résultat de l'envoi
 */
async function sendPreventionRequest(requestData, to = null, subject = null) {
  logWithTimestamp("info", "🎯 Traitement nouvelle demande de prévention");

  const {
    dates,
    durees,
    lieu,
    publicConcerne,
    thematiquesEnvisagees,
    formeEnvisagee,
    message,
    category,
    timestamp,
    source,
    userEmail,
  } = requestData || {};

  logWithTimestamp("info", "📋 Données de demande reçues", {
    category: category?.nom || "Non spécifiée",
    dates: dates || "Non spécifiées",
    lieu: lieu || "Non spécifié",
    publicConcerne: publicConcerne || "Non spécifié",
    hasThematiques: !!thematiquesEnvisagees,
    hasForme: !!formeEnvisagee,
    hasMessage: !!message,
    source: source || "unknown",
    userEmail: userEmail || "Non fourni",
  });

  // Validation des données
  const validation = validatePreventionRequest(requestData || {});

  if (!validation.isValid) {
    logWithTimestamp(
      "warn",
      "❌ Validation demande prévention échouée",
      validation.errors
    );
    return {
      success: false,
      error: "Données de demande invalides",
      errors: validation.errors,
    };
  }

  try {
    // Préparer les données propres
    const cleanData = {
      dates: dates.trim(),
      durees: durees.trim(),
      lieu: lieu.trim(),
      publicConcerne: publicConcerne.trim(),
      thematiquesEnvisagees: thematiquesEnvisagees
        ? thematiquesEnvisagees.trim()
        : null,
      formeEnvisagee: formeEnvisagee ? formeEnvisagee.trim() : null,
      message: message ? message.trim() : null,
      category,
      timestamp: timestamp || new Date().toISOString(),
      source: source || "prevention_catalog",
      userEmail: userEmail || null,
    };

    // Générer le sujet de l'email
    const emailSubject =
      subject || `[Prévention] Nouvelle demande - ${category.nom}`;

    // Générer l'email HTML
    const emailHTML = generatePreventionRequestEmailHTML(cleanData);

    logWithTimestamp(
      "info",
      "🚀 ENVOI EMAIL DEMANDE PRÉVENTION vers contact@novapsy.info"
    );

    // Envoyer l'email avec retry
    const emailResult = await sendEmailWithRetry(
      to || CONTACT_EMAIL,
      emailSubject,
      emailHTML,
      {
        headers: {
          "X-Priority": "1", // Haute priorité
          "X-Contact-Form": "novapsy-prevention-catalog",
          "X-Prevention-Category": category.nom,
        },
      }
    );

    if (emailResult.success) {
      logWithTimestamp("info", "🎉 SUCCESS - Email demande prévention envoyé", {
        category: category.nom,
        messageId: emailResult.messageId,
        attempt: emailResult.attempt,
      });

      // Réponse de succès
      return {
        success: true,
        message: "Votre demande de prévention a été envoyée avec succès !",
        details:
          "Notre équipe vous contactera rapidement pour finaliser votre formation personnalisée.",
        messageId: emailResult.messageId,
        category: category.nom,
      };
    } else {
      // Échec de l'email
      logWithTimestamp(
        "error",
        "💥 ÉCHEC CRITIQUE - Email demande prévention non envoyé",
        {
          category: category.nom,
          error: emailResult.error,
          totalAttempts: emailResult.totalAttempts,
        }
      );

      return {
        success: false,
        error: "Impossible d'envoyer votre demande de prévention",
        details:
          "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
        technical: {
          attempts: emailResult.totalAttempts,
          lastError: emailResult.error,
        },
      };
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans demande prévention", {
      category: category?.nom || "unknown",
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

/**
 * Teste la fonctionnalité de demande de prévention avec différents thèmes
 * @param {string} theme - Thème à tester (psycho, sexualite, handicap)
 * @returns {Promise<object>} Résultat du test
 */
async function testPreventionRequest(theme = "default") {
  logWithTimestamp("info", "🧪 Test demande de prévention", { theme });

  let testCategory;
  switch (theme) {
    case "psycho":
      testCategory = {
        id: 1,
        nom: "Prévention du Burnout Psychologique",
        description:
          "Formation complète sur la prévention et la gestion du burnout et stress professionnel",
      };
      break;
    case "sexualite":
      testCategory = {
        id: 2,
        nom: "Sexualité et Bien-être",
        description:
          "Formation sur l'accompagnement en santé sexuelle et intimité",
      };
      break;
    case "handicap":
      testCategory = {
        id: 3,
        nom: "Handicaps Invisibles en Milieu Professionnel",
        description:
          "Sensibilisation et inclusion des handicaps invisibles au travail",
      };
      break;
    default:
      testCategory = {
        id: 1,
        nom: "Prévention Générale",
        description: "Formation générale de prévention (couleur par défaut)",
      };
  }

  const testRequestData = {
    dates: "Semaine du 15 mars 2025",
    durees: "2 jours, 14 heures",
    lieu: "Paris ou en ligne",
    publicConcerne: "Professionnels de santé mentale",
    thematiquesEnvisagees:
      "Techniques adaptées au thème\nApproche personnalisée",
    formeEnvisagee: "Ateliers pratiques avec mises en situation",
    message: `Nous souhaiterions une formation adaptée sur le thème : ${testCategory.nom}`,
    category: testCategory,
    timestamp: new Date().toISOString(),
    source: "prevention_catalog_test",
  };

  const subject = `🧪 Test Demande Prévention ${testCategory.nom} - Novapsy`;

  try {
    const result = await sendPreventionRequest(
      testRequestData,
      CONTACT_EMAIL,
      subject
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test demande prévention envoyé avec succès");
      return {
        success: true,
        message: "Test de demande de prévention fonctionnel",
        details: {
          messageId: result.messageId,
          theme: theme,
          category: testRequestData.category.nom,
        },
      };
    } else {
      logWithTimestamp(
        "error",
        "❌ Test demande prévention échoué",
        result.error
      );
      return {
        success: false,
        error: "Test de demande de prévention défaillant",
        details: result.error,
      };
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test demande prévention", error);
    return {
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    };
  }
}

module.exports = {
  sendPreventionRequest,
  testPreventionRequest,
};
