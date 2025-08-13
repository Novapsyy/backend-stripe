/**
 * Valide les données du formulaire de contact
 * @param {object} data - Données du formulaire
 * @returns {object} Résultat de validation avec isValid et errors
 */
function validateContactData(data) {
  const errors = [];
  
  // Validation du nom
  if (!data.name || data.name.trim().length === 0) {
    errors.push("Le nom est requis");
  } else if (data.name.trim().length < 2) {
    errors.push("Le nom doit contenir au moins 2 caractères");
  }
  
  // Validation de l'email
  if (!data.email || data.email.trim().length === 0) {
    errors.push("L'email est requis");
  } else if (!isValidEmail(data.email)) {
    errors.push("L'email n'est pas valide");
  }
  
  // Validation du message
  if (!data.message || data.message.trim().length === 0) {
    errors.push("Le message est requis");
  } else if (data.message.trim().length < 10) {
    errors.push("Le message doit contenir au moins 10 caractères");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valide le format d'un email
 * @param {string} email - Email à valider
 * @returns {boolean} True si l'email est valide
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  validateContactData,
  isValidEmail
};