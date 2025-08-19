// newsletter/newsletterRoutes.js
const express = require("express");
const { sendNewsletterController } = require("./newsletterController");

const router = express.Router();

/**
 * Route pour envoyer une newsletter
 * @route POST /send-newsletter
 * @group Newsletter - Operations liées à la newsletter
 * @param {object} req.body - Données de la newsletter
 * @returns {object} 200 - Newsletter envoyée avec succès
 * @returns {object} 400 - Données de requête non valides
 * @returns {object} 500 - Erreur interne du serveur

 */
router.post("/send-newsletter", sendNewsletterController);

module.exports = router;
