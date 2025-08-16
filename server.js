require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

// Initialisation des services externes
const resend = new Resend(process.env.RESEND_API_KEY);
resend.domains.create({ name: "novapsy.info" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuration du serveur
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@novapsy.info";
const CONTACT_EMAIL =
  process.env.CONTACT_EMAIL || "contact@novapsy.info.test-google-a.com";

// ========================
// MIDDLEWARES
// ========================

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Configuration CORS
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
// UTILITAIRES DE BASE
// ========================

/**
 * Récupère le prix d'un produit à partir de son ID Stripe
 * @param {string} priceId - ID du prix Stripe
 * @returns {number} Prix en euros
 */
function getPriceFromPriceId(priceId) {
  const prices = {
    // Adhésions forfait unique (1 an)
    price_1RknRO05Uibkj68MUPgVuW2Y: 30, // Adhésion Simple
    price_1RknR205Uibkj68MeezgOEAs: 20, // Adhésion Pro
    price_1RknQd05Uibkj68MgNOg2UxF: 10, // Membre Asso

    // Formations
    price_1RZKxz05Uibkj68MfCpirZlH: 250, // PSSM
    price_1RT2Gi05Uibkj68MuYaG5HZn: 50, // VSS
  };
  return prices[priceId] || 0;
}

/**
 * Récupère les détails d'une formation à partir de son ID de prix
 * @param {string} priceId - ID du prix Stripe pour la formation
 * @returns {object|null} Détails de la formation ou null si non trouvée
 */
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

/**
 * Vérifie si un utilisateur est adhérent actif
 * @param {string} userId - UUID de l'utilisateur
 * @returns {Promise<boolean>} True si l'utilisateur est adhérent
 */
async function checkIfUserIsMember(userId) {
  try {
    logWithTimestamp("info", "Vérification statut adhérent", { userId });

    const { data, error } = await supabase
      .from("users_status")
      .select("status_id")
      .eq("user_id", userId)
      .in("status_id", [2, 3, 4]) // IDs des statuts adhérents
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

/**
 * Calcule le prix final d'une formation avec réduction adhérent
 * @param {object} trainingDetails - Détails de la formation
 * @param {boolean} isMember - Si l'utilisateur est adhérent
 * @returns {number} Prix final après réduction
 */
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

// ========================
// FONCTIONS EMAIL
// ========================

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

/**
 * Envoie un email de confirmation d'adhésion
 * @param {string} userId - UUID de l'utilisateur
 * @param {object} membershipData - Données de l'adhésion
 * @returns {Promise<boolean>} Succès de l'envoi
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
        <p><strong>Important :</strong> Votre adhésion est valable exactement un an. Vous recevrez des notifications avant expiration pour renouveler si vous le souhaitez.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
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

// ========================
// FONCTIONS DE GESTION DES STATUTS UTILISATEUR
// ========================

/**
 * Met à jour le statut d'un utilisateur vers un statut d'adhésion
 * @param {string} userId - UUID de l'utilisateur
 * @param {number} statusId - ID du statut d'adhésion
 * @returns {Promise<boolean>} Succès de la mise à jour
 */
async function updateUserStatusToMembership(userId, statusId) {
  try {
    logWithTimestamp("info", "Mise à jour statut utilisateur vers adhésion", {
      userId,
      statusId,
    });

    // Utiliser la fonction RPC maintenant qu'elle est réparée
    const { error: statusError } = await supabase.rpc(
      "set_user_status_membership",
      {
        target_user_id: userId,
        membership_status_id: parseInt(statusId),
      }
    );

    if (statusError) {
      logWithTimestamp("error", "Erreur RPC set_user_status_membership", {
        userId,
        statusId,
        error: statusError.message,
        code: statusError.code,
      });
      return false;
    }

    logWithTimestamp("info", "Statut utilisateur mis à jour avec succès", {
      userId,
      statusId,
    });
    return true;
  } catch (error) {
    logWithTimestamp("error", "Exception mise à jour statut", error);
    return false;
  }
}
// ========================
// FONCTIONS STRIPE AMÉLIORÉES POUR LES REÇUS
// ========================

/**
 * Crée une facture Stripe pour un paiement unique si elle n'existe pas
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<string|null>} ID de la facture créée ou null
 */
async function createInvoiceForPayment(session) {
  try {
    logWithTimestamp("info", "Création facture pour paiement", session.id);

    if (!session.payment_intent) {
      logWithTimestamp(
        "warn",
        "Pas de payment_intent dans la session",
        session.id
      );
      return null;
    }

    // Récupérer le payment_intent avec les charges
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent,
      {
        expand: ["charges.data", "latest_charge"],
      }
    );

    // Si pas de customer, on ne peut pas créer de facture
    // Retourner le payment_intent pour utiliser le reçu de charge à la place
    if (!paymentIntent.customer && !session.customer) {
      logWithTimestamp(
        "warn",
        "Pas de customer pour créer une facture, utilisation du reçu de charge",
        paymentIntent.id
      );

      // Vérifier si on a un reçu de charge disponible
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        const charge = paymentIntent.charges.data[0];
        if (charge.receipt_url) {
          logWithTimestamp(
            "info",
            "Reçu de charge disponible",
            charge.receipt_url
          );
        }
      }

      return paymentIntent.id; // Retourner le payment_intent ID pour utiliser le reçu
    }

    const customerId = paymentIntent.customer || session.customer;

    // Vérifier si une facture existe déjà
    const existingInvoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    const existingInvoice = existingInvoices.data.find(
      (inv) => inv.payment_intent === paymentIntent.id
    );

    if (existingInvoice) {
      logWithTimestamp("info", "Facture existante trouvée", existingInvoice.id);
      return existingInvoice.id;
    }

    // Pour les paiements déjà effectués, on ne peut pas créer de facture rétroactivement
    // Retourner le payment_intent pour utiliser le reçu
    logWithTimestamp(
      "info",
      "Paiement déjà effectué, utilisation du reçu au lieu de créer une facture",
      paymentIntent.id
    );
    return paymentIntent.id;
  } catch (error) {
    logWithTimestamp("error", "Erreur création facture", error);
    return null;
  }
}

/**
 * Récupère l'ID de la facture ou du reçu pour un paiement
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<string|null>} ID de la facture/reçu ou null
 */
async function getInvoiceFromPayment(session) {
  try {
    logWithTimestamp("info", "Récupération Invoice pour paiement", session.id);

    // 1. Si on a déjà une invoice dans la session, l'utiliser
    if (session.invoice) {
      logWithTimestamp(
        "info",
        "Invoice trouvée dans la session",
        session.invoice
      );
      return session.invoice;
    }

    // 2. Chercher une facture existante via payment_intent
    if (session.payment_intent) {
      const invoices = await stripe.invoices.list({
        limit: 100,
        expand: ["data.payment_intent"],
      });

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

    // 3. Si pas de facture mais un payment_intent, retourner le payment_intent pour le reçu
    if (session.payment_intent) {
      logWithTimestamp(
        "info",
        "Pas de facture trouvée, utilisation du payment_intent comme reçu",
        session.payment_intent
      );
      return session.payment_intent;
    }

    logWithTimestamp(
      "warn",
      "Aucune Invoice ou payment_intent trouvé pour le paiement",
      session.id
    );
    return null;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération Invoice paiement", error);
    return null;
  }
}

/**
 * Récupère un reçu depuis un payment_intent
 * @param {string} paymentIntentId - ID du payment_intent
 * @returns {Promise<object|null>} Données du reçu ou null
 */
async function getReceiptFromPaymentIntent(paymentIntentId) {
  try {
    logWithTimestamp(
      "info",
      "Récupération reçu depuis payment_intent",
      paymentIntentId
    );

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["charges.data.receipt_url", "latest_charge"],
      }
    );

    if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
      const charge = paymentIntent.charges.data[0];

      if (charge.receipt_url) {
        return {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          created: paymentIntent.created,
          description: `Reçu de paiement ${paymentIntent.id}`,
          receipt_url: charge.receipt_url,
          receipt_type: "payment_intent_receipt",
        };
      }
    }

    return null;
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération reçu payment_intent", error);
    return null;
  }
}

