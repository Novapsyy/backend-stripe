const express = require("express");
const router = express.Router();

const { supabase } = require("../config/database");
const { stripe } = require("../config/stripe");
const { FRONTEND_URL } = require("../config/constants");
const { logWithTimestamp } = require("../shared/logger");
const { getMailByUser } = require("../shared/userUtils");
const {
  createMembership,
  getInvoiceFromPayment,
  createInvoiceForPayment,
  getReceiptFromPaymentIntent,
} = require("./membershipService");

/**
 * POST /create-payment-attestation/:paymentIntentId
 * Crée une attestation de paiement pour un payment_intent sans reçu
 */
router.post(
  "/create-payment-attestation/:paymentIntentId",
  async (req, res) => {
    const { paymentIntentId } = req.params;

    logWithTimestamp("info", "=== CRÉATION ATTESTATION DE PAIEMENT ===", {
      paymentIntentId,
    });

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {
          expand: ["customer", "latest_charge", "charges.data"],
        }
      );

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({
          error: "Ce paiement n'est pas réussi",
          status: paymentIntent.status,
        });
      }

      // Créer les données d'attestation
      const attestationData = {
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: "PAYÉ",
        created: paymentIntent.created,
        date_french: new Date(paymentIntent.created * 1000).toLocaleDateString(
          "fr-FR",
          {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }
        ),
        time_french: new Date(paymentIntent.created * 1000).toLocaleTimeString(
          "fr-FR"
        ),
      };

      // Ajouter les informations du customer si disponible
      if (paymentIntent.customer) {
        try {
          const customer =
            typeof paymentIntent.customer === "string"
              ? await stripe.customers.retrieve(paymentIntent.customer)
              : paymentIntent.customer;

          attestationData.customer_email = customer.email;
          attestationData.customer_name = customer.name;
        } catch (customerError) {
          logWithTimestamp(
            "warn",
            "Impossible de récupérer les infos customer",
            customerError
          );
        }
      }

      // Ajouter les informations de charge si disponible
      if (paymentIntent.latest_charge) {
        const charge =
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.charges.data.find(
                (c) => c.id === paymentIntent.latest_charge
              )
            : paymentIntent.latest_charge;

        if (charge) {
          attestationData.charge_id = charge.id;
          attestationData.payment_method =
            charge.payment_method_details?.type || "carte bancaire";
          attestationData.last4 = charge.payment_method_details?.card?.last4;
          attestationData.brand = charge.payment_method_details?.card?.brand;
        }
      }

      logWithTimestamp("info", "Attestation de paiement créée", {
        paymentIntentId,
        amount: attestationData.amount,
        currency: attestationData.currency,
      });

      res.json({
        success: true,
        attestation: attestationData,
        message: "Attestation de paiement générée avec succès",
      });
    } catch (error) {
      logWithTimestamp("error", "Erreur création attestation de paiement", {
        paymentIntentId,
        error: error.message,
      });

      res.status(500).json({
        error: error.message,
        suggestion: "Vérifiez que l'ID du paiement est correct",
      });
    }
  }
);

/**
 * POST /create-checkout-session
 * Crée une session de paiement Stripe pour un forfait d'adhésion d'un an
 * Body: { priceId, userId, associationId, userType, statusId, successUrl?, cancelUrl? }
 */
