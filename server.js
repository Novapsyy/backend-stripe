require("dotenv").config();
const express = require("express");

// Configuration imports
const { PORT, FRONTEND_URL, WEBHOOK_SECRET } = require("./config/constants");
const { supabase } = require("./config/database");
const { resend, FROM_EMAIL, CONTACT_EMAIL } = require("./config/email");
const { stripe } = require("./config/stripe");

// Shared utilities imports
const { logWithTimestamp } = require("./shared/logger");
const { getMailByUser } = require("./shared/userUtils");
const {
  getPriceFromPriceId,
  getTrainingDetails,
  calculateDiscountedPrice,
} = require("./shared/pricing");
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
} = require("./shared/middleware");

// Business logic imports
const {
  checkIfUserIsMember,
  createMembership,
} = require("./memberships/membershipService");
const membershipRoutes = require("./memberships/membershipRoutes");

const app = express();

// ========================
// MIDDLEWARES
// ========================

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Configuration CORS
app.use(corsMiddleware);

// ========================
// ROUTES MODULAIRES
// ========================

// Routes des adhésions
app.use("/", membershipRoutes);

// ========================
// FONCTIONS UTILITAIRES RESTANTES
// ========================

/**
 * Envoie un email via Resend
 * @param {string} to - Email du destinataire
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendEmail(to, subject, html) {
  try {
    logWithTimestamp("info", "Envoi email", { to, subject });

    if (!to || !to.includes("@")) {
      logWithTimestamp("error", "Email invalide", { to });
      return false;
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: to,
      subject: subject,
      html: html,
    });

    if (result.data && result.data.id) {
      logWithTimestamp("info", "✅ Email envoyé avec succès", {
        to,
        subject,
        messageId: result.data.id,
      });
      return true;
    } else {
      logWithTimestamp("error", "❌ Résultat Resend suspect", {
        to,
        subject,
        result: result,
      });
      return false;
    }
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur envoi email", {
      to,
      subject,
      error: error.message,
    });
    return false;
  }
}

// ========================
// FONCTIONS MÉTIER - FORMATIONS
// ========================

/**
 * Envoie un email de confirmation d'achat de formation
 * @param {string} userId - UUID de l'utilisateur
 * @param {object} purchaseData - Données de l'achat
 * @param {object} trainingDetails - Détails de la formation
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendTrainingPurchaseConfirmationEmail(
  userId,
  purchaseData,
  trainingDetails
) {
  try {
    const userEmail = await getMailByUser(userId);
    if (!userEmail) {
      logWithTimestamp(
        "warn",
        "Email utilisateur non trouvé pour confirmation formation",
        { userId }
      );
      return false;
    }

    const subject = `Confirmation d'achat - Formation ${trainingDetails.name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Votre formation a été achetée avec succès !</h2>
        
        <p>Nous vous confirmons l'achat de votre formation.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de votre achat :</h3>
          <p><strong>Formation :</strong> ${trainingDetails.full_name}</p>
          <p><strong>Durée :</strong> ${trainingDetails.duration} heures</p>
          <p><strong>Prix payé :</strong> ${purchaseData.purchase_amount}€</p>
          ${
            purchaseData.member_discount > 0
              ? `<p><strong>Réduction adhérent :</strong> -${purchaseData.member_discount}€</p>`
              : ""
          }
          <p><strong>Date d'achat :</strong> ${new Date(
            purchaseData.purchase_date
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <p>Vous recevrez prochainement les informations concernant l'organisation de votre formation.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

    return await sendEmail(userEmail, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation formation", {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Crée un achat de formation
 * @param {object} metadata - Métadonnées de la session Stripe
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<object>} Données de l'achat créé
 */
async function createTrainingPurchase(metadata, session) {
  const {
    userId,
    trainingId,
    priceId,
    originalPrice,
    discountedPrice,
    isMember,
  } = metadata;

  logWithTimestamp("info", "=== 🎓 DÉBUT CRÉATION ACHAT FORMATION ===");
  logWithTimestamp("info", "📋 Metadata reçues", {
    userId,
    trainingId,
    priceId,
    originalPrice,
    discountedPrice,
    isMember,
    sessionId: session.id,
  });

  try {
    // Vérifier que l'achat n'existe pas déjà
    const { data: existingPurchase, error: checkError } = await supabase
      .from("trainings_purchase")
      .select("purchase_id")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      logWithTimestamp(
        "error",
        "Erreur vérification achat existant",
        checkError
      );
      throw checkError;
    }

    if (existingPurchase) {
      logWithTimestamp("warn", "⚠️ Achat déjà existant", {
        purchase_id: existingPurchase.purchase_id,
        session_id: session.id,
      });
      return existingPurchase;
    }

    // Récupérer les détails de la formation
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      throw new Error(`Formation non trouvée pour priceId: ${priceId}`);
    }

    logWithTimestamp("info", "📚 Détails formation", trainingDetails);

    // Données à insérer
    const purchaseData = {
      user_id: userId,
      training_id: trainingId,
      purchase_date: new Date().toISOString(),
      purchase_amount: parseFloat(discountedPrice),
      original_price: parseFloat(originalPrice),
      member_discount:
        isMember === "true"
          ? parseFloat(originalPrice) - parseFloat(discountedPrice)
          : 0,
      payment_status: "paid",
      stripe_session_id: session.id,
      hours_purchased: trainingDetails.duration,
      hours_consumed: 0,
    };

    logWithTimestamp(
      "info",
      "💾 Données achat formation à insérer",
      purchaseData
    );

    const { data: purchase, error: purchaseError } = await supabase
      .from("trainings_purchase")
      .insert(purchaseData)
      .select()
      .single();

    if (purchaseError) {
      logWithTimestamp("error", "❌ Erreur création achat formation", {
        error: purchaseError.message,
        code: purchaseError.code,
        details: purchaseError.details,
        purchaseData,
      });
      throw purchaseError;
    }

    logWithTimestamp("info", "✅ Achat formation créé avec succès", {
      purchase_id: purchase.purchase_id,
      user_id: purchase.user_id,
      training_id: purchase.training_id,
      amount: purchase.purchase_amount,
    });

    // Envoi email de confirmation
    await sendTrainingPurchaseConfirmationEmail(
      userId,
      purchase,
      trainingDetails
    );

    logWithTimestamp(
      "info",
      "=== 🎉 FIN CRÉATION ACHAT FORMATION - SUCCÈS ==="
    );
    return purchase;
  } catch (error) {
    logWithTimestamp("error", "=== ❌ ERREUR CRÉATION ACHAT FORMATION ===", {
      error: error.message,
      code: error.code,
      details: error.details,
      metadata,
      sessionId: session.id,
    });
    throw error;
  }
}