// ========================
// FONCTIONS MÉTIER - ADHÉSIONS
// ========================

/**
 * Crée un forfait d'adhésion d'un an (paiement unique) avec gestion améliorée des factures
 * @param {object} metadata - Métadonnées de la session Stripe
 * @param {object} session - Session Stripe complétée
 * @returns {Promise<object>} Données de l'adhésion créée
 */
async function createMembership(metadata, session) {
  const { userId, associationId, userType, priceId, statusId } = metadata;
  const price = getPriceFromPriceId(priceId);

  logWithTimestamp("info", "=== DÉBUT CRÉATION FORFAIT ADHÉSION ===");
  logWithTimestamp("info", "📋 Metadata reçues", {
    userId: userId || "N/A",
    associationId: associationId || "N/A",
    userType,
    priceId,
    statusId,
    price: `${price}€`,
  });

  try {
    // Récupération ou création de la facture
    const invoiceId = await getInvoiceFromPayment(session);

    // Création d'une adhésion de 1 an exactement
    const membershipData = {
      membership_start: new Date().toISOString(),
      membership_end: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
      membership_price: price,
      status_id: parseInt(statusId),
    };

    // Ajout des IDs Stripe si disponibles
    if (invoiceId) {
      membershipData.stripe_invoice_id = invoiceId;
      logWithTimestamp("info", "📄 Invoice/Receipt ID ajouté", invoiceId);
    }

    if (session?.id) {
      membershipData.stripe_session_id = session.id;
      logWithTimestamp("info", "🔗 Session ID ajouté", session.id);
    }

    // Ajout de métadonnées pour debug et traçabilité
    if (session?.payment_intent) {
      membershipData.payment_intent_id = session.payment_intent;
      logWithTimestamp(
        "info",
        "💳 Payment Intent ID ajouté",
        session.payment_intent
      );
    }

    logWithTimestamp("info", "💾 Données forfait adhésion à insérer", {
      ...membershipData,
      membership_start: new Date(
        membershipData.membership_start
      ).toLocaleDateString("fr-FR"),
      membership_end: new Date(
        membershipData.membership_end
      ).toLocaleDateString("fr-FR"),
    });

    // Insertion de l'adhésion en base
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .insert(membershipData)
      .select()
      .single();

    if (membershipError) {
      logWithTimestamp("error", "❌ Erreur création forfait adhésion", {
        error: membershipError.message,
        code: membershipError.code,
        details: membershipError.details,
      });
      throw membershipError;
    }

    logWithTimestamp("info", "✅ Forfait adhésion créé avec succès", {
      membership_id: membership.membership_id,
      price: `${membership.membership_price}€`,
      duration: "1 an",
    });

    // Association utilisateur <-> adhésion
    if (userType === "user" && userId) {
      logWithTimestamp("info", "👤 Traitement adhésion UTILISATEUR", {
        userId,
      });

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
        logWithTimestamp("error", "❌ Erreur création user_membership", {
          error: userMembershipError.message,
          code: userMembershipError.code,
          userId,
          membership_id: membership.membership_id,
        });
        throw userMembershipError;
      }

      logWithTimestamp("info", "✅ User membership créé", userMembership);

      // Mise à jour du statut utilisateur
      const statusUpdated = await updateUserStatusToMembership(
        userId,
        statusId
      );
      logWithTimestamp(
        "info",
        `📊 Statut utilisateur ${statusUpdated ? "mis à jour" : "non modifié"}`,
        {
          userId,
          statusId,
        }
      );

      // Envoi email de confirmation
      const emailSent = await sendMembershipConfirmationEmail(
        userId,
        membership
      );
      logWithTimestamp(
        "info",
        `📧 Email utilisateur ${emailSent ? "envoyé" : "échoué"}`,
        { userId }
      );
    } else if (userType === "association" && associationId) {
      logWithTimestamp("info", "🏢 Traitement adhésion ASSOCIATION", {
        associationId,
      });

      // Vérifier d'abord si une adhésion existe déjà pour cette association
      const { data: existingMembership, error: checkError } = await supabase
        .from("associations_memberships")
        .select("*")
        .eq("association_id", associationId)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        logWithTimestamp("warn", "⚠️ Erreur vérification adhésion existante", {
          error: checkError.message,
          associationId,
        });
      }

      if (existingMembership) {
        logWithTimestamp(
          "info",
          "📝 Association a déjà une adhésion, création d'une nouvelle",
          {
            associationId,
            existingMembershipId: existingMembership.membership_id,
          }
        );
      }

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
        logWithTimestamp("error", "❌ Erreur création association_membership", {
          error: assoMembershipError.message,
          code: assoMembershipError.code,
          details: assoMembershipError.details,
          hint: assoMembershipError.hint,
          associationId,
          membership_id: membership.membership_id,
        });

        // Si c'est une erreur de clé dupliquée, donnons plus d'informations
        if (assoMembershipError.code === "23505") {
          logWithTimestamp("error", "🔑 Erreur de clé dupliquée détectée", {
            message:
              "L'association a déjà une entrée dans associations_memberships",
            suggestion:
              "Vérifiez le schéma de la table associations_memberships",
          });
        }

        throw assoMembershipError;
      }

      logWithTimestamp("info", "✅ Association membership créé", {
        association_id: assoMembership.association_id,
        membership_id: assoMembership.membership_id,
      });

      // Envoi email de confirmation spécifique aux associations
      const emailSent = await sendAssociationMembershipConfirmationEmail(
        associationId,
        membership
      );
      logWithTimestamp(
        "info",
        `📧 Email association ${emailSent ? "envoyé" : "échoué"}`,
        {
          associationId,
        }
      );
    } else {
      logWithTimestamp(
        "warn",
        "⚠️ Type d'utilisateur non reconnu ou données manquantes",
        {
          userType,
          hasUserId: !!userId,
          hasAssociationId: !!associationId,
        }
      );
    }

    // Tentative de création de facture en arrière-plan si pas encore disponible
    if (!invoiceId && session?.payment_intent) {
      logWithTimestamp("info", "🔄 Tentative création facture en arrière-plan");

      // Faire cela de manière asynchrone pour ne pas bloquer la création de l'adhésion
      setTimeout(async () => {
        try {
          const backgroundInvoiceId = await createInvoiceForPayment(session);
          if (backgroundInvoiceId) {
            // Mettre à jour l'adhésion avec la nouvelle facture
            await supabase
              .from("memberships")
              .update({ stripe_invoice_id: backgroundInvoiceId })
              .eq("membership_id", membership.membership_id);

            logWithTimestamp("info", "✅ Facture créée en arrière-plan", {
              membershipId: membership.membership_id,
              invoiceId: backgroundInvoiceId,
            });
          } else {
            logWithTimestamp(
              "warn",
              "⚠️ Impossible de créer la facture en arrière-plan",
              {
                membershipId: membership.membership_id,
                sessionId: session.id,
              }
            );
          }
        } catch (bgError) {
          logWithTimestamp("warn", "❌ Échec création facture arrière-plan", {
            error: bgError.message,
            membershipId: membership.membership_id,
          });
        }
      }, 5000); // Attendre 5 secondes puis essayer
    }

    logWithTimestamp(
      "info",
      "=== 🎉 FIN CRÉATION FORFAIT ADHÉSION - SUCCÈS ===",
      {
        membershipId: membership.membership_id,
        userType,
        price: `${price}€`,
        duration: "1 an",
      }
    );

    return membership;
  } catch (error) {
    logWithTimestamp("error", "=== ❌ ERREUR CRÉATION FORFAIT ADHÉSION ===", {
      error: error.message,
      code: error.code,
      userType,
      userId: userId || "N/A",
      associationId: associationId || "N/A",
      priceId,
      sessionId: session?.id,
    });
    throw error;
  }
}

