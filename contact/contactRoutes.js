// contact/contactRoutes.js
// Routes pour le formulaire de contact et tests

const express = require("express");
const {
  processContactForm,
  testEmailConfiguration,
} = require("./contactService");
const { logWithTimestamp } = require("../shared/logger");

const router = express.Router();

/**
 * POST /contact
 * Traite le formulaire de contact via module refactorisé
 */
router.post("/contact", async (req, res) => {
  logWithTimestamp("info", "📬 === NOUVELLE DEMANDE DE CONTACT ===");

  try {
    // Traitement du formulaire via le service
    const result = await processContactForm(req.body);

    // Réponse selon le résultat
    if (result.success) {
      return res.status(200).json(result);
    } else {
      // Code 400 si erreurs de validation, 500 sinon
      const statusCode = result.errors ? 400 : 500;
      return res.status(statusCode).json(result);
    }
  } catch (error) {
    // Gestion d'exception de dernière chance
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans route contact", {
      error: error.message,
      stack: error.stack,
      body: req.body ? Object.keys(req.body) : "undefined",
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
      module: "contact/contactRoutes.js",
    });
  }
});

/**
 * GET /contact/test
 * Test de la configuration email via module refactorisé
 */
router.get("/contact/test", async (req, res) => {
  logWithTimestamp(
    "info",
    "🧪 === TEST CONFIGURATION EMAIL (MODULE CONTACT) ==="
  );

  try {
    // Test de configuration via le service
    const result = await testEmailConfiguration();

    if (result.success) {
      logWithTimestamp(
        "info",
        "✅ Test email envoyé avec succès depuis module contact"
      );
      return res.status(200).json(result);
    } else {
      logWithTimestamp(
        "error",
        "❌ Test email échoué depuis module contact",
        result.error
      );
      return res.status(500).json(result);
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION - Test email module contact", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      message: error.message,
      module: "contact/contactRoutes.js",
    });
  }
});

module.exports = router;
