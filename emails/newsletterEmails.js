const { sendEmail } = require("./emailCore");
const { supabase } = require("../config/database");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Envoie une newsletter à tous les abonnés
 * @param {string} subject - Sujet de la newsletter
 * @param {string} html - Contenu HTML de la newsletter
 * @returns {Promise<object>} Résultat de l'envoi avec statistiques
 */
async function sendNewsletter(subject, html) {
  logWithTimestamp("info", "📧 Début envoi newsletter", { subject });

  if (!subject) {
    return {
      success: false,
      error: "Le sujet est requis",
    };
  }

  if (!html) {
    return {
      success: false,
      error: "Le contenu HTML est requis",
    };
  }

  try {
    // Récupérer les emails des utilisateurs abonnés à la newsletter
    const { data: subscribers, error: subscribersError } = await supabase.from(
      "newsletter_subscribers"
    ).select(`
        users(user_email)
      `);

    if (subscribersError) {
      logWithTimestamp("error", "Erreur récupération abonnés newsletter", {
        message: subscribersError.message,
        details: subscribersError.details,
        hint: subscribersError.hint,
      });
      return {
        success: false,
        error: "Erreur récupération abonnés",
        details: subscribersError.message,
      };
    }

    if (!subscribers || subscribers.length === 0) {
      logWithTimestamp("info", "Aucun abonné newsletter trouvé");
      return {
        success: false,
        error: "Aucun abonné trouvé",
      };
    }

    // Extraire les emails des utilisateurs
    const subscribersEmails = subscribers
      .map((subscriber) => subscriber.users?.user_email)
      .filter(Boolean); // Filtrer les emails null/undefined

    logWithTimestamp("info", "Abonnés newsletter trouvés", {
      total: subscribers.length,
      validEmails: subscribersEmails.length,
    });

    let sentCount = 0;
    let errorCount = 0;
    const errors = [];

    // Envoyer la newsletter à chaque abonné
    for (const email of subscribersEmails) {
      try {
        const success = await sendEmail(email, subject, html);
        if (success) {
          sentCount++;
        } else {
          errorCount++;
          errors.push({ email, error: "Échec envoi" });
        }

        // Petite pause entre chaque envoi pour éviter les limites de taux
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        errors.push({ email, error: error.message });
        logWithTimestamp("error", "Erreur envoi newsletter individuel", {
          email,
          error: error.message,
        });
      }
    }

    logWithTimestamp("info", "Newsletter envoyée - Statistiques finales", {
      sent: sentCount,
      errors: errorCount,
      total: subscribersEmails.length,
      successRate: `${((sentCount / subscribersEmails.length) * 100).toFixed(1)}%`,
    });

    return {
      success: true,
      message: "Newsletter envoyée avec succès",
      stats: {
        sent: sentCount,
        errors: errorCount,
        total: subscribersEmails.length,
        successRate: ((sentCount / subscribersEmails.length) * 100).toFixed(1),
        errorDetails: errors.slice(0, 10), // Limiter les erreurs affichées
      },
    };
  } catch (error) {
    logWithTimestamp("error", "Erreur critique envoi newsletter", {
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: "Erreur critique lors de l'envoi",
      details: error.message,
    };
  }
}

/**
 * Récupère la liste des abonnés à la newsletter
 * @returns {Promise<object>} Liste des abonnés ou erreur
 */
async function getNewsletterSubscribers() {
  try {
    const { data: subscribers, error } = await supabase
      .from("newsletter_subscribers")
      .select(
        `
        subscription_id,
        subscription_date,
        users(user_id, user_email, user_name)
      `
      )
      .order("subscription_date", { ascending: false });

    if (error) {
      logWithTimestamp("error", "Erreur récupération abonnés", error);
      return {
        success: false,
        error: error.message,
      };
    }

    const cleanSubscribers = subscribers
      .filter((sub) => sub.users) // Filtrer les abonnements sans utilisateur
      .map((sub) => ({
        subscription_id: sub.subscription_id,
        subscription_date: sub.subscription_date,
        user_id: sub.users.user_id,
        user_email: sub.users.user_email,
        user_name: sub.users.user_name,
      }));

    return {
      success: true,
      subscribers: cleanSubscribers,
      total: cleanSubscribers.length,
    };
  } catch (error) {
    logWithTimestamp("error", "Exception récupération abonnés", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  sendNewsletter,
  getNewsletterSubscribers,
};
