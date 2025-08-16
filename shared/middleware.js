const { ALLOWED_ORIGINS } = require("../config/constants");
const { logWithTimestamp } = require("./logger");

/**
 * Configuration CORS
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
}

/**
 * Gestionnaire d'erreurs global
 */
function errorHandler(err, req, res, next) {
  logWithTimestamp("error", "Erreur non gérée", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: "Erreur interne du serveur",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Une erreur est survenue",
  });
}

/**
 * Route non trouvée
 */
function notFoundHandler(req, res) {
  logWithTimestamp("warn", "Route non trouvée", {
    method: req.method,
    url: req.originalUrl,
  });

  res.status(404).json({
    success: false,
    error: "Route non trouvée",
    availableRoutes: ["POST /contact", "GET /contact/test", "GET /health"],
  });
}

module.exports = {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
};
