require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

// Initialisation Resend
const resend = new Resend(process.env.RESEND_API_KEY);
resend.domains.create({ name: "novapsy.info" });

// Initialisation Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@novapsy.info";

// ========================
// MIDDLEWARES
// ========================

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Middleware CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
  ];

  if (allowedOrigins.includes(origin)) {
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
});

// ========================
// UTILITAIRES
// ========================

function getPriceFromPriceId(priceId) {
  const prices = {
    // Adhésions
    price_1RTOTl05Uibkj68MKKJm4GdZ: 30, // Adhésion Simple
    price_1RTIcw05Uibkj68MeUnu62m8: 20, // Adhésion Pro
    price_1RTOUG05Uibkj68MH3kTQ8JC: 10, // Membre Asso

    // Formations
    price_1RZKxz05Uibkj68MfCpirZlH: 250, // PSSM
    price_1RT2Gi05Uibkj68MuYaG5HZn: 50, // VSS
  };
  return prices[priceId] || 0;
}

function getTrainingDetails(priceId) {
  const trainings = {
    price_1RZKxz05Uibkj68MfCpirZlH: {
      name: "PSSM",
      full_name: "Premiers Secours en Santé Mentale",
      base_price: 250,
      member_discount: 35,
      duration: 20,
      training_type: "Premiers Secours en Santé Mentale",
    },
    price_1RT2Gi05Uibkj68MuYaG5HZn: {
      name: "VSS",
      full_name: "Violences Sexistes et Sexuelles",
      base_price: 50,
      member_discount: 15,
      duration: 12,
      training_type: "Violences Sexistes et Sexuelles",
    },
  };
  return trainings[priceId] || null;
}

async function checkIfUserIsMember(userId) {
  try {
    logWithTimestamp("info", "Vérification statut adhérent", { userId });

    const { data, error } = await supabase
      .from("users_status")
      .select("status_id")
      .eq("user_id", userId)
      .in("status_id", [2, 3, 4])
      .maybeSingle();

    if (error) {
      logWithTimestamp("error", "Erreur vérification statut adhérent", error);
      return false;
    }

    const isMember = !!data;
    logWithTimestamp("info", "Résultat vérification adhérent", {
      userId,
      isMember,
      statusId: data?.status_id,
    });
    return isMember;
  } catch (error) {
    logWithTimestamp("error", "Erreur vérification adhérent", error);
    return false;
  }
}

function calculateDiscountedPrice(trainingDetails, isMember) {
  if (!trainingDetails) return 0;

  const basePrice = trainingDetails.base_price;
  const discount = isMember ? trainingDetails.member_discount : 0;
  const finalPrice = basePrice - discount;

  logWithTimestamp("info", "Calcul prix avec réduction", {
    basePrice,
    discount,
    finalPrice,
    isMember,
  });

  return finalPrice;
}

function logWithTimestamp(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

  if (level === "error") {
    console.error(logMessage, data || "");
  } else {
    console.log(logMessage, data || "");
  }
}

// ========================
// FONCTIONS EMAIL
// ========================

/**
 * Récupère l'email d'un utilisateur par son ID
 * @param {string} userId - L'ID de l'utilisateur
 * @returns {Promise<string|null>} L'email de l'utilisateur ou null si non trouvé
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
      email: data.user_email, // ✅ Corrigé : utiliser user_email au lieu de email
    });

    return data.user_email; // ✅ Corrigé : retourner user_email
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération email utilisateur", {
      userId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Envoie un email à un utilisateur - VERSION AMÉLIORÉE
 * @param {string} to - Email du destinataire
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendEmail(to, subject, html) {
  try {
    logWithTimestamp("info", "Envoi email", { to, subject });

    // Validation de l'email
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

    // Vérification détaillée du résultat
    if (result.data && result.data.id) {
      logWithTimestamp("info", "✅ Email envoyé avec succès", {
        to,
        subject,
        messageId: result.data.id,
        fullResult: result,
      });
      return true;
    } else {
      logWithTimestamp("error", "❌ Résultat Resend suspect", {
        to,
        subject,
        result: result,
        hasData: !!result.data,
        hasId: !!(result.data && result.data.id),
      });
      return false;
    }
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur envoi email", {
      to,
      subject,
      error: error.message,
      errorCode: error.code,
      errorType: error.type,
      fullError: error,
    });
    return false;
  }
}

/**
 * Envoie un email de confirmation d'adhésion
 * @param {string} userId - ID de l'utilisateur
 * @param {object} membershipData - Données de l'adhésion
 */
