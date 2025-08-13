const { supabase } = require('../config/database');
const { logWithTimestamp } = require('../utils/logger');

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

/**
 * Vérifie si un utilisateur est membre actif
 * @param {string} userId - UUID de l'utilisateur
 * @returns {Promise<boolean>} True si l'utilisateur est membre
 */
async function checkIfUserIsMember(userId) {
  try {
    const { data, error } = await supabase
      .from("memberships")
      .select("membership_end")
      .eq("user_id", userId)
      .gte("membership_end", new Date().toISOString())
      .single();

    if (error) {
      return false;
    }

    return data && new Date(data.membership_end) > new Date();
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification statut membre", {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Met à jour le statut d'un utilisateur vers membre
 * @param {string} userId - UUID de l'utilisateur
 * @param {string} statusId - ID du statut
 * @returns {Promise<boolean>} Succès de la mise à jour
 */
async function updateUserStatusToMembership(userId, statusId) {
  try {
    logWithTimestamp("info", "Mise à jour statut utilisateur vers membre", {
      userId,
      statusId,
    });

    const { error } = await supabase
      .from("users_status")
      .update({
        status_id: statusId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      logWithTimestamp("error", "Erreur mise à jour statut utilisateur", {
        userId,
        statusId,
        error: error.message,
      });
      return false;
    }

    logWithTimestamp("info", "Statut utilisateur mis à jour avec succès", {
      userId,
      statusId,
    });
    return true;
  } catch (error) {
    logWithTimestamp("error", "Erreur mise à jour statut utilisateur", {
      userId,
      statusId,
      error: error.message,
    });
    return false;
  }
}

module.exports = {
  getMailByUser,
  checkIfUserIsMember,
  updateUserStatusToMembership
};