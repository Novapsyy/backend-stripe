/**
 * Module central pour les formations
 * Exporte les services et routes des formations
 */

// Services business
const {
  createTrainingPurchase,
  checkTrainingPurchase,
  getTrainingDetailsForUser,
} = require("./trainingService");

// Routes API
const trainingRoutes = require("./trainingRoutes");

module.exports = {
  // Services (pour utilisation dans d'autres modules comme webhooks)
  createTrainingPurchase,
  checkTrainingPurchase,
  getTrainingDetailsForUser,

  // Routes (pour montage dans server.js)
  trainingRoutes,
};
