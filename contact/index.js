// contact/index.js
// Export du module contact

const contactRoutes = require("./contactRoutes");
const {
  processContactForm,
  testEmailConfiguration,
} = require("./contactService");

module.exports = {
  contactRoutes,
  // Export des services pour usage externe si besoin
  processContactForm,
  testEmailConfiguration,
};