async function sendMembershipConfirmationEmail(userId, membershipData) {
  try {
    const userEmail = await getMailByUser(userId);
    if (!userEmail) {
      logWithTimestamp(
        "warn",
        "Email utilisateur non trouvé pour confirmation adhésion",
        { userId }
      );
      return false;
    }

    const subject = "Confirmation de votre adhésion";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Bienvenue ! Votre adhésion est confirmée</h2>
        
        <p>Nous sommes ravis de vous confirmer que votre adhésion a été activée avec succès.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de votre adhésion :</h3>
          <p><strong>Prix :</strong> ${membershipData.membership_price}€</p>
          <p><strong>Début :</strong> ${new Date(
            membershipData.membership_start
          ).toLocaleDateString("fr-FR")}</p>
          <p><strong>Fin :</strong> ${new Date(
            membershipData.membership_end
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <p>Vous pouvez maintenant profiter de tous les avantages de votre adhésion, notamment les réductions sur nos formations.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe</p>
      </div>
    `;

    return await sendEmail(userEmail, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation adhésion", {
      userId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Envoie un email de confirmation d'achat de formation
 * @param {string} userId - ID de l'utilisateur
 * @param {object} purchaseData - Données de l'achat
 * @param {object} trainingDetails - Détails de la formation
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
        
        <p>Cordialement,<br>L'équipe</p>
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
 * Envoie une newsletter à tous les abonnés - VERSION AMÉLIORÉE
 */
async function sendNewsletter(subject, html) {
  try {
    logWithTimestamp("info", "Début envoi newsletter", { subject });

    // Récupérer tous les abonnés à la newsletter
    const { data: subscribers, error } = await supabase
      .from("newsletter_subscribers")
      .select("user_id");

    if (error) {
      logWithTimestamp(
        "error",
        "Erreur récupération abonnés newsletter",
        error
      );
      return { success: false, error: error.message };
    }

    logWithTimestamp("info", "Abonnés newsletter récupérés", {
      count: subscribers.length,
    });

    let successCount = 0;
    let errorCount = 0;
    const failedEmails = [];
    const successEmails = [];

    // Envoyer l'email à chaque abonné
    for (const subscriber of subscribers) {
      logWithTimestamp(
        "info",
        `📧 Traitement abonné ${successCount + errorCount + 1}/${subscribers.length}`,
        {
          userId: subscriber.user_id,
        }
      );

      const userEmail = await getMailByUser(subscriber.user_id);

      if (!userEmail) {
        errorCount++;
        failedEmails.push({
          userId: subscriber.user_id,
          reason: "Email non trouvé",
        });
        logWithTimestamp("warn", "Email non trouvé pour abonné", {
          userId: subscriber.user_id,
        });
        continue;
      }

      // Tentative d'envoi avec retry
      let emailSent = false;
      let attempts = 0;
      const maxAttempts = 2;

      while (!emailSent && attempts < maxAttempts) {
        attempts++;
        logWithTimestamp(
          "info",
          `Tentative ${attempts}/${maxAttempts} pour ${userEmail}`
        );

        emailSent = await sendEmail(userEmail, subject, html);

        if (!emailSent && attempts < maxAttempts) {
          logWithTimestamp(
            "warn",
            `Échec tentative ${attempts}, retry dans 2s...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (emailSent) {
        successCount++;
        successEmails.push({
          userId: subscriber.user_id,
          email: userEmail,
        });
      } else {
        errorCount++;
        failedEmails.push({
          userId: subscriber.user_id,
          email: userEmail,
          reason: "Échec envoi après retry",
        });
      }

      // Pause entre les emails pour éviter de surcharger l'API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    logWithTimestamp("info", "=== RÉSUMÉ NEWSLETTER ===", {
      total: subscribers.length,
      success: successCount,
      errors: errorCount,
      successEmails,
      failedEmails,
    });

    return {
      success: true,
      total: subscribers.length,
      sent: successCount,
      errors: errorCount,
      successEmails,
      failedEmails,
    };
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    return { success: false, error: error.message };
  }
}

// ========================
// FONCTIONS DE GESTION DES STATUTS
// ========================

async function updateUserStatusToMembership(userId, statusId) {
  try {
    logWithTimestamp("info", "Mise à jour statut utilisateur vers adhésion", {
      userId,
      statusId,
    });

    const { error: statusError } = await supabase.rpc(
      "set_user_status_membership",
      {
        target_user_id: userId,
        membership_status_id: parseInt(statusId),
      }
    );

    if (statusError) {
      logWithTimestamp(
        "warn",
        "Erreur mise à jour statut utilisateur",
        statusError
      );
      return false;
    } else {
      logWithTimestamp("info", "Statut utilisateur mis à jour avec succès", {
        userId,
        statusId,
      });
      return true;
    }
  } catch (error) {
    logWithTimestamp("warn", "Erreur appel fonction statut", error);
    return false;
  }
}