router.post("/create-checkout-session", async (req, res) => {
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
        statusId: statusId ? String(statusId) : "",
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
 * POST /process-payment-success
 * Traite le succès d'un paiement de forfait d'adhésion
 * Body: { sessionId }
 */
router.post("/process-payment-success", async (req, res) => {
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
router.get("/membership-status/:userId/:userType", async (req, res) => {
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

/**
 * GET /receipt/:invoiceId
 * Récupère le reçu PDF d'une adhésion (facture Stripe ou payment_intent)
 * Params: invoiceId (ID de la facture Stripe ou payment_intent)
 */
router.get("/receipt/:invoiceId", async (req, res) => {
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

    // 2. Essayer de récupérer comme un payment_intent et créer une vraie facture Stripe
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoiceId, {
        expand: [
          "charges.data",
          "latest_charge",
          "latest_charge.balance_transaction",
          "customer",
        ],
      });

      logWithTimestamp("info", "Payment Intent récupéré", {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        status: paymentIntent.status,
        customer: paymentIntent.customer,
        charges_count: paymentIntent.charges?.data?.length || 0,
      });

      // Chercher d'abord un reçu dans les charges
      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        for (const charge of paymentIntent.charges.data) {
          if (charge.receipt_url) {
            logWithTimestamp("info", "Receipt URL trouvé dans la charge", {
              chargeId: charge.id,
              receiptUrl: charge.receipt_url,
            });
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

      // Si pas de reçu mais on a un customer, créer une vraie facture Stripe
      if (paymentIntent.customer && paymentIntent.status === "succeeded") {
        logWithTimestamp("info", "Création facture Stripe rétroactive", {
          customerId: paymentIntent.customer, // JE PASSE JUSTE L'ID, PAS L'OBJET COMPLET
          paymentIntentId: paymentIntent.id,
        });

        try {
          // CORRECTION : utiliser l'ID du customer, pas l'objet complet
          const customerId =
            typeof paymentIntent.customer === "string"
              ? paymentIntent.customer
              : paymentIntent.customer.id;

          // Créer une facture
          const invoice = await stripe.invoices.create({
            customer: customerId, // ✅ PASSER L'ID, PAS L'OBJET
            collection_method: "charge_automatically",
            auto_advance: false,
            metadata: {
              payment_intent_id: paymentIntent.id,
              retroactive_invoice: "true",
              membership_receipt: "true",
            },
            description: "Adhésion Novapsy",
          });

          // Ajouter un item à la facture
          await stripe.invoiceItems.create({
            customer: customerId, // ✅ PASSER L'ID, PAS L'OBJET
            invoice: invoice.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            description: `Adhésion Novapsy - Référence: ${paymentIntent.id}`,
            metadata: {
              payment_intent_id: paymentIntent.id,
              service_type: "membership",
            },
          });

          // Finaliser et marquer comme payée
          const finalizedInvoice = await stripe.invoices.finalizeInvoice(
            invoice.id
          );
          const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
            paid_out_of_band: true,
          });

          logWithTimestamp(
            "info",
            "✅ Facture Stripe rétroactive créée avec succès",
            {
              invoiceId: paidInvoice.id,
              hostedInvoiceUrl: paidInvoice.hosted_invoice_url,
              invoicePdf: paidInvoice.invoice_pdf,
            }
          );

          // Retourner la vraie facture Stripe
          return res.json({
            id: paidInvoice.id,
            invoice_number: paidInvoice.number,
            amount: paidInvoice.amount_paid / 100,
            currency: paidInvoice.currency,
            status: paidInvoice.status,
            created: paidInvoice.created,
            description: `Facture Stripe ${paidInvoice.number}`,
            receipt_url: paidInvoice.hosted_invoice_url,
            receipt_type: "stripe_hosted_invoice",
            invoice_pdf: paidInvoice.invoice_pdf,
            payment_intent_id: paymentIntent.id,
          });
        } catch (invoiceError) {
          logWithTimestamp(
            "error",
            "❌ Impossible de créer facture Stripe rétroactive",
            {
              error: invoiceError.message,
              code: invoiceError.code,
              paymentIntentId: paymentIntent.id,
            }
          );
          // Continuer vers la solution suivante...
        }
      }

      // Si pas de customer, essayer de créer un customer puis une facture
      if (!paymentIntent.customer && paymentIntent.status === "succeeded") {
        logWithTimestamp(
          "info",
          "Tentative création customer + facture rétroactive",
          {
            paymentIntentId: paymentIntent.id,
          }
        );

        try {
          // Récupérer l'email depuis la charge si disponible
          let customerEmail = null;
          if (paymentIntent.charges?.data?.length > 0) {
            const charge = paymentIntent.charges.data[0];
            if (charge.billing_details?.email) {
              customerEmail = charge.billing_details.email;
            }
          }

          if (customerEmail) {
            // Créer un customer
            const customer = await stripe.customers.create({
              email: customerEmail,
              metadata: {
                created_for_retroactive_invoice: "true",
                payment_intent_id: paymentIntent.id,
              },
              description: `Customer créé rétroactivement pour ${paymentIntent.id}`,
            });

            logWithTimestamp("info", "Customer créé rétroactivement", {
              customerId: customer.id,
              email: customerEmail,
            });

            // Maintenant créer la facture avec ce customer
            const invoice = await stripe.invoices.create({
              customer: customer.id, // ✅ UTILISER L'ID, PAS L'OBJET
              collection_method: "charge_automatically",
              auto_advance: false,
              metadata: {
                payment_intent_id: paymentIntent.id,
                retroactive_invoice: "true",
                customer_created_retroactively: "true",
              },
              description: "Adhésion Novapsy",
            });

            await stripe.invoiceItems.create({
              customer: customer.id, // ✅ UTILISER L'ID, PAS L'OBJET
              invoice: invoice.id,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
              description: `Adhésion Novapsy - Référence: ${paymentIntent.id}`,
            });

            const finalizedInvoice = await stripe.invoices.finalizeInvoice(
              invoice.id
            );
            const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
              paid_out_of_band: true,
            });

            logWithTimestamp("info", "✅ Facture créée avec nouveau customer", {
              invoiceId: paidInvoice.id,
              customerId: customer.id,
            });

            return res.json({
              id: paidInvoice.id,
              invoice_number: paidInvoice.number,
              amount: paidInvoice.amount_paid / 100,
              currency: paidInvoice.currency,
              status: paidInvoice.status,
              created: paidInvoice.created,
              description: `Facture Stripe ${paidInvoice.number}`,
              receipt_url: paidInvoice.hosted_invoice_url,
              receipt_type: "stripe_hosted_invoice_new_customer",
              invoice_pdf: paidInvoice.invoice_pdf,
              payment_intent_id: paymentIntent.id,
            });
          }
        } catch (customerError) {
          logWithTimestamp(
            "error",
            "❌ Impossible de créer customer rétroactif",
            {
              error: customerError.message,
              paymentIntentId: paymentIntent.id,
            }
          );
        }
      }

      // Dernière option : demander à Stripe de renvoyer un email de reçu
      if (paymentIntent.latest_charge) {
        logWithTimestamp("info", "Tentative renvoi email de reçu Stripe", {
          chargeId: paymentIntent.latest_charge,
        });

        try {
          // Récupérer la charge pour l'email
          const charge =
            typeof paymentIntent.latest_charge === "string"
              ? await stripe.charges.retrieve(paymentIntent.latest_charge)
              : paymentIntent.latest_charge;

          if (charge && charge.billing_details?.email) {
            // ✅ CORRECTION : Utiliser l'ID de la charge, pas l'objet complet
            const chargeId = typeof charge === "string" ? charge : charge.id;

            // Essayer de renvoyer un email de reçu
            await stripe.charges.update(chargeId, {
              receipt_email: charge.billing_details.email,
            });

            logWithTimestamp("info", "Email de reçu Stripe envoyé", {
              chargeId: chargeId,
              email: charge.billing_details.email,
            });

            return res.json({
              id: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              status: paymentIntent.status,
              created: paymentIntent.created,
              description: `Paiement ${paymentIntent.id}`,
              receipt_type: "stripe_receipt_email_sent",
              message: `Un email de reçu Stripe a été envoyé à ${charge.billing_details.email}`,
              email_sent_to: charge.billing_details.email,
              charge_id: chargeId,
            });
          }
        } catch (emailError) {
          logWithTimestamp(
            "warn",
            "Impossible d'envoyer email de reçu Stripe",
            {
              error: emailError.message,
            }
          );
        }
      }

      // Si tout échoue, retourner les infos de paiement avec suggestion
      return res.status(404).json({
        error: "Aucune facture Stripe disponible pour ce paiement",
        payment_intent_id: paymentIntent.id,
        suggestion:
          "Utilisez les boutons 'Fix' pour associer une session et générer une facture Stripe",
        payment_info: {
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          created: new Date(paymentIntent.created * 1000).toISOString(),
        },
        possible_actions: [
          "Cliquez sur 'Find Session' pour retrouver la session de paiement",
          "Cliquez sur 'Auto Fix' pour générer une facture Stripe automatiquement",
          "Contactez le support si le problème persiste",
        ],
      });
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
router.post("/fix-invoice-id/:membershipId", async (req, res) => {
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

/**
 * POST /create-customer-for-membership/:membershipId
 * Crée un customer Stripe rétroactivement pour une adhésion
 */
router.post(
  "/create-customer-for-membership/:membershipId",
  async (req, res) => {
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
  }
);

/**
 * POST /find-session/:membershipId
 * Recherche la session Stripe associée à une adhésion
 * Params: membershipId
 */
router.post("/find-session/:membershipId", async (req, res) => {
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
router.post("/refresh-invoice/:membershipId", async (req, res) => {
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

/**
 * GET /debug/association-membership/:associationId
 * Debug des adhésions d'une association
 */
router.get("/debug/association-membership/:associationId", async (req, res) => {
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
router.get(
  "/verify-association-membership/:associationId",
  async (req, res) => {
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
  }
);

module.exports = router;
