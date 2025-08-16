const { PRICES, TRAININGS } = require("../config/constants");
const { logWithTimestamp } = require("./logger");

/**
 * Récupère le prix d'un produit à partir de son ID Stripe
 * @param {string} priceId - ID du prix Stripe
 * @returns {number} Prix en euros
 */
function getPriceFromPriceId(priceId) {
  return PRICES[priceId] || 0;
}

/**
 * Récupère les détails d'une formation à partir de son ID de prix
 * @param {string} priceId - ID du prix Stripe pour la formation
 * @returns {object|null} Détails de la formation ou null si non trouvée
 */
function getTrainingDetails(priceId) {
  return TRAININGS[priceId] || null;
}

/**
 * Calcule le prix final d'une formation avec réduction adhérent
 * @param {object} trainingDetails - Détails de la formation
 * @param {boolean} isMember - Si l'utilisateur est adhérent
 * @returns {number} Prix final après réduction
 */
function calculateDiscountedPrice(trainingDetails, isMember) {
  if (!trainingDetails) return 0;

  const basePrice = trainingDetails.base_price;
  const discount = isMember ? trainingDetails.member_discount : 0;
  const finalPrice = basePrice - discount;

  logWithTimestamp("info", "Calcul prix avec réduction", {
    basePrice,
    discount,
    finalPrice,
    isMember,
  });

  return finalPrice;
}

module.exports = {
  getPriceFromPriceId,
  getTrainingDetails,
  calculateDiscountedPrice,
};
