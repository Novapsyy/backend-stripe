/**
 * Utilitaire de logging avec timestamp
 * @param {string} level - Niveau de log (info, error, warn)
 * @param {string} message - Message à logger
 * @param {object} data - Données supplémentaires
 */
function logWithTimestamp(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

  if (level === "error") {
    console.error(logMessage, data || "");
  } else {
    console.log(logMessage, data || "");
  }
}

module.exports = {
  logWithTimestamp,
};
