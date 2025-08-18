const {
  sendPreventionRequest,
  testPreventionRequest: emailTestPreventionRequest,
} = require("../emails");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Traite une demande de prévention
 */
async function processPreventionRequest(requestData, to, subject) {
  logWithTimestamp("info", "🎯 === TRAITEMENT DEMANDE DE PRÉVENTION ===");
  try {
    const validation = validatePreventionRequest(requestData, to, subject);
    if (!validation.isValid) {
      logWithTimestamp("warn", "❌ Validation demande prévention échouée", {
        errors: validation.errors,
      });
      return {
        success: false,
        errors: validation.errors,
        message: "Données invalides",
      };
    }
    const enrichedRequestData = enrichRequestData(requestData);
    const result = await sendPreventionRequest(
      enrichedRequestData,
      to,
      subject
    );
    if (result.success) {
      logWithTimestamp("info", "✅ Demande de prévention traitée avec succès", {
        messageId: result.messageId,
        to,
      });
      return result;
    } else {
      logWithTimestamp("warn", "⚠️ Échec traitement demande de prévention", {
        errors: result.errors,
        to,
      });
      return result;
    }
  } catch (error) {
    logWithTimestamp(
      "error",
      "💥 EXCEPTION - Traitement demande de prévention",
      { error: error.message, to, subject }
    );
    return { success: false, error: "Erreur serveur", message: error.message };
  }
}

/**
 * Teste une demande de prévention avec un thème donné
 */
async function testPreventionRequest(theme) {
  logWithTimestamp("info", "🧪 === TEST DEMANDE PRÉVENTION ===");
  try {
    const validation = validateTheme(theme);
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
        message: "Thème invalide",
      };
    }
    const result = await emailTestPreventionRequest(validation.cleanTheme);
    if (result.success) {
      logWithTimestamp("info", "✅ Test demande prévention réussi", {
        theme: validation.cleanTheme,
      });
      return result;
    } else {
      logWithTimestamp("error", "❌ Test demande prévention échoué", {
        theme: validation.cleanTheme,
        error: result.error,
      });
      return result;
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION - Test demande prévention", {
      error: error.message,
      theme,
    });
    return {
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    };
  }
}

/**
 * Valide les données d'une demande de prévention (aligné sur le formulaire frontend)
 */
function validatePreventionRequest(requestData, to, subject) {
  const errors = {};
  // Validation destinataire (obligatoire)
  if (!to || typeof to !== "string" || !to.includes("@")) {
    errors.to = "Destinataire (to) invalide ou manquant";
  }
  // Validation sujet (obligatoire)
  if (
    !subject ||
    typeof subject !== "string" ||
    subject.trim().length === 0 ||
    subject.length > 200
  ) {
    errors.subject = "Sujet invalide (1-200 caractères)";
  }
  // Validation données de demande (obligatoire)
  if (!requestData || typeof requestData !== "object") {
    errors.requestData = "Données de demande manquantes ou invalides";
  } else {
    // Champs obligatoires du formulaire
    if (
      !requestData.dates ||
      typeof requestData.dates !== "string" ||
      requestData.dates.trim().length === 0
    ) {
      errors.dates = "Dates manquantes ou invalides";
    }
    if (
      !requestData.durees ||
      typeof requestData.durees !== "string" ||
      requestData.durees.trim().length === 0
    ) {
      errors.durees = "Durées manquantes ou invalides";
    }
    if (
      !requestData.lieu ||
      typeof requestData.lieu !== "string" ||
      requestData.lieu.trim().length === 0
    ) {
      errors.lieu = "Lieu manquant ou invalide";
    }
    if (
      !requestData.publicConcerne ||
      typeof requestData.publicConcerne !== "string" ||
      requestData.publicConcerne.trim().length === 0
    ) {
      errors.publicConcerne = "Public concerné manquant ou invalide";
    }
    // Champs optionnels : pas de validation stricte
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors: errors,
    cleanData: {
      to: to?.trim().toLowerCase(),
      subject: subject?.trim(),
      requestData: { ...requestData },
    },
  };
}

/**
 * Valide un thème pour les tests de prévention
 */
function validateTheme(theme) {
  const errors = [];
  if (!theme || typeof theme !== "string") {
    errors.push("Thème manquant ou invalide");
  } else {
    const cleanTheme = theme.trim();
    if (cleanTheme.length < 3 || cleanTheme.length > 100) {
      errors.push("Thème doit faire entre 3 et 100 caractères");
    }
  }
  return {
    isValid: errors.length === 0,
    errors: errors,
    cleanTheme: theme?.trim(),
  };
}

/**
 * Enrichit les données de demande avec des valeurs par défaut (aligné sur le formulaire)
 */
function enrichRequestData(requestData) {
  const enriched = { ...requestData };
  // Déterminer la catégorie depuis selectedCategory.nom (frontend)
  if (!enriched.category && requestData.category?.nom) {
    enriched.category = requestData.category.nom;
  }
  // Valeurs par défaut pour les champs optionnels non fournis
  if (!enriched.thematiquesEnvisagees) {
    enriched.thematiquesEnvisagees = "Aucune thématique spécifique";
  }
  if (!enriched.formeEnvisagee) {
    enriched.formeEnvisagee = "Aucune forme envisagée";
  }
  if (!enriched.message) {
    enriched.message = "Aucun message complémentaire";
  }
  // Source et timestamp (déjà ajoutés côté frontend)
  enriched.source = enriched.source || "prevention_catalog";
  return enriched;
}

/**
 * Statistiques du module
 */
function getPreventionStats() {
  return {
    module: "prevention/preventionService.js",
    version: "2.1.0-optimized",
    endpoints: [
      "POST /api/send-prevention-request",
      "POST /api/test-prevention-request",
      "GET /api/prevention/stats",
    ],
    validation: {
      required_fields: ["dates", "durees", "lieu", "publicConcerne"],
      optional_fields: ["thematiquesEnvisagees", "formeEnvisagee", "message"],
    },
  };
}

module.exports = {
  processPreventionRequest,
  testPreventionRequest,
  validatePreventionRequest,
  validateTheme,
  enrichRequestData,
  getPreventionStats,
};
