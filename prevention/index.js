// prevention/index.js
// Export du module prevention

const preventionRoutes = require("./preventionRoutes");
const {
  processPreventionRequest,
  testPreventionRequest,
} = require("./preventionService");

module.exports = {
  preventionRoutes,
  // Export des services pour usage externe si besoin
  processPreventionRequest,
  testPreventionRequest,
};
