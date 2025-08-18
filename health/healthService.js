// health/healthService.js
// Service de santé et monitoring du système

const { supabase } = require("../config/database");
const { stripe } = require("../config/stripe");
const { CONTACT_EMAIL } = require("../config/email");
const { sendEmailWithRetry } = require("../emails");
const { logWithTimestamp } = require("../shared/logger");

/**
 * Teste la connexion à Supabase
 */
async function checkSupabaseConnection() {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from("users")
      .select("user_id")
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        status: "unhealthy",
        error: error.message,
        response_time: responseTime,
        last_check: new Date().toISOString(),
      };
    }

    return {
      status: "healthy",
      response_time: responseTime,
      last_check: new Date().toISOString(),
      details: `Connexion OK (${data.length >= 0 ? "données accessibles" : "table vide"})`,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      response_time: Date.now() - startTime,
      last_check: new Date().toISOString(),
    };
  }
}

/**
 * Teste la connexion à Stripe
 */
async function checkStripeConnection() {
  const startTime = Date.now();

  try {
    // Test simple de l'auth API
    await stripe.accounts.retrieve();

    const responseTime = Date.now() - startTime;

    return {
      status: "healthy",
      response_time: responseTime,
      last_check: new Date().toISOString(),
      details: "Auth API OK",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      response_time: Date.now() - startTime,
      last_check: new Date().toISOString(),
    };
  }
}

/**
 * Envoie un email de test
 */
async function sendTestEmail() {
  const startTime = Date.now();

  try {
    const testHTML = `
      <div style="padding: 30px; font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🏥 Test de Santé Email - Novapsy</h2>
        <p>✅ Le système d'email fonctionne correctement</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>Module :</strong> health/healthService.js</p>
        <p><strong>Type :</strong> Test automatique depuis /health</p>
      </div>
    `;

    const result = await sendEmailWithRetry(
      "lucleveque14@outlook.fr",
      "🏥 Test Santé Email - Novapsy",
      testHTML
    );

    const responseTime = Date.now() - startTime;

    if (result.success) {
      return {
        status: "healthy",
        response_time: responseTime,
        last_check: new Date().toISOString(),
        details: `Email envoyé (tentative ${result.attempt})`,
        message_id: result.messageId,
      };
    } else {
      return {
        status: "unhealthy",
        error: result.error,
        response_time: responseTime,
        last_check: new Date().toISOString(),
      };
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      response_time: Date.now() - startTime,
      last_check: new Date().toISOString(),
    };
  }
}

/**
 * Récupère les métriques système
 */
function getSystemMetrics() {
  const memUsage = process.memoryUsage();

  return {
    status: "healthy",
    uptime: process.uptime(),
    uptime_formatted: formatUptime(process.uptime()),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heap_used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heap_total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
    },
    node_version: process.version,
    platform: process.platform,
    last_check: new Date().toISOString(),
  };
}

/**
 * Formate le temps d'uptime en format lisible
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}j ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Fonction principale qui agrège tous les checks de santé
 */
async function getSystemHealth(includeEmailTest = false) {
  logWithTimestamp("info", "🏥 === CHECK SANTÉ SYSTÈME ===");

  const startTime = Date.now();

  // Checks de base (configuration)
  const configChecks = {
    email: {
      configured: !!process.env.RESEND_API_KEY,
      to: CONTACT_EMAIL,
    },
    stripe: {
      configured: !!process.env.STRIPE_SECRET_KEY,
    },
    supabase: {
      configured: !!process.env.SUPABASE_URL,
    },
  };

  // Checks de connectivité (parallèles pour être plus rapide)
  const connectivityPromises = [
    checkSupabaseConnection(),
    checkStripeConnection(),
  ];

  // Ajouter le test email si demandé
  if (includeEmailTest) {
    connectivityPromises.push(sendTestEmail());
  }

  const [supabaseCheck, stripeCheck, emailCheck] =
    await Promise.all(connectivityPromises);

  // Métriques système
  const systemMetrics = getSystemMetrics();

  // Déterminer le statut global
  const allChecks = [supabaseCheck, stripeCheck];
  if (emailCheck) allChecks.push(emailCheck);

  const hasUnhealthy = allChecks.some((check) => check.status === "unhealthy");
  const globalStatus = hasUnhealthy ? "degraded" : "healthy";

  const totalResponseTime = Date.now() - startTime;

  const result = {
    status: globalStatus,
    timestamp: new Date().toISOString(),
    response_time: totalResponseTime,
    version: "2.3.0-health-refactored",

    // Configuration (comme avant)
    services: configChecks,

    // Nouveaux checks de connectivité
    connectivity: {
      supabase: supabaseCheck,
      stripe: stripeCheck,
      ...(emailCheck && { email: emailCheck }),
    },

    // Métriques système
    system: systemMetrics,

    // Features (gardées pour compatibilité)
    features: {
      contact_form: true,
      email_retry: true,
      email_confirmation: true,
      prevention_requests: true,
      membership_management: true,
      training_purchases: true,
      newsletter: true,
    },

    // État du refactoring
    refactoring: {
      memberships: "✅ Refactorisé",
      emails: "✅ Refactorisé",
      trainings: "✅ Refactorisé",
      health: "✅ REFACTORISÉ", // ← Nouveau !
      contact: "⏳ En cours",
      prevention: "⏳ En cours",
      payments: "⏳ En cours",
    },

    // Modules
    modules: {
      emails: "✅ 9 fichiers modulaires",
      trainings: "✅ 3 fichiers modulaires",
      health: "✅ 3 fichiers modulaires", // ← Nouveau !
      templates: "✅ Centralisés",
      validation: "✅ Centralisée",
      core: "✅ Avec retry logic",
    },
  };

  logWithTimestamp(
    "info",
    `✅ Check santé terminé en ${totalResponseTime}ms - Status: ${globalStatus}`
  );

  return result;
}

module.exports = {
  getSystemHealth,
  checkSupabaseConnection,
  checkStripeConnection,
  sendTestEmail,
  getSystemMetrics,
};