// ========================
// FONCTIONS MÉTIER - FORMATIONS
// ========================

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

// ========================
// ROUTES API - FORFAITS D'ADHÉSION
// ========================

/**
 * POST /create-checkout-session
 * Crée une session de paiement Stripe pour un forfait d'adhésion d'un an
 * Body: { priceId, userId, associationId, userType, statusId, successUrl?, cancelUrl? }
 */
app.post("/create-checkout-session", async (req, res) => {
  const {
    priceId,
    userId,
    associationId,
    userType,
    statusId,
    successUrl,
    cancelUrl,
  } = req.body;

  logWithTimestamp("info", "=== CRÉATION SESSION FORFAIT ADHÉSION ===");
  logWithTimestamp("info", "Données reçues", {
    priceId,
    userId,
    associationId,
    userType,
    statusId,
    successUrl,
    cancelUrl,
  });

  // Validation des paramètres
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
    // Récupérer l'email de l'utilisateur pour créer un customer
    let customerEmail = null;
    if (userType === "user" && userId) {
      customerEmail = await getMailByUser(userId);
    }

    // URLs par défaut ou personnalisées
    const defaultSuccessUrl = `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${FRONTEND_URL}/pricing`;

    const sessionConfig = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      payment_method_types: ["card"],
      metadata: {
        userId: userId || "",
        associationId: associationId || "",
        userType: userType,
        priceId: priceId,
        statusId: statusId.toString(),
        type: "membership_onetime",
      },
      // IMPORTANT: Ajouter ces options pour créer automatiquement un customer
      customer_creation: "always", // Force la création d'un customer
      invoice_creation: {
        enabled: true, // Active la création automatique de facture
        invoice_data: {
          description:
            userType === "association"
              ? "Adhésion Novapsy - Association"
              : "Adhésion Novapsy - Forfait annuel",
          metadata: {
            type: "membership_onetime",
            userId: userId || "",
            associationId: associationId || "",
            userType: userType,
          },
        },
      },
    };

    // Si on a un email, l'ajouter pour pré-remplir le formulaire
    if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logWithTimestamp(
      "info",
      "Session Stripe forfait adhésion créée avec succès",
      {
        sessionId: session.id,
        userType: userType,
        successUrl: sessionConfig.success_url,
        customerCreation: "always",
        invoiceCreation: true,
      }
    );
    res.status(200).json({ url: session.url });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe forfait", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Envoie un email de confirmation d'adhésion pour une association
 * @param {string} associationId - UUID de l'association
 * @param {object} membershipData - Données de l'adhésion
 * @returns {Promise<boolean>} Succès de l'envoi
 */
async function sendAssociationMembershipConfirmationEmail(
  associationId,
  membershipData
) {
  try {
    // Récupérer les infos de l'association
    const { data: association, error } = await supabase
      .from("associations")
      .select("association_name, association_mail")
      .eq("association_id", associationId)
      .single();

    if (error || !association?.association_mail) {
      logWithTimestamp(
        "warn",
        "Email association non trouvé pour confirmation adhésion",
        { associationId }
      );
      return false;
    }

    const subject = `Confirmation d'adhésion - ${association.association_name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Bienvenue ! Votre association est maintenant adhérente</h2>
        
        <p>Nous sommes ravis de confirmer que l'adhésion de <strong>${association.association_name}</strong> a été activée avec succès.</p>
        
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
        
        <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2d5a2d;">🎉 Avantages pour tous vos membres :</h3>
          <ul style="color: #2d5a2d;">
            <li>Accès prioritaire aux événements</li>
            <li>Réductions sur les formations</li>
            <li>Support technique dédié</li>
            <li>Accès à la plateforme premium</li>
          </ul>
        </div>
        
        <p><strong>Important :</strong> Tous vos membres actuels et futurs bénéficient automatiquement de ces avantages. Aucune action supplémentaire n'est requise !</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

    return await sendEmail(association.association_mail, subject, html);
  } catch (error) {
    logWithTimestamp(
      "error",
      "Erreur envoi email confirmation adhésion association",
      {
        associationId,
        error: error.message,
      }
    );
    return false;
  }
}

/**
 * POST /process-payment-success
 * Traite le succès d'un paiement de forfait d'adhésion
 * Body: { sessionId }
 */
app.post("/process-payment-success", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS PAIEMENT FORFAIT ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      await createMembership(session.metadata, session);
      res.json({
        success: true,
        message: "Forfait adhésion acheté avec succès",
      });
    } else {
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp(
      "error",
      "Erreur traitement succès paiement forfait",
      error
    );
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /membership-status/:userId/:userType
 * Récupère l'historique des adhésions d'un utilisateur ou d'une association
 * Params: userId (UUID), userType ("user" | "association")
 */
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

// ========================
// ROUTES AMÉLIORÉES POUR LES REÇUS
// ========================

/**
 * GET /receipt/:invoiceId
 * Récupère le reçu PDF d'une adhésion (facture Stripe ou payment_intent)
 * Params: invoiceId (ID de la facture Stripe ou payment_intent)
 */
app.get("/receipt/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;

  logWithTimestamp("info", "Récupération reçu", invoiceId);

  try {
    // 1. Essayer de récupérer comme une facture
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
        description: `Facture ${invoice.number || invoice.id}`,
        period_start: invoice.period_start,
        period_end: invoice.period_end,
        receipt_type: "invoice",
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
    } catch (invoiceError) {
      // Si ce n'est pas une facture, essayer comme payment_intent
      logWithTimestamp(
        "info",
        "Pas une facture, essai comme payment_intent",
        invoiceId
      );
    }

    // 2. Essayer de récupérer comme un payment_intent avec reçu de charge
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoiceId, {
        expand: [
          "charges.data",
          "latest_charge",
          "latest_charge.balance_transaction",
        ],
      });

      // Chercher un reçu dans les charges
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        for (const charge of paymentIntent.charges.data) {
          if (charge.receipt_url) {
            return res.json({
              id: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              status: paymentIntent.status,
              created: paymentIntent.created,
              description: charge.description || `Paiement ${paymentIntent.id}`,
              receipt_url: charge.receipt_url,
              receipt_type: "charge_receipt",
              charge_id: charge.id,
              receipt_number: charge.receipt_number,
            });
          }
        }
      }

      // Si pas de receipt_url, essayer de générer un reçu
      if (paymentIntent.latest_charge) {
        logWithTimestamp(
          "info",
          "Tentative de génération de reçu pour la charge",
          paymentIntent.latest_charge
        );

        // Pour un payment_intent sans reçu, informer l'utilisateur
        return res.status(404).json({
          error: "Reçu non disponible pour ce paiement",
          payment_intent_id: paymentIntent.id,
          suggestion:
            "Le paiement a été effectué mais aucun reçu n'a été généré. Contactez le support pour obtenir une attestation de paiement.",
          payment_info: {
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            created: new Date(paymentIntent.created * 1000).toISOString(),
          },
        });
      }
    } catch (paymentError) {
      logWithTimestamp(
        "warn",
        "Pas un payment_intent valide",
        paymentError.message
      );
    }

    // 3. Aucun reçu disponible
    return res.status(404).json({
      error: "Document non trouvé",
      invoice_id: invoiceId,
      suggestion:
        "Ce document n'existe pas ou n'est plus disponible. Si c'est un ancien paiement, utilisez le bouton 'Find Session' pour retrouver les informations.",
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération reçu", error);
    res.status(500).json({
      error: error.message,
      suggestion:
        "Une erreur est survenue. Veuillez réessayer ou contacter le support.",
    });
  }
});

/**
 * POST /fix-invoice-id/:membershipId
 * Tente de corriger l'invoice_id manquant d'une adhésion
 * Params: membershipId
 * Body: { sessionId? }
 */
app.post("/fix-invoice-id/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== CORRECTION INVOICE ID ===", {
    membershipId,
    sessionId,
  });

  try {
    // 1. Récupérer l'adhésion
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("membership_id", membershipId)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    let invoiceId = null;
    let sessionToUse = sessionId || membership.stripe_session_id;

    // 2. Si on a une session, récupérer la facture
    if (sessionToUse) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionToUse);
        invoiceId = await getInvoiceFromPayment(session);
      } catch (sessionError) {
        logWithTimestamp("error", "Erreur récupération session", sessionError);
      }
    }

    // 3. Si toujours pas de facture, chercher par métadonnées
    if (!invoiceId) {
      try {
        const invoices = await stripe.invoices.list({
          limit: 100,
        });

        const matchingInvoice = invoices.data.find(
          (inv) =>
            inv.metadata?.membership_id === membershipId.toString() ||
            inv.metadata?.session_id === sessionToUse
        );

        if (matchingInvoice) {
          invoiceId = matchingInvoice.id;
        }
      } catch (searchError) {
        logWithTimestamp("error", "Erreur recherche factures", searchError);
      }
    }

    // 4. Mettre à jour l'adhésion
    if (invoiceId) {
      const { error: updateError } = await supabase
        .from("memberships")
        .update({ stripe_invoice_id: invoiceId })
        .eq("membership_id", membershipId);

      if (updateError) {
        return res.status(500).json({ error: "Erreur mise à jour adhésion" });
      }

      logWithTimestamp("info", "Invoice ID mis à jour avec succès", {
        membershipId,
        invoiceId,
      });

      res.json({
        success: true,
        message: "Invoice ID corrigé avec succès",
        invoice_id: invoiceId,
      });
    } else {
      res.status(404).json({
        error: "Impossible de trouver une facture pour cette adhésion",
        suggestions: [
          "Vérifiez que le paiement a bien été effectué",
          "Utilisez 'Find Session' pour retrouver la session de paiement",
          "Contactez le support si le problème persiste",
        ],
      });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur correction invoice ID", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/create-customer-for-membership/:membershipId", async (req, res) => {
  const { membershipId } = req.params;

  logWithTimestamp("info", "=== CRÉATION CUSTOMER RÉTROACTIVE ===", {
    membershipId,
  });

  try {
    // 1. Récupérer l'adhésion et l'utilisateur associé
    const { data: userMembership, error: membershipError } = await supabase
      .from("users_memberships")
      .select(
        `
        user_id,
        memberships (*)
      `
      )
      .eq("membership_id", membershipId)
      .single();

    if (membershipError || !userMembership) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    const userId = userMembership.user_id;
    const membership = userMembership.memberships;

    // 2. Récupérer l'email de l'utilisateur
    const userEmail = await getMailByUser(userId);
    if (!userEmail) {
      return res.status(400).json({ error: "Email utilisateur non trouvé" });
    }

    // 3. Créer un customer Stripe
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        user_id: userId,
        membership_id: membershipId,
        created_retroactively: "true",
      },
      description: `Customer créé rétroactivement pour l'adhésion ${membershipId}`,
    });

    logWithTimestamp("info", "Customer créé avec succès", {
      customerId: customer.id,
      email: userEmail,
    });

    res.json({
      success: true,
      message: "Customer créé avec succès",
      customer_id: customer.id,
      suggestion: "Vous pouvez maintenant essayer de regénérer la facture",
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur création customer rétroactive", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /find-session/:membershipId
 * Recherche la session Stripe associée à une adhésion
 * Params: membershipId
 */
app.post("/find-session/:membershipId", async (req, res) => {
  const { membershipId } = req.params;

  logWithTimestamp("info", "=== RECHERCHE SESSION ===", { membershipId });

  try {
    // 1. Récupérer l'adhésion
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("membership_id", membershipId)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    // 2. Si on a déjà une session, la vérifier
    if (membership.stripe_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          membership.stripe_session_id
        );
        return res.json({
          success: true,
          message: "Session trouvée",
          session: {
            id: session.id,
            payment_status: session.payment_status,
            payment_intent: session.payment_intent,
            amount_total: session.amount_total,
          },
        });
      } catch (sessionError) {
        logWithTimestamp("warn", "Session existante invalide", sessionError);
      }
    }

    // 3. Rechercher dans toutes les sessions récentes
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: {
        gte:
          Math.floor(new Date(membership.membership_start).getTime() / 1000) -
          3600, // 1h avant
      },
    });

    const potentialSessions = sessions.data.filter((session) => {
      const metadata = session.metadata || {};
      return (
        metadata.type === "membership_onetime" &&
        (metadata.userId || metadata.associationId) && // A un utilisateur associé
        session.payment_status === "paid" &&
        Math.abs(session.amount_total - membership.membership_price * 100) < 100 // Prix similaire (marge d'erreur de 1€)
      );
    });

    if (potentialSessions.length > 0) {
      const bestMatch = potentialSessions[0];

      // Mettre à jour l'adhésion avec la session trouvée
      const { error: updateError } = await supabase
        .from("memberships")
        .update({ stripe_session_id: bestMatch.id })
        .eq("membership_id", membershipId);

      if (updateError) {
        logWithTimestamp("error", "Erreur mise à jour session", updateError);
      }

      logWithTimestamp("info", "Session trouvée et mise à jour", {
        membershipId,
        sessionId: bestMatch.id,
      });

      res.json({
        success: true,
        message: "Session trouvée et associée à l'adhésion",
        session: {
          id: bestMatch.id,
          payment_status: bestMatch.payment_status,
          payment_intent: bestMatch.payment_intent,
          amount_total: bestMatch.amount_total,
        },
      });
    } else {
      res.status(404).json({
        error: "Aucune session correspondante trouvée",
        searched: {
          timeframe: `Depuis ${new Date(membership.membership_start).toISOString()}`,
          criteria: "Sessions de forfait d'adhésion payées",
          total_sessions_found: sessions.data.length,
        },
      });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur recherche session", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /refresh-invoice/:membershipId
 * Force la régénération de la facture pour une adhésion
 * Params: membershipId
 */
app.post("/refresh-invoice/:membershipId", async (req, res) => {
  const { membershipId } = req.params;

  logWithTimestamp("info", "=== RÉGÉNÉRATION FACTURE ===", { membershipId });

  try {
    // 1. Récupérer l'adhésion
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("membership_id", membershipId)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    if (!membership.stripe_session_id) {
      return res.status(400).json({
        error: "Pas de session Stripe associée",
        suggestion: "Utilisez 'Find Session' d'abord",
      });
    }

    // 2. Récupérer la session et forcer la création de facture
    const session = await stripe.checkout.sessions.retrieve(
      membership.stripe_session_id
    );
    const invoiceId = await createInvoiceForPayment(session);

    if (invoiceId) {
      // 3. Mettre à jour l'adhésion
      const { error: updateError } = await supabase
        .from("memberships")
        .update({ stripe_invoice_id: invoiceId })
        .eq("membership_id", membershipId);

      if (updateError) {
        return res.status(500).json({ error: "Erreur mise à jour adhésion" });
      }

      logWithTimestamp("info", "Facture régénérée avec succès", {
        membershipId,
        invoiceId,
      });

      res.json({
        success: true,
        message: "Facture régénérée avec succès",
        invoice_id: invoiceId,
      });
    } else {
      res.status(500).json({
        error: "Impossible de créer une facture",
        details: "Le paiement pourrait ne pas avoir de customer associé",
      });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur régénération facture", error);
    res.status(500).json({ error: error.message });
  }
});

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
// ROUTES DE DEBUG ASSOCIATIONS - AJOUTEZ CE CODE AVANT app.get("/health")
// ========================

/**
 * GET /debug/association-membership/:associationId
 * Debug des adhésions d'une association
 */
app.get("/debug/association-membership/:associationId", async (req, res) => {
  const { associationId } = req.params;

  logWithTimestamp("info", "=== DEBUG ADHÉSION ASSOCIATION ===", {
    associationId,
  });

  try {
    // 1. Vérifier que l'association existe
    const { data: association, error: assoError } = await supabase
      .from("associations")
      .select("*")
      .eq("association_id", associationId)
      .single();

    if (assoError) {
      logWithTimestamp("error", "Association non trouvée", assoError);
      return res.status(404).json({ error: "Association non trouvée" });
    }

    // 2. Récupérer toutes les adhésions de l'association
    const { data: memberships, error: membershipError } = await supabase
      .from("associations_memberships")
      .select(
        `
        *,
        memberships (
          membership_id,
          membership_start,
          membership_end,
          membership_price,
          status_id,
          stripe_invoice_id,
          stripe_session_id,
          payment_type,
          payment_status,
          payment_intent_id
        )
      `
      )
      .eq("association_id", associationId)
      .order("memberships(membership_start)", { ascending: false });

    if (membershipError) {
      logWithTimestamp(
        "error",
        "Erreur récupération adhésions",
        membershipError
      );
    }

    // 3. Calculer les statuts des adhésions
    const now = new Date();
    const processedMemberships = (memberships || []).map((item) => {
      const membership = item.memberships;
      const endDate = new Date(membership.membership_end);

      return {
        ...item,
        membership_details: {
          ...membership,
          isActive: endDate > now && membership.payment_status === "paid",
          isExpired: endDate <= now,
          daysRemaining: Math.max(
            0,
            Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
          ),
        },
      };
    });

    // 4. Compter les membres de l'association
    const { count: memberCount, error: countError } = await supabase
      .from("users_associations")
      .select("*", { count: "exact", head: true })
      .eq("association_id", associationId);

    if (countError) {
      logWithTimestamp("error", "Erreur comptage membres", countError);
    }

    const debugInfo = {
      association: {
        id: association.association_id,
        name: association.association_name,
        email: association.association_mail,
      },
      memberships: {
        total: processedMemberships.length,
        active: processedMemberships.filter(
          (m) => m.membership_details.isActive
        ).length,
        expired: processedMemberships.filter(
          (m) => m.membership_details.isExpired
        ).length,
        details: processedMemberships,
      },
      members: {
        total: memberCount || 0,
      },
      debug_timestamp: new Date().toISOString(),
    };

    logWithTimestamp("info", "Debug adhésion association complété", {
      associationId,
      totalMemberships: debugInfo.memberships.total,
      activeMemberships: debugInfo.memberships.active,
      totalMembers: debugInfo.members.total,
    });

    res.json(debugInfo);
  } catch (error) {
    logWithTimestamp("error", "Erreur debug adhésion association", error);
    res.status(500).json({
      error: error.message,
      associationId,
    });
  }
});

/**
 * GET /verify-association-membership/:associationId
 * Vérifie l'adhésion active d'une association (version simplifiée)
 */
app.get("/verify-association-membership/:associationId", async (req, res) => {
  const { associationId } = req.params;

  try {
    const { data, error } = await supabase
      .from("associations_memberships")
      .select(
        `
        *,
        memberships (
          membership_id,
          membership_start,
          membership_end,
          membership_price,
          status_id,
          stripe_invoice_id,
          stripe_session_id,
          payment_status
        )
      `
      )
      .eq("association_id", associationId)
      .order("memberships(membership_start)", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const now = new Date();
    const activeMemberships = (data || []).filter((item) => {
      const endDate = new Date(item.memberships.membership_end);
      return endDate > now && item.memberships.payment_status === "paid";
    });

    res.json({
      association_id: associationId,
      total_memberships: data?.length || 0,
      active_memberships: activeMemberships.length,
      latest_membership: data?.[0] || null,
      has_active_membership: activeMemberships.length > 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    version: "2.0.0-contact-focused",
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
// FONCTIONS VALIDATION DEMANDE PRÉVENTION
// ========================
// 👆 AJOUTER CE CODE APRÈS LA ROUTE `/contact` et AVANT `/contact/test` 👆

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
// GESTION D'ERREURS
// ========================

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
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
});

// Route non trouvée
app.use("*", (req, res) => {
  logWithTimestamp("warn", "Route non trouvée", {
    method: req.method,
    url: req.originalUrl,
  });

  res.status(404).json({
    success: false,
    error: "Route non trouvée",
    availableRoutes: ["POST /contact", "GET /contact/test", "GET /health"],
  });
});

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
      logWithTimestamp("info", "✅ Backend Novapsy - Focus Formulaire Contact");
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

// ========================
// DÉMARRAGE SERVEUR
// ========================

// Démarrage
startServer();
