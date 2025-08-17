/**
 * Module central pour tous les services email
 * Exporte toutes les fonctions email organisées par thème
 */

// Core email functions
const { sendEmail, sendEmailWithRetry } = require("./emailCore");

// Email validation functions
const {
  isValidEmail,
  validateContactData,
  validatePreventionRequest,
} = require("./emailValidation");

// Email template functions
const {
  getPreventionThemeColors,
  generateContactEmailHTML,
  generateConfirmationEmailHTML,
  generatePreventionRequestEmailHTML,
  generateMembershipConfirmationHTML,
  generateAssociationMembershipConfirmationHTML,
  generateTrainingPurchaseConfirmationHTML,
} = require("./emailTemplates");

// Membership emails
const {
  sendMembershipConfirmationEmail,
  sendAssociationMembershipConfirmationEmail,
} = require("./membershipEmails");

// Training emails
const { sendTrainingPurchaseConfirmationEmail } = require("./trainingEmails");

// Contact emails
const { sendContactEmail } = require("./contactEmails");

// Prevention emails
const {
  sendPreventionRequest,
  testPreventionRequest,
} = require("./preventionEmails");

// Newsletter emails
const {
  sendNewsletter,
  getNewsletterSubscribers,
} = require("./newsletterEmails");

module.exports = {
  // Core functions
  sendEmail,
  sendEmailWithRetry,

  // Validation
  isValidEmail,
  validateContactData,
  validatePreventionRequest,

  // Templates - TOUS centralisés dans emailTemplates.js
  getPreventionThemeColors,
  generateContactEmailHTML,
  generateConfirmationEmailHTML,
  generatePreventionRequestEmailHTML,
  generateMembershipConfirmationHTML,
  generateAssociationMembershipConfirmationHTML,
  generateTrainingPurchaseConfirmationHTML,

  // Business functions
  sendMembershipConfirmationEmail,
  sendAssociationMembershipConfirmationEmail,
  sendTrainingPurchaseConfirmationEmail,
  sendContactEmail,
  sendPreventionRequest,
  testPreventionRequest,
  sendNewsletter,
  getNewsletterSubscribers,
};