async function updateUserStatusToConnected(userId) {
  try {
    logWithTimestamp("info", "Mise à jour statut utilisateur vers Connecté", {
      userId,
    });

    const { error: statusError } = await supabase.rpc(
      "set_user_status_connected",
      {
        target_user_id: userId,
      }
    );

    if (statusError) {
      logWithTimestamp(
        "warn",
        "Erreur mise à jour statut vers Connecté",
        statusError
      );
      return false;
    } else {
      logWithTimestamp(
        "info",
        "Statut utilisateur mis à Connecté avec succès",
        { userId }
      );
      return true;
    }
  } catch (error) {
    logWithTimestamp("warn", "Erreur appel fonction statut Connecté", error);
    return false;
  }
}

async function removeUserStatus(userId, statusId) {
  try {
    logWithTimestamp("info", "Suppression statut utilisateur", {
      userId,
      statusId,
    });

    const { error: deleteError } = await supabase
      .from("users_status")
      .delete()
      .eq("user_id", userId)
      .eq("status_id", statusId);

    if (deleteError) {
      logWithTimestamp(
        "warn",
        "Erreur suppression statut utilisateur",
        deleteError
      );
      return false;
    } else {
      logWithTimestamp("info", "Statut utilisateur supprimé avec succès", {
        userId,
        statusId,
      });
      updateUserStatusToConnected(userId);
      return true;
    }
  } catch (error) {
    logWithTimestamp("warn", "Erreur suppression statut utilisateur", error);
    return false;
  }
}

// ========================
// FONCTIONS STRIPE
// ========================

async function getInvoiceFromSession(session) {
  try {
    logWithTimestamp("info", "Récupération Invoice pour session", session.id);

    if (session.mode === "subscription" && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      if (subscription.latest_invoice) {
        let invoiceId;
        if (typeof subscription.latest_invoice === "string") {
          invoiceId = subscription.latest_invoice;
        } else {
          invoiceId = subscription.latest_invoice.id;
        }

        logWithTimestamp("info", "Invoice trouvée via subscription", invoiceId);
        return invoiceId;
      }
    }

    if (session.payment_intent) {
      const invoices = await stripe.invoices.list({ limit: 100 });
      const invoice = invoices.data.find(
        (inv) => inv.payment_intent === session.payment_intent
      );
      if (invoice) {
        logWithTimestamp(
          "info",
          "Invoice trouvée via payment_intent",
          invoice.id
        );
        return invoice.id;
      }
    }

    logWithTimestamp(
      "warn",
      "Aucune Invoice trouvée pour la session",
      session.id
    );
    return null;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération Invoice", error);
    return null;
  }
}

async function findSubscriptionFromMembership(membership) {
  try {
    logWithTimestamp(
      "info",
      "Recherche subscription pour membership",
      membership.membership_id
    );

    if (membership.stripe_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          membership.stripe_session_id
        );
        if (session.subscription) {
          logWithTimestamp(
            "info",
            "Subscription trouvée via session",
            session.subscription
          );
          return session.subscription;
        }
      } catch (error) {
        logWithTimestamp("warn", "Erreur récupération session", error.message);
      }
    }

    if (membership.stripe_invoice_id) {
      try {
        const invoice = await stripe.invoices.retrieve(
          membership.stripe_invoice_id
        );
        if (invoice.subscription) {
          logWithTimestamp(
            "info",
            "Subscription trouvée via invoice",
            invoice.subscription
          );
          return invoice.subscription;
        }
      } catch (error) {
        logWithTimestamp("warn", "Erreur récupération invoice", error.message);
      }
    }

    logWithTimestamp(
      "warn",
      "Aucune subscription trouvée",
      membership.membership_id
    );
    return null;
  } catch (error) {
    logWithTimestamp("error", "Erreur recherche subscription", error);
    return null;
  }
}

// ========================
// FONCTIONS MÉTIER
// ========================

