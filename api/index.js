require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

// Initialisation Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ========================
// MIDDLEWARES
// ========================

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Middleware CORS amélioré
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Liste des origines autorisées
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173", // Vite dev server
    "http://localhost:3000", // Au cas où
    "http://127.0.0.1:5173", // Alternative localhost
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

  // Gérer les requêtes OPTIONS (preflight)
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

    // 🔥 NOUVEAU: Formations
    price_1RZKxz05Uibkj68MfCpirZlH: 250, // PSSM (prix de base)
    price_1RT2Gi05Uibkj68MuYaG5HZn: 50, // VSS (prix de base)
  };
  return prices[priceId] || 0;
}

// 🔥 NOUVEAU: Fonction pour obtenir les détails d'une formation
function getTrainingDetails(priceId) {
  const trainings = {
    price_1RZKxz05Uibkj68MfCpirZlH: {
      name: "PSSM",
      base_price: 250,
      member_discount: 35, // 35€ de réduction pour les adhérents
      duration: 20, // 20 heures
      training_type: "Premiers Secours en Santé Mentale",
    },
    price_1RT2Gi05Uibkj68MuYaG5HZn: {
      name: "VSS",
      base_price: 50,
      member_discount: 15, // 10€ de réduction pour les adhérents
      duration: 12, // 12 heures
      training_type: "Violences Sexistes et Sexuelles",
    },
  };
  return trainings[priceId] || null;
}

