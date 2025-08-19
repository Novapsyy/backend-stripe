// debug/debugRoutes.js
const express = require("express");
const { getUserEmailController } = require("./debugController");

const router = express.Router();

/**
 * Route: GET /user-email/:userId
 * Description: Récupère l'email d'un utilisateur (debug uniquement)
 * @param {string} userId - ID de l'utilisateur
 * @returns {object} - Objet contenant l'email de l'utilisateur
 * @throws {Error} - Erreur si l'utilisateur n'est pas trouvé

 */
router.get("/user-email/:userId", getUserEmailController);

module.exports = router;
