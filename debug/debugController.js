// debug/debugController.js
const { logWithTimestamp } = require("../shared/logger");
const { getMailByUser } = require("../shared/userUtils");

/**
 * Contrôleur pour récupérer l'email d'un utilisateur (debug)
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const getUserEmailController = async (req, res) => {
  const { userId } = req.params;

  logWithTimestamp(
    "info",
    `=== DEBUG: Récupération email utilisateur ${userId} ===`
  );

  // Validation de l'ID utilisateur
  if (!userId || userId.trim() === "") {
    logWithTimestamp("warn", "ID utilisateur manquant ou invalide");
    return res.status(400).json({
      error: "ID utilisateur requis",
    });
  }

  try {
    const email = await getMailByUser(userId);

    if (email) {
      logWithTimestamp("info", `Email trouvé pour utilisateur ${userId}`, {
        userId,
        emailFound: !!email,
      });
      res.json({
        userId,
        email,
      });
    } else {
      logWithTimestamp("warn", `Aucun email trouvé pour utilisateur ${userId}`);
      res.status(404).json({
        error: "Email utilisateur non trouvé",
        userId,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération email utilisateur", {
      userId,
      error: error.message,
    });
    res.status(500).json({
      error: error.message,
      userId,
    });
  }
};

module.exports = {
  getUserEmailController,
};