// 🔥 NOUVEAU: Vérifier si l'utilisateur est adhérent
async function checkIfUserIsMember(userId) {
  try {
    logWithTimestamp("info", "Vérification statut adhérent", { userId });

    const { data, error } = await supabase
      .from("users_status")
      .select("status_id")
      .eq("user_id", userId)
      .in("status_id", [2, 3, 4]) // Status adhérents
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

// 🔥 NOUVEAU: Calculer le prix avec réduction
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

    // 1. Si on a une session_id, on peut récupérer la subscription
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

    // 2. Si on a une invoice_id, on peut récupérer la subscription
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

    // 3. Recherche par période et montant (moins fiable)
    const startDate = Math.floor(
      new Date(membership.membership_start).getTime() / 1000
    );
    const endDate = Math.floor(
      new Date(membership.membership_end).getTime() / 1000
    );

    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      created: {
        gte: startDate - 86400, // 1 jour avant
        lte: startDate + 86400, // 1 jour après
      },
    });

    for (const sub of subscriptions.data) {
      // Vérifier si le montant correspond
      const subAmount = sub.items.data[0]?.price?.unit_amount / 100;
      if (subAmount === membership.membership_price) {
        logWithTimestamp(
          "info",
          "Subscription trouvée par correspondance",
          sub.id
        );
        return sub.id;
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

      // ✅ GESTION DES STATUTS : Mettre à jour le statut utilisateur
      await updateUserStatusToMembership(userId, statusId);
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

// 🔥 NOUVELLE FONCTION: Créer un achat de formation
async function createTrainingPurchase(metadata, session) {
  const {
    userId,
    trainingId,
    priceId,
    originalPrice,
    discountedPrice,
    isMember,
  } = metadata;

  logWithTimestamp("info", "=== DÉBUT CRÉATION ACHAT FORMATION ===");
  logWithTimestamp("info", "Metadata reçues", metadata);

  try {
    // Récupérer les détails de la formation
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      throw new Error(`Formation non trouvée pour priceId: ${priceId}`);
    }

    // Vérifier si l'utilisateur a déjà acheté cette formation
    const { data: existingPurchase } = await supabase
      .from("trainings_purchase")
      .select("purchase_id")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .single();

    if (existingPurchase) {
      logWithTimestamp("warn", "Formation déjà achetée", {
        userId,
        trainingId,
      });
      return existingPurchase;
    }

    const purchaseData = {
      user_id: parseInt(userId),
      training_id: trainingId,
      purchase_date: new Date().toISOString(),
      purchase_amount: parseFloat(discountedPrice),
      original_price: parseFloat(originalPrice),
      member_discount:
        isMember === "true"
          ? parseFloat(originalPrice) - parseFloat(discountedPrice)
          : 0,
      payment_method: "stripe",
      payment_status: "paid",
      stripe_session_id: session.id,
      hours_purchased: trainingDetails.duration,
      hours_consumed: 0,
    };

    logWithTimestamp("info", "Données achat formation à insérer", purchaseData);

    const { data: purchase, error: purchaseError } = await supabase
      .from("trainings_purchase")
      .insert(purchaseData)
      .select()
      .single();

    if (purchaseError) {
      logWithTimestamp(
        "error",
        "Erreur création achat formation",
        purchaseError
      );
      throw purchaseError;
    }

    logWithTimestamp("info", "Achat formation créé avec succès", purchase);
    logWithTimestamp("info", "=== FIN CRÉATION ACHAT FORMATION - SUCCÈS ===");
    return purchase;
  } catch (error) {
    logWithTimestamp("error", "=== ERREUR CRÉATION ACHAT FORMATION ===", error);
    throw error;
  }
}

// ========================
// ROUTES API - ADHÉSIONS (existantes)
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
      cancel_url: `${FRONTEND_URL}/cancel`,
      payment_method_types: ["card"],
      metadata: {
        userId: userId || "",
        associationId: associationId || "",
        userType: userType,
        priceId: priceId,
        statusId: statusId.toString(),
        type: "membership", // 🔥 AJOUT: Identifier le type de transaction
      },
    });

    logWithTimestamp("info", "Session Stripe créée avec succès", session.id);
    res.status(200).json({ url: session.url });
  } catch (err) {
    logWithTimestamp("error", "Erreur création session Stripe", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔥 NOUVELLES ROUTES - FORMATIONS

// Route pour créer une session de paiement pour une formation
app.post("/create-training-checkout", async (req, res) => {
  const { priceId, userId, trainingId } = req.body;

  logWithTimestamp("info", "=== DÉBUT CRÉATION SESSION FORMATION ===");
  logWithTimestamp("info", "Données reçues", { priceId, userId, trainingId });

  if (!priceId) return res.status(400).json({ error: "priceId manquant" });
  if (!userId) return res.status(400).json({ error: "userId manquant" });
  if (!trainingId)
    return res.status(400).json({ error: "trainingId manquant" });

  try {
    // Récupérer les détails de la formation
    const trainingDetails = getTrainingDetails(priceId);
    if (!trainingDetails) {
      return res.status(400).json({ error: "Formation non trouvée" });
    }

    // Vérifier si l'utilisateur est adhérent
    const isMember = await checkIfUserIsMember(userId);

    // Calculer le prix avec réduction
    const finalPrice = calculateDiscountedPrice(trainingDetails, isMember);

    // Vérifier si l'utilisateur a déjà acheté cette formation
    const { data: existingPurchase } = await supabase
      .from("trainings_purchase")
      .select("purchase_id")
      .eq("user_id", userId)
      .eq("training_id", trainingId)
      .single();

    if (existingPurchase) {
      return res
        .status(400)
        .json({ error: "Vous avez déjà acheté cette formation" });
    }

    // Créer la session Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Formation ${trainingDetails.name}`,
              description: `${trainingDetails.training_type} - ${trainingDetails.duration} heures`,
              metadata: {
                training_type: trainingDetails.training_type,
                duration: trainingDetails.duration.toString(),
              },
            },
            unit_amount: Math.round(finalPrice * 100), // Convertir en centimes
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
        type: "training_purchase", // 🔥 Identifier le type de transaction
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

// Route pour obtenir les détails d'une formation avec prix
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

// Route pour vérifier si un utilisateur a acheté une formation
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
      // PGRST116 = no rows returned
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

// Route pour traiter le succès d'un achat de formation
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

// ========================
// ROUTES EXISTANTES (adhésions)
// ========================

app.get("/receipt/:invoiceId", async (req, res) => {
  const { invoiceId } = req.params;

  logWithTimestamp("info", "Récupération reçu Invoice", invoiceId);

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["charge", "payment_intent.charges"],
    });

    logWithTimestamp("info", "Invoice récupérée", {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url ? "Présent" : "Absent",
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
      logWithTimestamp(
        "info",
        "Reçu via hosted_invoice_url",
        invoice.hosted_invoice_url
      );
      return res.json(receiptData);
    }

    if (invoice.invoice_pdf) {
      receiptData.receipt_url = invoice.invoice_pdf;
      receiptData.receipt_type = "invoice_pdf";
      logWithTimestamp("info", "Reçu via invoice_pdf", invoice.invoice_pdf);
      return res.json(receiptData);
    }

    if (invoice.payment_intent) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          invoice.payment_intent,
          {
            expand: ["charges.data"],
          }
        );

        const charge = paymentIntent.charges?.data?.[0];
        if (charge?.receipt_url) {
          receiptData.receipt_url = charge.receipt_url;
          receiptData.receipt_type = "charge_receipt";
          logWithTimestamp(
            "info",
            "Reçu via charge receipt_url",
            charge.receipt_url
          );
          return res.json(receiptData);
        }
      } catch (piError) {
        logWithTimestamp(
          "warn",
          "Erreur récupération Payment Intent",
          piError.message
        );
      }
    }

    logWithTimestamp(
      "warn",
      "Aucun reçu disponible pour cette Invoice",
      invoiceId
    );
    return res.status(404).json({
      error: "Reçu temporairement indisponible",
      invoice_id: invoiceId,
      suggestion: "Le reçu sera disponible dans quelques minutes",
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur récupération reçu", error);

    if (error.code === "resource_missing") {
      return res.status(404).json({
        error: "Invoice non trouvée",
        invoice_id: invoiceId,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

app.get("/membership-status/:userId/:userType", async (req, res) => {
  const { userId, userType } = req.params;

  logWithTimestamp("info", "Vérification statut adhésion", {
    userId,
    userType,
  });

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

    logWithTimestamp(
      "info",
      "Statut adhésion récupéré",
      `${data.length} adhésions trouvées`
    );
    res.json({ memberships: data });
  } catch (err) {
    logWithTimestamp("error", "Erreur vérification statut", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/process-payment-success", async (req, res) => {
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== TRAITEMENT SUCCÈS PAIEMENT ===");
  logWithTimestamp("info", "Session ID reçu", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    logWithTimestamp("info", "Session Stripe récupérée", {
      id: session.id,
      payment_status: session.payment_status,
      mode: session.mode,
    });

    if (session.payment_status === "paid") {
      await createMembership(session.metadata, session.subscription, session);
      logWithTimestamp(
        "info",
        "Adhésion créée avec succès pour la session",
        session.id
      );
      res.json({ success: true, message: "Adhésion créée avec succès" });
    } else {
      logWithTimestamp("warn", "Paiement non confirmé", session.payment_status);
      res.status(400).json({ error: "Paiement non confirmé" });
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur traitement succès paiement", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================
// ROUTES POUR GESTION DES ADHÉSIONS (existantes)
// ========================

// Route pour mettre à jour l'invoice ID manuellement
app.post("/update-invoice/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { sessionId } = req.body;

  logWithTimestamp("info", "=== MISE À JOUR INVOICE ID ===");

  if (!membershipId || !sessionId) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  try {
    // Récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session non trouvée" });
    }

    // Obtenir l'invoice ID de la session
    const invoiceId = await getInvoiceFromSession(session);

    if (!invoiceId) {
      return res
        .status(404)
        .json({ error: "Invoice non trouvée pour cette session" });
    }

    // Mettre à jour l'adhésion
    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({
        stripe_invoice_id: invoiceId,
        stripe_session_id: sessionId,
      })
      .eq("membership_id", membershipId)
      .select()
      .single();

    if (updateError) throw updateError;

    logWithTimestamp("info", "Invoice ID mis à jour avec succès", {
      membershipId,
      invoiceId,
    });
    res.json({
      success: true,
      invoice_id: invoiceId,
      membership: updated,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur mise à jour invoice ID", error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour rafraîchir automatiquement l'invoice ID
app.post("/refresh-invoice/:membershipId", async (req, res) => {
  const { membershipId } = req.params;

  logWithTimestamp("info", "=== RAFRAÎCHISSEMENT INVOICE ID ===");

  if (!membershipId) {
    return res.status(400).json({ error: "Membership ID manquant" });
  }

  try {
    // Récupérer l'adhésion
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("membership_id", membershipId)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    let invoiceId = null;

    // Si on a déjà une session ID, essayer de récupérer l'invoice
    if (membership.stripe_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          membership.stripe_session_id
        );
        invoiceId = await getInvoiceFromSession(session);
      } catch (error) {
        logWithTimestamp(
          "warn",
          "Erreur récupération session existante",
          error.message
        );
      }
    }

    // Si pas d'invoice trouvée, chercher dans les factures récentes
    if (!invoiceId) {
      const startTime = Math.floor(
        new Date(membership.membership_start).getTime() / 1000
      );
      const endTime = startTime + 86400; // +24h

      const invoices = await stripe.invoices.list({
        limit: 50,
        created: {
          gte: startTime - 3600, // -1h pour marge
          lte: endTime + 3600, // +1h pour marge
        },
      });

      // Chercher une facture correspondant au montant
      const matchingInvoice = invoices.data.find(
        (invoice) => invoice.amount_paid / 100 === membership.membership_price
      );

      if (matchingInvoice) {
        invoiceId = matchingInvoice.id;
        logWithTimestamp(
          "info",
          "Invoice trouvée par correspondance",
          invoiceId
        );
      }
    }

    if (!invoiceId) {
      return res
        .status(404)
        .json({ error: "Aucune invoice trouvée pour cette adhésion" });
    }

    // Mettre à jour l'adhésion
    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({ stripe_invoice_id: invoiceId })
      .eq("membership_id", membershipId)
      .select()
      .single();

    if (updateError) throw updateError;

    logWithTimestamp("info", "Invoice ID rafraîchie avec succès", {
      membershipId,
      invoiceId,
    });
    res.json({
      success: true,
      invoice_id: invoiceId,
      membership: updated,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur rafraîchissement invoice ID", error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour trouver et mettre à jour la session ID
app.post("/find-session/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { user_id, membership_price, membership_start } = req.body;

  logWithTimestamp("info", "=== RECHERCHE SESSION ID ===");

  if (!membershipId || !user_id || !membership_price || !membership_start) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  try {
    const startTime = Math.floor(new Date(membership_start).getTime() / 1000);
    const endTime = startTime + 86400; // +24h

    // Chercher les sessions dans la période
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: {
        gte: startTime - 3600, // -1h pour marge
        lte: endTime + 3600, // +1h pour marge
      },
    });

    // Chercher une session correspondant aux critères
    let matchingSession = null;
    for (const session of sessions.data) {
      // Vérifier si le montant correspond
      if (
        session.amount_total &&
        session.amount_total / 100 === membership_price
      ) {
        // Vérifier les métadonnées si disponibles
        if (session.metadata && session.metadata.userId === user_id) {
          matchingSession = session;
          break;
        }
        // Sinon, prendre la première qui correspond au montant
        if (!matchingSession) {
          matchingSession = session;
        }
      }
    }

    if (!matchingSession) {
      return res.status(404).json({
        error: "Aucune session trouvée correspondant aux critères",
        debug: {
          searched_period: `${new Date(
            startTime * 1000
          ).toISOString()} - ${new Date(endTime * 1000).toISOString()}`,
          expected_amount: membership_price,
          sessions_found: sessions.data.length,
        },
      });
    }

    // Mettre à jour l'adhésion
    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({ stripe_session_id: matchingSession.id })
      .eq("membership_id", membershipId)
      .select()
      .single();

    if (updateError) throw updateError;

    logWithTimestamp("info", "Session ID trouvée et mise à jour", {
      membershipId,
      sessionId: matchingSession.id,
    });

    res.json({
      success: true,
      session_id: matchingSession.id,
      membership: updated,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur recherche session ID", error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour terminer une adhésion (annuler le renouvellement automatique)
app.post("/terminate-membership/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { user_id, user_type } = req.body;

  logWithTimestamp("info", "=== TERMINATION ADHÉSION ===");

  if (!membershipId || !user_id || !user_type) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  try {
    // Vérifier que l'adhésion appartient à l'utilisateur
    let checkQuery;
    if (user_type === "user") {
      checkQuery = supabase
        .from("users_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            cancelled_at,
            stripe_subscription_cancelled,
            stripe_session_id,
            stripe_invoice_id,
            status_id,
            status (status_name)
          )
        `
        )
        .eq("user_id", user_id)
        .eq("membership_id", membershipId);
    } else {
      checkQuery = supabase
        .from("associations_memberships")
        .select(
          `
          membership_id,
          memberships (
            membership_id,
            membership_start,
            membership_end,
            cancelled_at,
            stripe_subscription_cancelled,
            stripe_session_id,
            stripe_invoice_id,
            status_id,
            status (status_name)
          )
        `
        )
        .eq("association_id", user_id)
        .eq("membership_id", membershipId);
    }

    const { data: membershipData, error: findError } = await checkQuery;

    if (findError) {
      logWithTimestamp("error", "Erreur recherche membership", findError);
      throw findError;
    }

    if (!membershipData || membershipData.length === 0) {
      return res.status(404).json({ error: "Adhésion non trouvée" });
    }

    // Prendre la première adhésion trouvée
    const membershipRow = membershipData[0];
    const membership = membershipRow.memberships;

    if (!membership) {
      return res.status(404).json({ error: "Données d'adhésion manquantes" });
    }

    // Vérifier si déjà annulée
    if (membership.cancelled_at) {
      return res.status(400).json({ error: "Adhésion déjà annulée" });
    }

    // Vérifier si le renouvellement est déjà annulé
    if (membership.stripe_subscription_cancelled) {
      return res.status(400).json({ error: "Renouvellement déjà annulé" });
    }

    // Vérifier si l'adhésion est encore active
    const now = new Date();
    const endDate = new Date(membership.membership_end);
    if (endDate <= now) {
      return res.status(400).json({ error: "Adhésion déjà expirée" });
    }

    // Trouver et annuler l'abonnement Stripe
    const subscriptionId = await findSubscriptionFromMembership(membership);

    if (subscriptionId) {
      try {
        // Annuler l'abonnement à la fin de la période de facturation
        const canceledSubscription = await stripe.subscriptions.update(
          subscriptionId,
          {
            cancel_at_period_end: true,
          }
        );

        logWithTimestamp("info", "Subscription Stripe annulée", {
          subscription_id: subscriptionId,
          cancel_at: canceledSubscription.cancel_at,
        });
      } catch (stripeError) {
        logWithTimestamp(
          "warn",
          "Erreur annulation Stripe (continuons quand même)",
          stripeError.message
        );
      }
    } else {
      logWithTimestamp(
        "warn",
        "Subscription Stripe non trouvée, marquage local seulement"
      );
    }

    logWithTimestamp("info", "Tentative mise à jour membership", {
      membershipId,
      membershipIdType: typeof membershipId,
    });

    // Marquer l'adhésion comme ayant le renouvellement annulé
    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({
        stripe_subscription_cancelled: true,
      })
      .eq("membership_id", parseInt(membershipId)) // S'assurer que c'est un entier
      .select();

    if (updateError) {
      logWithTimestamp("error", "Erreur mise à jour membership", updateError);
      throw updateError;
    }

    if (!updated || updated.length === 0) {
      logWithTimestamp("error", "Aucune ligne mise à jour", { membershipId });
      throw new Error("Impossible de mettre à jour l'adhésion");
    }

    const updatedMembership = updated[0];

    logWithTimestamp("info", "Renouvellement d'adhésion annulé avec succès");

    // ✅ MODIFICATION : Supprimer le statut utilisateur au lieu de le mettre à "Connecté"
    logWithTimestamp("info", "Data membership", membership);
    if (user_type === "user" && membership.status_id) {
      await removeUserStatus(user_id, membership.status_id);
    }

    res.json({
      success: true,
      message:
        "Le renouvellement automatique a été annulé. Votre adhésion restera active jusqu'à sa date d'expiration.",
      membership: updatedMembership,
      end_date: membership.membership_end,
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur termination", error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour supprimer définitivement une adhésion
app.delete("/delete-membership/:membershipId", async (req, res) => {
  const { membershipId } = req.params;
  const { user_id, user_type } = req.body;

  logWithTimestamp("info", "=== SUPPRESSION ADHÉSION ===", {
    membershipId,
    user_id,
    user_type,
  });

  if (!membershipId || !user_id || !user_type) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  try {
    // Étape 1 : Vérifier que l'association user/membership existe
    let checkAssocQuery;
    if (user_type === "user") {
      checkAssocQuery = supabase
        .from("users_memberships")
        .select("membership_id")
        .eq("user_id", user_id)
        .eq("membership_id", membershipId);
    } else {
      checkAssocQuery = supabase
        .from("associations_memberships")
        .select("membership_id")
        .eq("association_id", user_id)
        .eq("membership_id", membershipId);
    }

    const { data: assocData, error: assocError } = await checkAssocQuery;

    if (assocError) {
      logWithTimestamp("error", "Erreur vérification association", assocError);
      throw assocError;
    }

    if (!assocData || assocData.length === 0) {
      return res
        .status(404)
        .json({ error: "Adhésion non trouvée pour cet utilisateur" });
    }

    if (assocData.length > 1) {
      logWithTimestamp("warn", "Plusieurs associations trouvées", {
        membershipId,
        user_id,
        count: assocData.length,
      });
    }

    // Étape 2 : Récupérer les détails de l'adhésion
    const { data: membershipData, error: membershipError } = await supabase
      .from("memberships")
      .select("membership_id, membership_end, cancelled_at")
      .eq("membership_id", membershipId);

    if (membershipError) {
      logWithTimestamp(
        "error",
        "Erreur récupération membership",
        membershipError
      );
      throw membershipError;
    }

    // Vérifier si l'adhésion existe
    if (!membershipData || membershipData.length === 0) {
      logWithTimestamp(
        "info",
        "Membership inexistante, suppression de l'association seulement"
      );

      let deleteAssocQuery;
      if (user_type === "user") {
        deleteAssocQuery = supabase
          .from("users_memberships")
          .delete()
          .eq("user_id", user_id)
          .eq("membership_id", membershipId);
      } else {
        deleteAssocQuery = supabase
          .from("associations_memberships")
          .delete()
          .eq("association_id", user_id)
          .eq("membership_id", membershipId);
      }

      const { error: deleteAssocError } = await deleteAssocQuery;
      if (deleteAssocError) throw deleteAssocError;

      // ✅ GESTION DES STATUTS : Mettre l'utilisateur au statut "Connecté"
      if (user_type === "user") {
        await updateUserStatusToConnected(user_id);
      }

      return res.json({
        success: true,
        message: "Association supprimée (adhésion déjà inexistante)",
      });
    }

    // Prendre la première adhésion (il ne devrait y en avoir qu'une)
    const membership = membershipData[0];

    if (membershipData.length > 1) {
      logWithTimestamp("warn", "Plusieurs adhésions trouvées avec le même ID", {
        membershipId,
        count: membershipData.length,
      });
    }

    // Étape 3 : Vérifier que l'adhésion peut être supprimée (annulée ou expirée)
    const now = new Date();
    const endDate = new Date(membership.membership_end);
    const isExpired = endDate <= now;
    const isCancelled = membership.cancelled_at;

    if (!isExpired && !isCancelled) {
      return res.status(400).json({
        error:
          "Seules les adhésions annulées ou expirées peuvent être supprimées",
        debug: {
          is_expired: isExpired,
          is_cancelled: !!isCancelled,
          end_date: membership.membership_end,
          now: now.toISOString(),
        },
      });
    }

    // Étape 4 : Supprimer l'association user/membership d'abord
    let deleteAssocQuery;
    if (user_type === "user") {
      deleteAssocQuery = supabase
        .from("users_memberships")
        .delete()
        .eq("user_id", user_id)
        .eq("membership_id", membershipId);
    } else {
      deleteAssocQuery = supabase
        .from("associations_memberships")
        .delete()
        .eq("association_id", user_id)
        .eq("membership_id", membershipId);
    }

    const { error: deleteAssocError } = await deleteAssocQuery;
    if (deleteAssocError) {
      logWithTimestamp(
        "error",
        "Erreur suppression association",
        deleteAssocError
      );
      throw deleteAssocError;
    }

    logWithTimestamp("info", "Association user/membership supprimée");

    // Étape 5 : Vérifier si d'autres utilisateurs ont cette adhésion
    const { data: otherUsers, error: otherError } = await supabase
      .from("users_memberships")
      .select("user_id")
      .eq("membership_id", membershipId);

    const { data: otherAssocs, error: otherAssocError } = await supabase
      .from("associations_memberships")
      .select("association_id")
      .eq("membership_id", membershipId);

    if (otherError || otherAssocError) {
      logWithTimestamp("warn", "Erreur vérification autres utilisateurs", {
        otherError,
        otherAssocError,
      });
    }

    const hasOtherUsers =
      (otherUsers && otherUsers.length > 0) ||
      (otherAssocs && otherAssocs.length > 0);

    if (hasOtherUsers) {
      logWithTimestamp("info", "Adhésion partagée, conservation de l'adhésion");

      // ✅ GESTION DES STATUTS : Mettre l'utilisateur au statut "Connecté" après suppression de son accès
      if (user_type === "user") {
        await updateUserStatusToConnected(user_id);
      }

      return res.json({
        success: true,
        message: "Votre accès à l'adhésion a été supprimé",
      });
    }

    // Étape 6 : Supprimer l'adhésion si plus personne ne l'utilise
    const { error: deleteMembershipError } = await supabase
      .from("memberships")
      .delete()
      .eq("membership_id", membershipId);

    if (deleteMembershipError) {
      logWithTimestamp(
        "error",
        "Erreur suppression membership",
        deleteMembershipError
      );
      throw deleteMembershipError;
    }

    logWithTimestamp("info", "Adhésion supprimée complètement");

    // ✅ GESTION DES STATUTS : Mettre l'utilisateur au statut "Connecté" après suppression complète
    if (user_type === "user" && membership.status_id) {
      await removeUserStatus(user_id, membership.status_id);
    }

    res.json({
      success: true,
      message: "Adhésion supprimée définitivement",
    });
  } catch (error) {
    logWithTimestamp("error", "Erreur suppression adhésion", {
      error: error.message,
      code: error.code,
      details: error.details,
    });
    res.status(500).json({
      error: error.message,
      debug:
        process.env.NODE_ENV === "development"
          ? {
              code: error.code,
              details: error.details,
            }
          : undefined,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "10.0.0-avec-formations-et-reductions",
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

  logWithTimestamp("info", "Webhook reçu", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        logWithTimestamp("info", "Session checkout complétée", session.id);

        try {
          // 🔥 MODIFICATION: Vérifier le type de transaction
          if (session.metadata.type === "training_purchase") {
            await createTrainingPurchase(session.metadata, session);
            logWithTimestamp(
              "info",
              "Achat formation créé avec succès via webhook",
              session.id
            );
          } else {
            // Adhésion (comportement existant)
            await createMembership(
              session.metadata,
              session.subscription,
              session
            );
            logWithTimestamp(
              "info",
              "Adhésion créée avec succès via webhook",
              session.id
            );
          }
        } catch (error) {
          logWithTimestamp("error", "Erreur création via webhook", error);
        }
        break;

      case "invoice.payment_succeeded":
        const invoice = event.data.object;
        logWithTimestamp(
          "info",
          "Facture payée - mise à jour potentielle",
          invoice.id
        );

        try {
          const { data: updatedMemberships, error } = await supabase
            .from("memberships")
            .update({
              stripe_invoice_id: invoice.id,
            })
            .is("stripe_invoice_id", null)
            .gte(
              "created_at",
              new Date(Date.now() - 60 * 60 * 1000).toISOString()
            )
            .select();

          if (error) {
            logWithTimestamp(
              "error",
              "Erreur mise à jour invoice_id via webhook",
              error
            );
          } else if (updatedMemberships && updatedMemberships.length > 0) {
            logWithTimestamp(
              "info",
              "Memberships mises à jour avec invoice_id",
              {
                count: updatedMemberships.length,
                invoice_id: invoice.id,
              }
            );
          }
        } catch (error) {
          logWithTimestamp(
            "error",
            "Erreur traitement invoice.payment_succeeded",
            error
          );
        }
        break;

      case "invoice.payment_failed":
        const failedInvoice = event.data.object;
        logWithTimestamp("warn", "❌ Paiement échoué", {
          invoice_id: failedInvoice.id,
          amount: failedInvoice.amount_due / 100,
          customer: failedInvoice.customer,
        });
        break;

      case "customer.subscription.updated":
        logWithTimestamp("info", "Abonnement mis à jour", event.data.object.id);
        break;

      case "customer.subscription.deleted":
        logWithTimestamp("info", "Abonnement supprimé", event.data.object.id);
        break;

      default:
        logWithTimestamp("info", "Type d'événement non géré", event.type);
    }
  } catch (error) {
    logWithTimestamp("error", "Erreur traitement webhook", error);
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
    `✅ Version: Gestion formations avec réductions adhérents (v10.0.0)`
  );
});
