/**
 * Validation d'email
 * @param {string} email - Email à valider
 * @returns {boolean} Validité de l'email
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validation des données du formulaire de contact
 * @param {object} data - Données du formulaire
 * @returns {object} Résultat de validation avec erreurs éventuelles
 */
function validateContactData(data) {
  const { name, email, phone, message } = data;
  const errors = {};

  // Validation du nom
  if (!name || name.trim().length < 2) {
    errors.name = "Le nom doit contenir au moins 2 caractères";
  }

  // Validation de l'email
  if (!email || !isValidEmail(email)) {
    errors.email = "Format d'email invalide";
  }

  // Validation du message
  if (!message || message.trim().length < 10) {
    errors.message = "Le message doit contenir au moins 10 caractères";
  }

  if (message && message.length > 5000) {
    errors.message = "Le message ne peut pas dépasser 5000 caractères";
  }

  // Validation du téléphone (optionnel)
  if (phone && !/^[\d\s\-+().]+$/.test(phone)) {
    errors.phone = "Format de téléphone invalide";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validation des données de demande de prévention
 * @param {object} data - Données de la demande
 * @returns {object} Résultat de validation avec erreurs éventuelles
 */
function validatePreventionRequest(data) {
  const { dates, durees, lieu, publicConcerne, category } = data;
  const errors = {};

  // Validation des champs obligatoires
  if (!dates || dates.trim().length < 3) {
    errors.dates = "Les dates souhaitées sont requises (minimum 3 caractères)";
  }

  if (!durees || durees.trim().length < 2) {
    errors.durees = "La durée est requise (minimum 2 caractères)";
  }

  if (!lieu || lieu.trim().length < 2) {
    errors.lieu = "Le lieu est requis (minimum 2 caractères)";
  }

  if (!publicConcerne || publicConcerne.trim().length < 3) {
    errors.publicConcerne =
      "Le public concerné est requis (minimum 3 caractères)";
  }

  if (!category || !category.nom) {
    errors.category = "La catégorie de prévention est requise";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

module.exports = {
  isValidEmail,
  validateContactData,
  validatePreventionRequest,
};
