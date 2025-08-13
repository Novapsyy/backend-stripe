const { PRICES, TRAININGS } = require('../config/constants');

/**
 * Récupère le prix à partir d'un price ID Stripe
 * @param {string} priceId - ID du prix Stripe
 * @returns {number|null} Prix ou null si non trouvé
 */
function getPriceFromPriceId(priceId) {
  return PRICES[priceId] || null;
}

/**
 * Récupère les détails d'une formation à partir d'un price ID
 * @param {string} priceId - ID du prix Stripe
 * @returns {object|null} Détails de la formation ou null si non trouvé
 */
function getTrainingDetails(priceId) {
  return TRAININGS[priceId] || null;
}

/**
 * Calcule le prix avec réduction pour un membre
 * @param {object} trainingDetails - Détails de la formation
 * @param {boolean} isMember - Si l'utilisateur est membre
 * @returns {object} Prix final et réduction appliquée
 */
function calculateDiscountedPrice(trainingDetails, isMember) {
  if (!trainingDetails) {
    return { finalPrice: 0, discount: 0 };
  }

  const basePrice = trainingDetails.base_price;
  const discount = isMember ? trainingDetails.member_discount : 0;
  const finalPrice = basePrice - discount;

  return {
    finalPrice: Math.max(finalPrice, 0),
    discount
  };
}

module.exports = {
  getPriceFromPriceId,
  getTrainingDetails,
  calculateDiscountedPrice
};