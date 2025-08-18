// health/index.js
// Export du module health

const healthRoutes = require("./healthRoutes");
const {
  getSystemHealth,
  checkSupabaseConnection,
  checkStripeConnection,
  sendTestEmail,
  getSystemMetrics,
} = require("./healthService");

module.exports = {
  healthRoutes,
  // Export des services pour usage externe si besoin
  getSystemHealth,
  checkSupabaseConnection,
  checkStripeConnection,
  sendTestEmail,
  getSystemMetrics,
};