/**
 * Validation d'email
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validation des données du formulaire de contact
 */
function validateContactData(data) {
  const { name, email, phone, message } = data;
  const errors = {};

  // Validation du nom
  if (!name || name.trim().length < 2) {
    errors.name = "Le nom doit contenir au moins 2 caractères";
  }

  // Validation de l'email
  if (!email || !isValidEmail(email)) {
    errors.email = "Format d'email invalide";
  }

  // Validation du message
  if (!message || message.trim().length < 10) {
    errors.message = "Le message doit contenir au moins 10 caractères";
  }

  if (message && message.length > 5000) {
    errors.message = "Le message ne peut pas dépasser 5000 caractères";
  }

  // Validation du téléphone (optionnel)
  if (phone && !/^[\d\s\-+().]+$/.test(phone)) {
    errors.phone = "Format de téléphone invalide";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// ========================
// FONCTIONS DE VALIDATION DEMANDE PRÉVENTION
// ========================

/**
 * Validation des données de demande de prévention
 */
function validatePreventionRequest(data) {
  const { dates, durees, lieu, publicConcerne, category } = data;
  const errors = {};

  // Validation des champs obligatoires
  if (!dates || dates.trim().length < 3) {
    errors.dates = "Les dates souhaitées sont requises (minimum 3 caractères)";
  }

  if (!durees || durees.trim().length < 2) {
    errors.durees = "La durée est requise (minimum 2 caractères)";
  }

  if (!lieu || lieu.trim().length < 2) {
    errors.lieu = "Le lieu est requis (minimum 2 caractères)";
  }

  if (!publicConcerne || publicConcerne.trim().length < 3) {
    errors.publicConcerne =
      "Le public concerné est requis (minimum 3 caractères)";
  }

  if (!category || !category.nom) {
    errors.category = "La catégorie de prévention est requise";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Détermine les couleurs selon le thème de prévention
 */
function getPreventionThemeColors(categoryName) {
  const name = categoryName.toLowerCase();

  // Violet pour psycho
  if (
    name.includes("psycho") ||
    name.includes("mental") ||
    name.includes("stress") ||
    name.includes("burnout") ||
    name.includes("anxiété") ||
    name.includes("dépression")
  ) {
    return {
      primary: "#8b5cf6", // violet-500
      secondary: "#7c3aed", // violet-600
      gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    };
  }

  // Rose pour sexualité
  if (
    name.includes("sex") ||
    name.includes("intimité") ||
    name.includes("couple") ||
    name.includes("genre") ||
    name.includes("orientation")
  ) {
    return {
      primary: "#ec4899", // pink-500
      secondary: "#db2777", // pink-600
      gradient: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)",
    };
  }

  // Bleu foncé pour handicaps invisibles
  if (
    name.includes("handicap") ||
    name.includes("invisible") ||
    name.includes("accessibilité") ||
    name.includes("inclusion") ||
    name.includes("différence")
  ) {
    return {
      primary: "#1e40af", // blue-800
      secondary: "#1e3a8a", // blue-900
      gradient: "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)",
    };
  }

  // Couleur par défaut (vert)
  return {
    primary: "#10b981", // emerald-500
    secondary: "#059669", // emerald-600
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  };
}

// ========================
// FONCTIONS EMAIL
// ========================

/**
 * Génère le HTML pour l'email de contact
 */
function generateContactEmailHTML(contactData) {
  const { name, email, phone, message } = contactData;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nouveau message de contact - Novapsy</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
            📧 Nouveau Message de Contact
          </h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px;">
            Site web Novapsy
          </p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          
          <!-- Contact Information -->
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px; border-left: 4px solid #667eea;">
            <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
              👤 Informations du contact
            </h2>
            
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 100px; font-weight: 600; color: #4a5568;">Nom :</span>
              <span style="color: #2d3748; font-size: 16px;">${name}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 100px; font-weight: 600; color: #4a5568;">Email :</span>
              <a href="mailto:${email}" style="color: #667eea; text-decoration: none; font-size: 16px;">${email}</a>
            </div>
            
            ${
              phone
                ? `
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 100px; font-weight: 600; color: #4a5568;">Téléphone :</span>
              <a href="tel:${phone}" style="color: #667eea; text-decoration: none; font-size: 16px;">${phone}</a>
            </div>
            `
                : ""
            }
            
            <div style="margin-bottom: 0;">
              <span style="display: inline-block; width: 100px; font-weight: 600; color: #4a5568;">Date :</span>
              <span style="color: #2d3748; font-size: 16px;">${new Date().toLocaleString(
                "fr-FR",
                {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}</span>
            </div>
          </div>

          <!-- Message -->
          <div style="margin-bottom: 30px;">
            <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
              💬 Message
            </h2>
            <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 25px;">
              <div style="color: #2d3748; line-height: 1.7; font-size: 16px; white-space: pre-wrap;">${message}</div>
            </div>
          </div>

          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:${email}?subject=Re: Votre message sur Novapsy" 
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              📧 Répondre directement
            </a>
          </div>

          <!-- Quick Response -->
          <div style="background-color: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="margin: 0; color: #2f855a; font-size: 14px;">
              <strong>💡 Réponse rapide :</strong> Cliquez sur "Répondre" dans votre client email pour répondre directement à ${name}
            </p>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #2d3748; color: #a0aec0; text-align: center; padding: 25px;">
          <p style="margin: 0; font-size: 14px;">
            Email généré automatiquement par le formulaire de contact du site Novapsy
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.8;">
            Ne pas répondre à cet email - Répondre directement au contact
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Envoie un email via Resend avec retry
 */
async function sendEmailWithRetry(to, subject, html, options = {}) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWithTimestamp(
        "info",
        `Tentative ${attempt}/${maxRetries} d'envoi email`,
        { to, subject }
      );

      const emailData = {
        from: FROM_EMAIL,
        to: to,
        subject: subject,
        html: html,
        ...options,
      };

      const result = await resend.emails.send(emailData);

      if (result.data && result.data.id) {
        logWithTimestamp("info", "✅ Email envoyé avec succès", {
          to,
          messageId: result.data.id,
          attempt,
        });
        return {
          success: true,
          messageId: result.data.id,
          attempt,
        };
      }

      if (result.error) {
        lastError = result.error;
        logWithTimestamp("error", `❌ Erreur Resend (tentative ${attempt})`, {
          to,
          error: result.error,
        });
      }
    } catch (error) {
      lastError = error.message;
      logWithTimestamp(
        "error",
        `❌ Exception envoi email (tentative ${attempt})`,
        {
          to,
          error: error.message,
        }
      );
    }

    // Attendre avant retry (sauf dernière tentative)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  logWithTimestamp("error", "💥 Échec définitif envoi email", {
    to,
    totalAttempts: maxRetries,
    lastError,
  });

  return {
    success: false,
    error: lastError,
    totalAttempts: maxRetries,
  };
}

/**
 * Génère l'email de confirmation pour l'utilisateur
 */
function generateConfirmationEmailHTML(userName, userMessage) {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmation - Message reçu</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
            ✅ Message bien reçu !
          </h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px;">
            Merci pour votre message
          </p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          
          <p style="font-size: 18px; color: #2d3748; margin: 0 0 20px 0;">
            Bonjour <strong>${userName}</strong>,
          </p>
          
          <p style="font-size: 16px; color: #4a5568; line-height: 1.6; margin: 0 0 25px 0;">
            Nous avons bien reçu votre message et vous remercions de nous avoir contactés. 
            Notre équipe vous répondra dans les plus brefs délais.
          </p>

          <!-- Message Quote -->
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <p style="margin: 0; color: #4a5568; font-style: italic; font-size: 15px;">
              "${userMessage.length > 200 ? userMessage.substring(0, 200) + "..." : userMessage}"
            </p>
          </div>

          <p style="font-size: 16px; color: #4a5568; line-height: 1.6; margin: 25px 0;">
            Si votre demande est urgente, vous pouvez également nous contacter directement à 
            <a href="mailto:contact@novapsy.info" style="color: #667eea; text-decoration: none;">contact@novapsy.info</a>
          </p>

          <p style="font-size: 16px; color: #2d3748; margin: 25px 0 0 0;">
            Cordialement,<br>
            <strong>L'équipe Novapsy</strong>
          </p>

        </div>

        <!-- Footer -->
        <div style="background-color: #2d3748; color: #a0aec0; text-align: center; padding: 25px;">
          <p style="margin: 0; font-size: 14px;">
            Ceci est un email automatique de confirmation
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.8;">
            Pour toute question, contactez-nous à contact@novapsy.info
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Génère le HTML pour l'email de demande de prévention
 */
function generatePreventionRequestEmailHTML(requestData) {
  const {
    dates,
    durees,
    lieu,
    publicConcerne,
    thematiquesEnvisagees,
    formeEnvisagee,
    message,
    category,
    timestamp,
  } = requestData;

  // Obtenir les couleurs du thème
  const themeColors = getPreventionThemeColors(category.nom);

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nouvelle demande de prévention - ${category.nom}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">
            🎯 Nouvelle Demande de Prévention
          </h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px;">
            Catalogue des Préventions - Novapsy
          </p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          
          <!-- Prevention Category -->
          <div style="background: ${themeColors.gradient}; border-radius: 12px; padding: 25px; margin-bottom: 30px; color: white;">
            <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 600;">
              📚 ${category.nom}
            </h2>
            ${
              category.description
                ? `
              <p style="margin: 0; font-size: 16px; opacity: 0.9; line-height: 1.5;">
                ${category.description}
              </p>
            `
                : ""
            }
          </div>

          <!-- Request Details -->
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px; border-left: 4px solid #667eea;">
            <h3 style="color: #2d3748; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
              📋 Détails de la demande
            </h3>
            
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 150px; font-weight: 600; color: #4a5568;">Dates souhaitées :</span>
              <span style="color: #2d3748; font-size: 16px;">${dates}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 150px; font-weight: 600; color: #4a5568;">Durée :</span>
              <span style="color: #2d3748; font-size: 16px;">${durees}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <span style="display: inline-block; width: 150px; font-weight: 600; color: #4a5568;">Lieu :</span>
              <span style="color: #2d3748; font-size: 16px;">${lieu}</span>
            </div>
            
            <div style="margin-bottom: 0;">
              <span style="display: inline-block; width: 150px; font-weight: 600; color: #4a5568;">Public concerné :</span>
              <span style="color: #2d3748; font-size: 16px;">${publicConcerne}</span>
            </div>
          </div>

          ${
            thematiquesEnvisagees || formeEnvisagee
              ? `
          <!-- Optional Details -->
          <div style="margin-bottom: 30px;">
            <h3 style="color: #2d3748; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
              🔧 Personnalisation demandée
            </h3>
            
            ${
              thematiquesEnvisagees
                ? `
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
              <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #4a5568;">
                Thématiques envisagées :
              </h4>
              <div style="color: #2d3748; line-height: 1.6; font-size: 15px;">
                ${thematiquesEnvisagees.replace(/\n/g, "<br>")}
              </div>
            </div>
            `
                : ""
            }
            
            ${
              formeEnvisagee
                ? `
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
              <h4 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #4a5568;">
                Forme envisagée :
              </h4>
              <div style="color: #2d3748; line-height: 1.6; font-size: 15px;">
                ${formeEnvisagee.replace(/\n/g, "<br>")}
              </div>
            </div>
            `
                : ""
            }
          </div>
          `
              : ""
          }

          ${
            message
              ? `
          <!-- Additional Message -->
          <div style="margin-bottom: 30px;">
            <h3 style="color: #2d3748; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
              💬 Message complémentaire
            </h3>
            <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 25px;">
              <div style="color: #2d3748; line-height: 1.7; font-size: 16px; white-space: pre-wrap;">${message}</div>
            </div>
          </div>
          `
              : ""
          }

          <!-- Metadata -->
          <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
            <h4 style="margin: 0 0 15px 0; color: #0369a1; font-size: 16px; font-weight: 600;">
              ℹ️ Informations de la demande
            </h4>
            <div style="color: #0369a1; font-size: 14px;">
              <p style="margin: 5px 0;">
                <strong>Date de demande :</strong> ${new Date(
                  timestamp
                ).toLocaleString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              📞 Traiter cette demande de prévention
            </div>
          </div>

          <!-- Contact Info -->
          <div style="background-color: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="margin: 0; color: #2f855a; font-size: 14px;">
              <strong>💡 Action recommandée :</strong> Contacter le demandeur pour finaliser les modalités de la formation
            </p>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #2d3748; color: #a0aec0; text-align: center; padding: 25px;">
          <p style="margin: 0; font-size: 14px;">
            Email généré automatiquement par le Catalogue des Préventions - Novapsy
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.8;">
            Cette demande provient du formulaire de prévention personnalisée
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

// ========================
// ROUTES API - FORMATIONS
// ========================

/**
 * POST /create-training-checkout
 * Crée une session de paiement pour une formation avec réduction adhérent
 * Body: { priceId, userId, trainingId }
 */
app.post("/create-training-checkout", async (req, res) => {
  const { priceId, userId, trainingId } = req.body;

  logWithTimestamp("info", "=== CRÉATION SESSION FORMATION ===");
  logWithTimestamp("info", "Données reçues", { priceId, userId, trainingId });

  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!userId) return res.status(400).json({ error: "userId manquant" });
  if (!trainingId)
    return res.status(400).json({ error: "trainingId manquant" });

  try {
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      return res.status(400).json({ error: "Formation non trouvée" });
    }

    const isMember = await checkIfUserIsMember(userId);
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

    // Récupérer l'email de l'utilisateur
    const userEmail = await getMailByUser(userId);

    const sessionConfig = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Formation ${trainingDetails.name}`,
              description: `${trainingDetails.full_name} - ${trainingDetails.duration} heures`,
              metadata: {
                training_type: trainingDetails.training_type,
                duration: trainingDetails.duration.toString(),
              },
            },
            unit_amount: Math.round(finalPrice * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/success-training?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/formations`,
      payment_method_types: ["card"],
      metadata: {
        userId: userId.toString(),
        trainingId: trainingId.toString(),
        priceId: priceId,
        originalPrice: trainingDetails.base_price.toString(),
        discountedPrice: finalPrice.toString(),
        isMember: isMember.toString(),
        type: "training_purchase",
        trainingName: trainingDetails.full_name,
        duration: trainingDetails.duration.toString(),
      },
      // IMPORTANT: Ajouter ces options pour créer automatiquement un customer
      customer_creation: "always",
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Formation ${trainingDetails.full_name}`,
          metadata: {
            type: "training_purchase",
            userId: userId.toString(),
            trainingId: trainingId.toString(),
          },
        },
      },
    };

    // Si on a un email, l'ajouter
    if (userEmail) {
      sessionConfig.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logWithTimestamp("info", "Session Stripe formation créée avec succès", {
      sessionId: session.id,
      originalPrice: trainingDetails.base_price,
      finalPrice: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      isMember,
      customerCreation: "always",
    });

    res.status(200).json({
      url: session.url,
      training_details: {
        name: trainingDetails.name,
        full_name: trainingDetails.full_name,
        original_price: trainingDetails.base_price,
        final_price: finalPrice,
        discount: isMember ? trainingDetails.member_discount : 0,
        is_member: isMember,
      },
    });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe formation", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /check-training-purchase/:userId/:trainingId
 * Vérifie si un utilisateur a déjà acheté une formation
 */
app.get("/check-training-purchase/:userId/:trainingId", async (req, res) => {
  const { userId, trainingId } = req.params;

  try {
    const { data, error } = await supabase
      .from("trainings_purchase")
      .select("*")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .single();

    if (error && error.code !== "PGRST116") {
      logWithTimestamp("error", "Erreur vérification achat formation", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      purchased: !!data,
      purchase_details: data || null,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification achat formation", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /process-training-purchase
 * Traite le succès d'un paiement de formation
 */
app.post("/process-training-purchase", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS FORMATION ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    logWithTimestamp("info", "Session Stripe récupérée", {
      id: session.id,
      payment_status: session.payment_status,
      mode: session.mode,
    });

    if (session.payment_status === "paid") {
      await createTrainingPurchase(session.metadata, session);
      logWithTimestamp(
        "info",
        "Achat formation créé avec succès pour la session",
        session.id
      );
      res.json({ success: true, message: "Formation achetée avec succès" });
    } else {
      logWithTimestamp("warn", "Paiement non confirmé", session.payment_status);
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur traitement succès formation", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /training-details/:priceId/:userId
 * Récupère les détails d'une formation avec prix calculé
 */
app.get("/training-details/:priceId/:userId", async (req, res) => {
  const { priceId, userId } = req.params;

  logWithTimestamp("info", "Récupération détails formation", {
    priceId,
    userId,
  });

  try {
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      return res.status(404).json({ error: "Formation non trouvée" });
    }

    const isMember = await checkIfUserIsMember(userId);
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

    res.json({
      ...trainingDetails,
      final_price: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      is_member: isMember,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération détails formation", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================
// WEBHOOKS STRIPE
// ========================

/**
 * POST /webhook
 * Gestionnaire des webhooks Stripe pour les paiements uniques
 * Traite les évènements: checkout.session.completed, payment_intent.*
 */
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    logWithTimestamp("error", "Erreur signature webhook", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logWithTimestamp("info", "🔔 Webhook reçu", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        logWithTimestamp("info", "📋 Session checkout complétée", {
          id: session.id,
          type: session.metadata?.type || "unknown",
          payment_status: session.payment_status,
        });

        try {
          if (session.metadata.type === "membership_onetime") {
            logWithTimestamp(
              "info",
              "👥 Traitement forfait adhésion via webhook",
              session.id
            );

            const result = await createMembership(session.metadata, session);

            logWithTimestamp(
              "info",
              "✅ Forfait adhésion créé avec succès via webhook",
              {
                session_id: session.id,
                membership_id: result.membership_id,
                user_id: session.metadata.userId,
              }
            );
          } else if (session.metadata.type === "training_purchase") {
            logWithTimestamp(
              "info",
              "🎓 Traitement achat formation via webhook",
              session.id
            );

            const result = await createTrainingPurchase(
              session.metadata,
              session
            );

            logWithTimestamp(
              "info",
              "✅ Achat formation créé avec succès via webhook",
              {
                session_id: session.id,
                purchase_id: result.purchase_id,
                user_id: session.metadata.userId,
                training_id: session.metadata.trainingId,
              }
            );
          } else {
            logWithTimestamp(
              "warn",
              "⚠️ Type de transaction inconnu",
              session.metadata?.type
            );
          }
        } catch (error) {
          logWithTimestamp(
            "error",
            "❌ ERREUR CRITIQUE - Échec traitement session",
            {
              session_id: session.id,
              type: session.metadata?.type || "unknown",
              error: error.message,
            }
          );
        }
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        logWithTimestamp("info", "💰 Paiement unique réussi", {
          payment_intent_id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
        });
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object;
        logWithTimestamp("warn", "❌ Paiement unique échoué", {
          payment_intent_id: failedPayment.id,
          amount: failedPayment.amount / 100,
        });
        break;

      default:
        logWithTimestamp("info", "ℹ️ Type d'évènement non géré", event.type);
    }
  } catch (error) {
    logWithTimestamp("error", "❌ ERREUR GLOBALE WEBHOOK", {
      event_type: event.type,
      error: error.message,
    });
  }

  res.json({ received: true });
});

// ========================
// ROUTE FORMULAIRE DE CONTACT
// ========================

/**
 * POST /contact
 * Traite le formulaire de contact et envoie un email
 */
app.post("/contact", async (req, res) => {
  logWithTimestamp("info", "🔥 === NOUVEAU MESSAGE DE CONTACT ===");

  const { name, email, phone, message } = req.body;

  logWithTimestamp("info", "📋 Données reçues", {
    name: name || "MANQUANT",
    email: email || "MANQUANT",
    phone: phone || "Non fourni",
    messageLength: message ? message.length : 0,
  });

  // Validation des données
  const validation = validateContactData({ name, email, phone, message });

  if (!validation.isValid) {
    logWithTimestamp("warn", "❌ Validation échouée", validation.errors);
    return res.status(400).json({
      success: false,
      error: "Données invalides",
      errors: validation.errors,
    });
  }

  try {
    // Préparer les données propres
    const cleanData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      message: message.trim(),
    };

    // Générer l'email HTML
    const emailSubject = `[Site Web] Nouveau message de ${cleanData.name}`;
    const emailHTML = generateContactEmailHTML(cleanData);

    logWithTimestamp(
      "info",
      "🚀 ENVOI EMAIL PRINCIPAL vers contact@novapsy.info"
    );

    // Envoyer l'email principal avec reply-to
    const emailResult = await sendEmailWithRetry(
      CONTACT_EMAIL,
      emailSubject,
      emailHTML,
      {
        reply_to: cleanData.email, // Permet de répondre directement
        headers: {
          "X-Priority": "1", // Haute priorité
          "X-Contact-Form": "novapsy-website",
        },
      }
    );

    if (emailResult.success) {
      logWithTimestamp("info", "🎉 SUCCESS - Email principal envoyé", {
        messageId: emailResult.messageId,
        attempt: emailResult.attempt,
      });

      // Envoyer email de confirmation en arrière-plan (optionnel)
      setImmediate(async () => {
        try {
          const confirmationSubject = "Confirmation - Message reçu par Novapsy";
          const confirmationHTML = generateConfirmationEmailHTML(
            cleanData.name,
            cleanData.message
          );

          const confirmResult = await sendEmailWithRetry(
            cleanData.email,
            confirmationSubject,
            confirmationHTML
          );

          if (confirmResult.success) {
            logWithTimestamp("info", "✅ Confirmation utilisateur envoyée", {
              to: cleanData.email,
              messageId: confirmResult.messageId,
            });
          } else {
            logWithTimestamp(
              "warn",
              "⚠️ Échec confirmation utilisateur (non critique)",
              {
                to: cleanData.email,
                error: confirmResult.error,
              }
            );
          }
        } catch (error) {
          logWithTimestamp(
            "warn",
            "⚠️ Exception confirmation utilisateur (ignorée)",
            {
              error: error.message,
            }
          );
        }
      });

      // Réponse de succès
      return res.status(200).json({
        success: true,
        message: "Votre message a été envoyé avec succès !",
        details: "Nous vous répondrons dans les plus brefs délais.",
        messageId: emailResult.messageId,
      });
    } else {
      // Échec de l'email principal
      logWithTimestamp(
        "error",
        "💥 ÉCHEC CRITIQUE - Email principal non envoyé",
        {
          error: emailResult.error,
          totalAttempts: emailResult.totalAttempts,
        }
      );

      return res.status(500).json({
        success: false,
        error: "Impossible d'envoyer votre message",
        details:
          "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
        technical: {
          attempts: emailResult.totalAttempts,
          lastError: emailResult.error,
        },
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans formulaire contact", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    });
  }
});

// ========================
// ROUTE DEMANDE DE PRÉVENTION
// ========================

/**
 * POST /api/send-prevention-request
 * Traite une demande de prévention personnalisée et envoie un email
 */
app.post("/api/send-prevention-request", async (req, res) => {
  logWithTimestamp("info", "🎯 === NOUVELLE DEMANDE DE PRÉVENTION ===");

  const { to, subject, requestData } = req.body;

  // Extraction des données de la requête
  const {
    dates,
    durees,
    lieu,
    publicConcerne,
    thematiquesEnvisagees,
    formeEnvisagee,
    message,
    category,
    timestamp,
    source,
  } = requestData || {};

  logWithTimestamp("info", "📋 Données de demande reçues", {
    category: category?.nom || "Non spécifiée",
    dates: dates || "Non spécifiées",
    lieu: lieu || "Non spécifié",
    publicConcerne: publicConcerne || "Non spécifié",
    hasThematiques: !!thematiquesEnvisagees,
    hasForme: !!formeEnvisagee,
    hasMessage: !!message,
    source: source || "unknown",
  });

  // Validation des données
  const validation = validatePreventionRequest(requestData || {});

  if (!validation.isValid) {
    logWithTimestamp(
      "warn",
      "❌ Validation demande prévention échouée",
      validation.errors
    );
    return res.status(400).json({
      success: false,
      error: "Données de demande invalides",
      errors: validation.errors,
    });
  }

  try {
    // Préparer les données propres
    const cleanData = {
      dates: dates.trim(),
      durees: durees.trim(),
      lieu: lieu.trim(),
      publicConcerne: publicConcerne.trim(),
      thematiquesEnvisagees: thematiquesEnvisagees
        ? thematiquesEnvisagees.trim()
        : null,
      formeEnvisagee: formeEnvisagee ? formeEnvisagee.trim() : null,
      message: message ? message.trim() : null,
      category,
      timestamp: timestamp || new Date().toISOString(),
      source: source || "prevention_catalog",
    };

    // Générer le sujet de l'email
    const emailSubject =
      subject || `[Prévention] Nouvelle demande - ${category.nom}`;

    // Générer l'email HTML
    const emailHTML = generatePreventionRequestEmailHTML(cleanData);

    logWithTimestamp(
      "info",
      "🚀 ENVOI EMAIL DEMANDE PRÉVENTION vers contact@novapsy.info"
    );

    // Envoyer l'email avec retry
    const emailResult = await sendEmailWithRetry(
      to || CONTACT_EMAIL,
      emailSubject,
      emailHTML,
      {
        headers: {
          "X-Priority": "1", // Haute priorité
          "X-Contact-Form": "novapsy-prevention-catalog",
          "X-Prevention-Category": category.nom,
        },
      }
    );

    if (emailResult.success) {
      logWithTimestamp("info", "🎉 SUCCESS - Email demande prévention envoyé", {
        category: category.nom,
        messageId: emailResult.messageId,
        attempt: emailResult.attempt,
      });

      // Réponse de succès
      return res.status(200).json({
        success: true,
        message: "Votre demande de prévention a été envoyée avec succès !",
        details:
          "Notre équipe vous contactera rapidement pour finaliser votre formation personnalisée.",
        messageId: emailResult.messageId,
        category: category.nom,
      });
    } else {
      // Échec de l'email
      logWithTimestamp(
        "error",
        "💥 ÉCHEC CRITIQUE - Email demande prévention non envoyé",
        {
          category: category.nom,
          error: emailResult.error,
          totalAttempts: emailResult.totalAttempts,
        }
      );

      return res.status(500).json({
        success: false,
        error: "Impossible d'envoyer votre demande de prévention",
        details:
          "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
        technical: {
          attempts: emailResult.totalAttempts,
          lastError: emailResult.error,
        },
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 EXCEPTION CRITIQUE dans demande prévention", {
      category: category?.nom || "unknown",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Erreur serveur critique",
      message:
        "Veuillez réessayer ou nous contacter directement à contact@novapsy.info",
    });
  }
});

// ========================
// ROUTE DE TEST PRÉVENTION
// ========================

/**
 * POST /api/test-prevention-request
 * Test de la fonctionnalité de demande de prévention avec différents thèmes
 */
app.post("/api/test-prevention-request", async (req, res) => {
  logWithTimestamp("info", "🧪 === TEST DEMANDE PRÉVENTION ===");

  try {
    const { theme } = req.body; // Permet de tester différents thèmes

    let testCategory;
    switch (theme) {
      case "psycho":
        testCategory = {
          id: 1,
          nom: "Prévention du Burnout Psychologique",
          description:
            "Formation complète sur la prévention et la gestion du burnout et stress professionnel",
        };
        break;
      case "sexualite":
        testCategory = {
          id: 2,
          nom: "Sexualité et Bien-être",
          description:
            "Formation sur l'accompagnement en santé sexuelle et intimité",
        };
        break;
      case "handicap":
        testCategory = {
          id: 3,
          nom: "Handicaps Invisibles en Milieu Professionnel",
          description:
            "Sensibilisation et inclusion des handicaps invisibles au travail",
        };
        break;
      default:
        testCategory = {
          id: 1,
          nom: "Prévention Générale",
          description: "Formation générale de prévention (couleur par défaut)",
        };
    }

    const testRequestData = {
      dates: "Semaine du 15 mars 2025",
      durees: "2 jours, 14 heures",
      lieu: "Paris ou en ligne",
      publicConcerne: "Professionnels de santé mentale",
      thematiquesEnvisagees:
        "Techniques adaptées au thème\nApproche personnalisée",
      formeEnvisagee: "Ateliers pratiques avec mises en situation",
      message: `Nous souhaiterions une formation adaptée sur le thème : ${testCategory.nom}`,
      category: testCategory,
      timestamp: new Date().toISOString(),
      source: "prevention_catalog_test",
    };

    const testHTML = generatePreventionRequestEmailHTML(testRequestData);

    const result = await sendEmailWithRetry(
      CONTACT_EMAIL,
      `🧪 Test Demande Prévention ${testCategory.nom} - Novapsy`,
      testHTML
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test demande prévention envoyé avec succès");
      return res.json({
        success: true,
        message: "Test de demande de prévention fonctionnel",
        details: {
          messageId: result.messageId,
          from: FROM_EMAIL,
          to: CONTACT_EMAIL,
          attempt: result.attempt,
          category: testRequestData.category.nom,
          theme: theme || "default",
          colors: getPreventionThemeColors(testCategory.nom),
        },
      });
    } else {
      logWithTimestamp(
        "error",
        "❌ Test demande prévention échoué",
        result.error
      );
      return res.status(500).json({
        success: false,
        error: "Test de demande de prévention défaillant",
        details: result.error,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test demande prévention", error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    });
  }
});

// ========================
// ROUTES DE TEST ET SANTÉ
// ========================

/**
 * GET /contact/test
 * Test de la configuration email
 */
app.get("/contact/test", async (req, res) => {
  logWithTimestamp("info", "🧪 === TEST CONFIGURATION EMAIL ===");

  try {
    const testHTML = `
      <div style="padding: 30px; font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🧪 Test de Configuration Email</h2>
        <p>✅ La configuration Resend fonctionne correctement</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        <p><strong>From :</strong> ${FROM_EMAIL}</p>
        <p><strong>To :</strong> ${CONTACT_EMAIL}</p>
      </div>
    `;

    const result = await sendEmailWithRetry(
      CONTACT_EMAIL,
      "🧪 Test Configuration Resend - Novapsy",
      testHTML
    );

    if (result.success) {
      logWithTimestamp("info", "✅ Test email envoyé avec succès");
      return res.json({
        success: true,
        message: "Configuration email fonctionnelle",
        details: {
          messageId: result.messageId,
          from: FROM_EMAIL,
          to: CONTACT_EMAIL,
          attempt: result.attempt,
        },
      });
    } else {
      logWithTimestamp("error", "❌ Test email échoué", result.error);
      return res.status(500).json({
        success: false,
        error: "Configuration email défaillante",
        details: result.error,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "💥 Exception test email", error);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du test",
      message: error.message,
    });
  }
});

// ========================
// ROUTES DE SANTÉ ET DEBUG
// ========================

/**
 * GET /health
 * Endpoint de santé du serveur
 */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "2.1.0-refactored-memberships",
    services: {
      email: {
        configured: !!process.env.RESEND_API_KEY,
        from: FROM_EMAIL,
        to: CONTACT_EMAIL,
      },
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
      },
      supabase: {
        configured: !!process.env.SUPABASE_URL,
      },
    },
    features: {
      contact_form: true,
      email_retry: true,
      email_confirmation: true,
      prevention_requests: true,
      membership_management: true,
      training_purchases: true,
    },
    refactoring: {
      memberships: "✅ Refactorisé",
      emails: "✅ Partiellement refactorisé",
      trainings: "⏳ En cours",
      contact: "⏳ En cours",
      prevention: "⏳ En cours",
    },
  });
});

/**
 * GET /user-email/:userId
 * Récupère l'email d'un utilisateur (pour debug)
 * Params: userId (UUID)
 */
app.get("/user-email/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const email = await getMailByUser(userId);

    if (email) {
      res.json({ email });
    } else {
      res.status(404).json({ error: "Email utilisateur non trouvé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération email utilisateur", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /send-newsletter
 * Envoie une newsletter à tous les abonnés
 * Body: { subject, html }
 */
app.post("/send-newsletter", async (req, res) => {
  const { subject, html } = req.body;

  logWithTimestamp("info", "=== ENVOI NEWSLETTER ===");
  logWithTimestamp("info", "Données reçues", { subject });

  if (!subject) {
    return res.status(400).json({ error: "Le sujet est requis" });
  }

  if (!html) {
    return res.status(400).json({ error: "Le contenu HTML est requis" });
  }

  try {
    // Récupérer les emails des utilisateurs abonnés à la newsletter
    const { data: subscribers, error: subscribersError } = await supabase.from(
      "newsletter_subscribers"
    ).select(`
        users(user_email)
      `);

    if (subscribersError) {
      logWithTimestamp("error", "Erreur détaillée récupération abonnés", {
        message: subscribersError.message,
        details: subscribersError.details,
        hint: subscribersError.hint,
      });
      return res.status(500).json({
        error: "Erreur récupération abonnés",
        details: subscribersError.message,
      });
    }

    if (!subscribers || subscribers.length === 0) {
      logWithTimestamp("info", "Aucun abonné trouvé");
      return res.status(404).json({ error: "Aucun abonné trouvé" });
    }

    // Extraire les emails des utilisateurs
    const subscribersEmails = subscribers.map(
      (subscriber) => subscriber.users.user_email
    );

    let sentCount = 0;
    let errorCount = 0;

    // Envoyer la newsletter à chaque abonné
    for (const email of subscribersEmails) {
      const success = await sendEmail(email, subject, html);
      if (success) {
        sentCount++;
      } else {
        errorCount++;
      }
    }

    logWithTimestamp("info", "Newsletter envoyée avec succès", {
      sent: sentCount,
      errors: errorCount,
      total: subscribers.length,
    });

    res.json({
      success: true,
      message: "Newsletter envoyée avec succès",
      stats: {
        sent: sentCount,
        errors: errorCount,
        total: subscribers.length,
      },
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================
// GESTION D'ERREURS
// ========================

// Gestionnaire d'erreurs global
app.use(errorHandler);

// Route non trouvée
app.use("*", notFoundHandler);

// ========================
// DÉMARRAGE SERVEUR
// ========================

async function startServer() {
  try {
    // Vérification des variables d'environnement critiques
    const requiredVars = ["RESEND_API_KEY"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      logWithTimestamp("error", "❌ Variables d'environnement manquantes", {
        missing: missingVars,
      });
      process.exit(1);
    }

    // Test rapide de la configuration email
    logWithTimestamp("info", "🧪 Test rapide de la configuration email...");

    // Démarrage du serveur
    app.listen(PORT, () => {
      logWithTimestamp(
        "info",
        `🚀 Serveur démarré sur http://localhost:${PORT}`
      );
      logWithTimestamp("info", `📊 Frontend: ${FRONTEND_URL}`);
      logWithTimestamp("info", `📧 Email: ${FROM_EMAIL} → ${CONTACT_EMAIL}`);
      logWithTimestamp(
        "info",
        "✅ Backend Novapsy - Version Refactorisée (memberships complétés)"
      );
      logWithTimestamp(
        "info",
        "🔧 Prochaines étapes: refactoriser trainings, contact, prevention"
      );
    });
  } catch (error) {
    logWithTimestamp("error", "💥 Erreur critique au démarrage", error);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt
process.on("SIGINT", () => {
  logWithTimestamp("info", "🛑 Arrêt serveur gracieux...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logWithTimestamp("info", "🛑 Arrêt serveur...");
  process.exit(0);
});

// Démarrage
startServer();