async function createMembership(metadata, subscriptionId, session) {
  const { userId, associationId, userType, priceId, statusId } = metadata;
  const price = getPriceFromPriceId(priceId);

  logWithTimestamp("info", "=== DÉBUT CRÉATION MEMBERSHIP ===");
  logWithTimestamp("info", "Metadata reçues", metadata);

  try {
    const invoiceId = await getInvoiceFromSession(session);

    const membershipData = {
      membership_start: new Date().toISOString(),
      membership_end: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      membership_price: price,
      status_id: parseInt(statusId),
    };

    if (invoiceId) {
      membershipData.stripe_invoice_id = invoiceId;
      logWithTimestamp("info", "Invoice ID ajouté", invoiceId);
    }

    if (session?.id) {
      membershipData.stripe_session_id = session.id;
      logWithTimestamp("info", "Session ID ajouté", session.id);
    }

    logWithTimestamp("info", "Données membership à insérer", membershipData);

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .insert(membershipData)
      .select()
      .single();

    if (membershipError) {
      logWithTimestamp("error", "Erreur création membership", membershipError);
      throw membershipError;
    }

    logWithTimestamp("info", "Membership créé avec succès", membership);

    if (userType === "user" && userId) {
      const { data: userMembership, error: userMembershipError } =
        await supabase
          .from("users_memberships")
          .insert({
            user_id: userId,
            membership_id: membership.membership_id,
          })
          .select()
          .single();

      if (userMembershipError) {
        logWithTimestamp(
          "error",
          "Erreur création user_membership",
          userMembershipError
        );
        throw userMembershipError;
      }

      logWithTimestamp("info", "User membership créé", userMembership);
      await updateUserStatusToMembership(userId, statusId);

      // Envoi de l'email de confirmation d'adhésion
      //await sendMembershipConfirmationEmail(userId, membership);
    } else if (userType === "association" && associationId) {
      const { data: assoMembership, error: assoMembershipError } =
        await supabase
          .from("associations_memberships")
          .insert({
            association_id: associationId,
            membership_id: membership.membership_id,
          })
          .select()
          .single();

      if (assoMembershipError) {
        logWithTimestamp(
          "error",
          "Erreur création association_membership",
          assoMembershipError
        );
        throw assoMembershipError;
      }

      logWithTimestamp("info", "Association membership créé", assoMembership);
    }

    logWithTimestamp("info", "=== FIN CRÉATION MEMBERSHIP - SUCCÈS ===");
    return membership;
  } catch (error) {
    logWithTimestamp("error", "=== ERREUR CRÉATION MEMBERSHIP ===", error);
    throw error;
  }
}

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
    // Vérifier que l'achat n'existe pas déjà (avec UUID)
    const { data: existingPurchase, error: checkError } = await supabase
      .from("trainings_purchase")
      .select("purchase_id")
      .eq("user_id", userId) // ✅ UUID directement, pas de parseInt
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

    // Données à insérer (UUID + sans payment_method)
    const purchaseData = {
      user_id: userId, // ✅ UUID directement
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

    // Envoi de l'email de confirmation d'achat de formation
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

// ========================
// ROUTES API - EMAIL
// ========================

app.post("/send-newsletter", async (req, res) => {
  const { subject, html } = req.body;

  logWithTimestamp("info", "=== ENVOI NEWSLETTER ===");
  logWithTimestamp("info", "Données reçues", { subject });

  if (!subject || !html) {
    return res.status(400).json({ error: "Sujet et contenu HTML requis" });
  }

  try {
    const result = await sendNewsletter(subject, html);

    if (result.success) {
      res.json({
        success: true,
        message: "Newsletter envoyée avec succès",
        stats: {
          total: result.total,
          sent: result.sent,
          errors: result.errors,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi newsletter", error);
    res.status(500).json({ error: error.message });
  }
});

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

// ========================
// ROUTES DE DEBUG EMAIL
// ========================

app.get("/debug/user-data/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    logWithTimestamp("info", "🔍 Route debug - Analyse utilisateur", {
      userId,
    });

    // 1. Tester la table users avec toutes les colonnes
    const { data: publicUser, error: publicError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // 2. Tester les fonctions d'email
    const emailFromFunction = await getMailByUser(userId);

    const debugInfo = {
      userId,
      publicTable: {
        found: !!publicUser,
        error: publicError?.message || null,
        data: publicUser,
        columns: publicUser ? Object.keys(publicUser) : [],
        hasUserEmail: publicUser?.user_email ? true : false,
        userEmailValue: publicUser?.user_email || null,
      },
      emailResults: {
        fromFunction: emailFromFunction,
      },
      recommendations: [],
    };

    // Ajouter des recommandations
    if (!publicUser) {
      debugInfo.recommendations.push(
        "❌ Utilisateur non trouvé dans public.users"
      );
    } else if (!publicUser.user_email) {
      debugInfo.recommendations.push(
        "⚠️ Utilisateur trouvé mais colonne user_email vide - vérifiez vos données"
      );
    } else {
      debugInfo.recommendations.push("✅ Email trouvé avec succès !");
    }

    res.json(debugInfo);
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur route debug", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================
// ROUTES API - ADHÉSIONS
// ========================

app.post("/create-checkout-session", async (req, res) => {
  const { priceId, userId, associationId, userType, statusId } = req.body;

  logWithTimestamp("info", "=== DÉBUT CRÉATION SESSION ADHÉSION ===");
  logWithTimestamp("info", "Données reçues", {
    priceId,
    userId,
    associationId,
    userType,
    statusId,
  });

  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!statusId) return res.status(400).json({ error: "statusId manquant" });
  if (
    !userType ||
    (userType === "user" && !userId) ||
    (userType === "association" && !associationId)
  ) {
    return res
      .status(400)
      .json({ error: "Informations utilisateur manquantes" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pricing`,
      payment_method_types: ["card"],
      metadata: {
        userId: userId || "",
        associationId: associationId || "",
        userType: userType,
        priceId: priceId,
        statusId: statusId.toString(),
        type: "membership",
      },
    });

    logWithTimestamp(
      "info",
      "Session Stripe adhésion créée avec succès",
      session.id
    );
    res.status(200).json({ url: session.url });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe adhésion", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ROUTES API - FORMATIONS
// ========================

app.post("/create-training-checkout", async (req, res) => {
  const { priceId, userId, trainingId } = req.body;

  logWithTimestamp("info", "=== DÉBUT CRÉATION SESSION FORMATION ===");
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

    const session = await stripe.checkout.sessions.create({
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
    });

    logWithTimestamp("info", "Session Stripe formation créée avec succès", {
      sessionId: session.id,
      originalPrice: trainingDetails.base_price,
      finalPrice: finalPrice,
      discount: isMember ? trainingDetails.member_discount : 0,
      isMember,
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

app.get("/get-session-metadata/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  logWithTimestamp("info", "Récupération métadonnées session", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    logWithTimestamp("info", "Métadonnées session récupérées", {
      id: session.id,
      payment_status: session.payment_status,
      metadata: session.metadata,
    });

    res.json({
      session_id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      metadata: session.metadata,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération métadonnées session", error);
    res.status(500).json({ error: error.message });
  }
});

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
// ROUTES ADHÉSIONS (existantes)
// ========================

app.get("/receipt/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;

  logWithTimestamp("info", "Récupération reçu Invoice", invoiceId);

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["charge", "payment_intent.charges"],
    });

    const receiptData = {
      id: invoice.id,
      invoice_number: invoice.number,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      customer_email: invoice.customer_email,
      description: `Facture ${invoice.number}`,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
    };

    if (invoice.hosted_invoice_url) {
      receiptData.receipt_url = invoice.hosted_invoice_url;
      receiptData.receipt_type = "hosted_invoice";
      return res.json(receiptData);
    }

    if (invoice.invoice_pdf) {
      receiptData.receipt_url = invoice.invoice_pdf;
      receiptData.receipt_type = "invoice_pdf";
      return res.json(receiptData);
    }

    return res.status(404).json({
      error: "Reçu temporairement indisponible",
      invoice_id: invoiceId,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération reçu", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/membership-status/:userId/:userType", async (req, res) => {
  const { userId, userType } = req.params;

  try {
    let query;
    if (userType === "user") {
      query = supabase
        .from("users_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            membership_price,
            status_id,
            stripe_invoice_id,
            stripe_session_id,
            cancelled_at,
            stripe_subscription_cancelled,
            status (
              status_name
            )
          )
        `
        )
        .eq("user_id", userId);
    } else {
      query = supabase
        .from("associations_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            membership_price,
            status_id,
            stripe_invoice_id,
            stripe_session_id,
            cancelled_at,
            stripe_subscription_cancelled,
            status (
              status_name
            )
          )
        `
        )
        .eq("association_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      logWithTimestamp("error", "Erreur récupération statut", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ memberships: data });
  } catch (err) {
    logWithTimestamp("error", "Erreur vérification statut", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/process-payment-success", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS PAIEMENT ADHÉSION ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      await createMembership(session.metadata, session.subscription, session);
      res.json({ success: true, message: "Adhésion créée avec succès" });
    } else {
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur traitement succès paiement", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/terminate-membership/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { user_id, user_type } = req.body;

  if (!membershipId || !user_id || !user_type) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  try {
    res.json({
      success: true,
      message: "Le renouvellement automatique a été annulé.",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/debug/training-purchase/:userId/:trainingId", async (req, res) => {
  const { userId, trainingId } = req.params;

  try {
    const { data: purchases, error } = await supabase
      .from("trainings_purchase")
      .select("*")
      .eq("user_id", userId)
      .eq("training_id", trainingId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      userId,
      trainingId,
      purchases: purchases || [],
      count: purchases?.length || 0,
      debug_info: {
        timestamp: new Date().toISOString(),
        backend_version: "14.0.0-email-fixed",
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "14.0.0-email-fixed",
    features: {
      memberships: true,
      training_purchases: true,
      webhooks: true,
      member_discounts: true,
      uuid_support: true,
      email_notifications: true,
      newsletter: true,
      debug_routes: true,
    },
  });
});

// ========================
// WEBHOOKS STRIPE
// ========================

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
          if (session.metadata.type === "training_purchase") {
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
          } else if (session.metadata.type === "membership") {
            logWithTimestamp(
              "info",
              "👥 Traitement adhésion via webhook",
              session.id
            );

            const result = await createMembership(
              session.metadata,
              session.subscription,
              session
            );

            logWithTimestamp(
              "info",
              "✅ Adhésion créée avec succès via webhook",
              {
                session_id: session.id,
                membership_id: result.membership_id,
                user_id: session.metadata.userId,
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

      case "invoice.payment_succeeded":
        const invoice = event.data.object;
        logWithTimestamp("info", "💰 Facture payée", {
          invoice_id: invoice.id,
          amount: invoice.amount_paid / 100,
        });
        break;

      case "invoice.payment_failed":
        const failedInvoice = event.data.object;
        logWithTimestamp("warn", "❌ Paiement échoué", {
          invoice_id: failedInvoice.id,
          amount: failedInvoice.amount_due / 100,
        });
        break;

      default:
        logWithTimestamp("info", "ℹ️ Type d'événement non géré", event.type);
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
// GESTION D'ERREURS
// ========================

app.use((err, req, res, next) => {
  logWithTimestamp("error", "Erreur non gérée", err);
  res.status(500).json({
    error: "Erreur interne du serveur",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Une erreur est survenue",
  });
});

// ========================
// ROUTE API - DEMANDES DE PRÉVENTION (VERSION COMPLÈTE)
// ========================

function getCategoryGradient(categoryName) {
  const categoryLower = categoryName.toLowerCase();

  if (categoryLower.includes("psycho")) {
    return "linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)"; // Violet
  } else if (
    categoryLower.includes("sexualité") ||
    categoryLower.includes("sexualite")
  ) {
    return "linear-gradient(135deg, #ec4899 0%, #f472b6 100%)"; // Rose
  } else if (categoryLower.includes("handicap")) {
    return "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)"; // Bleu foncé
  } else {
    return "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"; // Couleur par défaut
  }
}

app.post("/api/send-prevention-request", async (req, res) => {
  const { to, subject, requestData } = req.body;

  logWithTimestamp("info", "=== NOUVELLE DEMANDE DE PRÉVENTION ===");
  logWithTimestamp("info", "Données reçues", {
    to,
    subject,
    category: requestData?.category?.nom,
    dates: requestData?.dates,
    lieu: requestData?.lieu,
    publicConcerne: requestData?.publicConcerne,
  });

  // Validation des données essentielles
  if (!to || !subject || !requestData) {
    logWithTimestamp("error", "Paramètres manquants", {
      to,
      subject,
      hasRequestData: !!requestData,
    });
    return res.status(400).json({
      error: "Paramètres manquants (to, subject, requestData requis)",
    });
  }

  if (!requestData.category || !requestData.category.nom) {
    logWithTimestamp("error", "Catégorie manquante", requestData);
    return res.status(400).json({
      error: "Catégorie de prévention requise",
    });
  }

  // Validation des champs obligatoires
  const requiredFields = ["dates", "durees", "lieu", "publicConcerne"];
  const missingFields = requiredFields.filter(
    (field) => !requestData[field] || requestData[field].trim() === ""
  );

  if (missingFields.length > 0) {
    logWithTimestamp("error", "Champs obligatoires manquants", {
      missingFields,
    });
    return res.status(400).json({
      error: `Champs obligatoires manquants: ${missingFields.join(", ")}`,
    });
  }

  try {
    // Construction de l'email HTML complet
    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Demande de Prévention</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 3px solid #6366f1;">
              <h1 style="color: #1f2937; margin: 0 0 15px 0; font-size: 28px; font-weight: bold;">
                🎯 Nouvelle Demande de Prévention
              </h1>
              <p style="color: #6b7280; margin: 0; font-size: 18px; font-weight: 500;">
                Catalogue des Préventions Novapsy
              </p>
              <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 14px;">
                Demande reçue le ${new Date(
                  requestData.timestamp
                ).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <!-- Type de formation -->
            <div style="margin-bottom: 35px;">
              <h2 style="color: #4f46e5; font-size: 20px; margin-bottom: 20px; display: flex; align-items: center;">
                🎯 Type de formation demandé
              </h2>
              <div style="background: ${getCategoryGradient(requestData.category.nom)}; padding: 25px; border-radius: 12px; color: white;">                
                <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: bold;">
                  ${requestData.category.nom}
                </h3>
                ${
                  requestData.category.description
                    ? `
                <p style="margin: 0; font-size: 16px; opacity: 0.95; line-height: 1.5;">
                  ${requestData.category.description}
                </p>
                `
                    : ""
                }
              </div>
            </div>

            <!-- Détails de la formation -->
            <div style="margin-bottom: 35px;">
              <h2 style="color: #4f46e5; font-size: 20px; margin-bottom: 20px; display: flex; align-items: center;">
                📋 Détails de la formation
              </h2>
              
              <div style="background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 18px 25px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; width: 180px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                      📅 Dates souhaitées
                    </td>
                    <td style="padding: 18px 25px; background-color: white; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 16px;">
                      ${requestData.dates}
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 18px 25px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ⏱️ Durées
                    </td>
                    <td style="padding: 18px 25px; background-color: white; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 16px;">
                      ${requestData.durees}
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 18px 25px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                      📍 Lieu
                    </td>
                    <td style="padding: 18px 25px; background-color: white; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 16px;">
                      ${requestData.lieu}
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 18px 25px; background-color: #f1f5f9; font-weight: 700; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                      👥 Public concerné
                    </td>
                    <td style="padding: 18px 25px; background-color: white; color: #1e293b; font-size: 16px;">
                      ${requestData.publicConcerne}
                    </td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- Personnalisation optionnelle -->
            ${
              requestData.thematiquesEnvisagees || requestData.formeEnvisagee
                ? `
            <div style="margin-bottom: 35px;">
              <h2 style="color: #4f46e5; font-size: 20px; margin-bottom: 20px;">
                🔧 Personnalisation demandée
              </h2>
              
              ${
                requestData.thematiquesEnvisagees
                  ? `
              <div style="margin-bottom: 20px; background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #3b82f6;">
                <h4 style="margin: 0 0 12px 0; color: #1e40af; font-size: 16px; font-weight: 600;">
                  🎯 Thématiques envisagées
                </h4>
                <p style="margin: 0; color: #1e293b; line-height: 1.6; font-style: italic; font-size: 15px;">
                  "${requestData.thematiquesEnvisagees}"
                </p>
              </div>
              `
                  : ""
              }
              
              ${
                requestData.formeEnvisagee
                  ? `
              <div style="background-color: #f0fdf4; padding: 20px; border-radius: 10px; border-left: 4px solid #10b981;">
                <h4 style="margin: 0 0 12px 0; color: #047857; font-size: 16px; font-weight: 600;">
                  📝 Forme envisagée
                </h4>
                <p style="margin: 0; color: #1e293b; line-height: 1.6; font-style: italic; font-size: 15px;">
                  "${requestData.formeEnvisagee}"
                </p>
              </div>
              `
                  : ""
              }
            </div>
            `
                : ""
            }

            <!-- Message complémentaire -->
            ${
              requestData.message
                ? `
            <div style="margin-bottom: 35px;">
              <h2 style="color: #4f46e5; font-size: 20px; margin-bottom: 20px;">
                💬 Message complémentaire
              </h2>
              <div style="background-color: #fefce8; padding: 25px; border-radius: 12px; border-left: 4px solid #eab308;">
                <p style="margin: 0; line-height: 1.8; color: #1e293b; font-size: 16px; font-style: italic;">
                  "${requestData.message}"
                </p>
              </div>
            </div>
            `
                : ""
            }

            <!-- Résumé et actions -->
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 25px; border-radius: 12px; margin-bottom: 30px;">
              <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 18px;">
                📊 Résumé de la demande
              </h3>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <span style="background-color: #6366f1; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                  ${requestData.category.nom}
                </span>
                <span style="background-color: #10b981; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                  ${requestData.lieu}
                </span>
                <span style="background-color: #f59e0b; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                  ${requestData.durees}
                </span>
              </div>
            </div>

            <!-- Instructions pour le suivi -->
            <div style="background-color: #fef3cd; border: 1px solid #fbbf24; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
              <h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px;">
                ⚠️ Prochaines étapes
              </h4>
              <ul style="margin: 0; padding-left: 20px; color: #92400e; line-height: 1.6;">
                <li>Analyser la faisabilité de la demande</li>
                <li>Préparer un devis personnalisé</li>
                <li>Planifier un contact avec le demandeur</li>
                <li>Proposer des créneaux de formation</li>
              </ul>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                <strong>Demande générée automatiquement</strong><br>
                Catalogue des Préventions Novapsy
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Source: ${requestData.source || "prevention_catalog"} | 
                ID: ${requestData.timestamp ? new Date(requestData.timestamp).getTime() : Date.now()}
              </p>
            </div>

          </div>
        </div>
      </body>
      </html>
    `;

    // Envoi de l'email via la fonction existante
    logWithTimestamp("info", "Tentative d'envoi email", { to, subject });

    const emailSent = await sendEmail(to, subject, html);

    if (emailSent) {
      logWithTimestamp("info", "✅ Demande de prévention envoyée par email", {
        to,
        category: requestData.category.nom,
        dates: requestData.dates,
        lieu: requestData.lieu,
        publicConcerne: requestData.publicConcerne,
        hasCustomization: !!(
          requestData.thematiquesEnvisagees || requestData.formeEnvisagee
        ),
        hasMessage: !!requestData.message,
      });

      res.json({
        success: true,
        message: "Demande de prévention envoyée avec succès",
        data: {
          category: requestData.category.nom,
          dates: requestData.dates,
          lieu: requestData.lieu,
          timestamp: requestData.timestamp,
          emailSentTo: to,
        },
      });
    } else {
      logWithTimestamp("error", "❌ Échec envoi email demande de prévention", {
        to,
        category: requestData.category.nom,
      });

      res.status(500).json({
        success: false,
        error: "Erreur lors de l'envoi de l'email",
      });
    }
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur traitement demande de prévention", {
      error: error.message,
      stack: error.stack,
      to,
      category: requestData?.category?.nom,
    });

    res.status(500).json({
      success: false,
      error: "Erreur interne lors du traitement de la demande",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ========================
// ROUTE DE TEST POUR LES EMAILS DE PRÉVENTION
// ========================

app.post("/api/test-prevention-email", async (req, res) => {
  try {
    logWithTimestamp("info", "=== TEST EMAIL PRÉVENTION ===");

    const testData = {
      dates: "Semaine du 15 janvier 2025",
      durees: "2 jours (14 heures)",
      lieu: "Paris - Centre de formation",
      publicConcerne: "Professionnels de santé",
      thematiquesEnvisagees:
        "Gestion du stress en milieu hospitalier, techniques de relaxation",
      formeEnvisagee: "Ateliers pratiques avec mises en situation",
      message:
        "Formation urgente pour notre équipe suite à une réorganisation du service.",
      category: {
        nom: "Psychologie",
        description:
          "Accompagnement psychologique personnalisé pour votre bien-être mental et émotionnel.",
      },
      timestamp: new Date().toISOString(),
      source: "prevention_catalog_test",
    };

    // Utiliser la même logique que la route principale
    const html = `Test HTML simple pour ${testData.category.nom} - ${new Date().toLocaleString("fr-FR")}`;

    const emailSent = await sendEmail(
      "contact@novapsy.info",
      "Test - Demande de prévention",
      html
    );

    if (emailSent) {
      logWithTimestamp("info", "✅ Email de test envoyé avec succès");
      res.json({
        success: true,
        message: "Email de test envoyé avec succès",
        timestamp: new Date().toISOString(),
        testData: testData,
      });
    } else {
      logWithTimestamp("error", "❌ Échec envoi email de test");
      res.status(500).json({
        success: false,
        error: "Échec envoi email de test",
      });
    }
  } catch (error) {
    logWithTimestamp("error", "❌ Erreur test email prévention", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================
// ROUTE DE DEBUG POUR VÉRIFIER LA CONFIGURATION
// ========================

app.get("/api/debug-prevention-config", (req, res) => {
  try {
    const config = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      resend: {
        configured: !!process.env.RESEND_API_KEY,
        fromEmail: process.env.FROM_EMAIL || "Non configuré",
      },
      routes: {
        preventionRequest: "/api/send-prevention-request",
        testEmail: "/api/test-prevention-email",
        debug: "/api/debug-prevention-config",
      },
      server: {
        port: process.env.PORT || 3001,
        frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
      },
    };

    logWithTimestamp("info", "Configuration debug demandée", config);

    res.json({
      success: true,
      message: "Configuration de debug récupérée",
      config: config,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur debug configuration", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.use("*", (req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// ========================
// DÉMARRAGE SERVEUR
// ========================

app.listen(PORT, () => {
  logWithTimestamp("info", `🚀 Serveur en écoute sur http://localhost:${PORT}`);
  logWithTimestamp("info", `📊 Frontend URL: ${FRONTEND_URL}`);
  logWithTimestamp(
    "info",
    `🔒 Webhook configuré: ${WEBHOOK_SECRET ? "Oui" : "Non"}`
  );
  logWithTimestamp(
    "info",
    `📧 Resend configuré: ${process.env.RESEND_API_KEY ? "Oui" : "Non"}`
  );
  logWithTimestamp(
    "info",
    `✅ Version: Backend avec email corrigé et debug (v14.0.0)`
  );
});
