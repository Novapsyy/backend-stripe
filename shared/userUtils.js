const { supabase } = require("../config/database");
const { logWithTimestamp } = require("./logger");

/**
 * Récupère l'email d'un utilisateur par son ID
 * @param {string} userId - UUID de l'utilisateur
 * @returns {Promise<string|null>} Email de l'utilisateur ou null
 */
async function getMailByUser(userId) {
  try {
    logWithTimestamp("info", "Récupération email utilisateur", { userId });

    const { data, error } = await supabase
      .from("users")
      .select("user_email")
      .eq("user_id", userId)
      .single();

    if (error) {
      logWithTimestamp("error", "Erreur récupération email utilisateur", {
        userId,
        error: error.message,
      });
      return null;
    }

    logWithTimestamp("info", "Email utilisateur récupéré", {
      userId,
      email: data.user_email,
    });

    return data.user_email;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération email utilisateur", {
      userId,
      error: error.message,
    });
    return null;
  }
}

module.exports = {
  getMailByUser,
};
