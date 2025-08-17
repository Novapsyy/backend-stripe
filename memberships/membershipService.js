const { supabase } = require("../config/database");
const { stripe } = require("../config/stripe");
const { logWithTimestamp } = require("../shared/logger");
const { getPriceFromPriceId } = require("../shared/pricing");
const {
  sendMembershipConfirmationEmail,
  sendAssociationMembershipConfirmationEmail,
} = require("../emails/membershipEmails");

/**
 * Vérifie si un utilisateur est adhérent actif
 * @param {string} userId - UUID de l'utilisateur
 * @returns {Promise<boolean>} True si l'utilisateur est adhérent
 */
async function checkIfUserIsMember(userId) {
  try {
    logWithTimestamp("info", "Vérification statut adhérent", { userId });

    // Status ID qui correspondent à un membre : 2, 3, ou 4
    const memberStatusIds = [2, 3, 4];

    const { data: userStatuses, error } = await supabase
      .from("users_status")
      .select("status_id")
      .eq("user_id", userId)
      .in("status_id", memberStatusIds); // Filtre seulement les status de membre

    if (error) {
      logWithTimestamp("error", "Erreur vérification statut adhérent", error);
      return false;
    }

    // Si l'utilisateur a au moins un status de membre (2, 3, ou 4)
    const isActiveMember = userStatuses && userStatuses.length > 0;

    logWithTimestamp("info", "👤 Statut adhérent vérifié", {
      userId,
      isMember: isActiveMember,
      memberStatusesFound: userStatuses?.map((s) => s.status_id) || [],
      allMemberStatuses: memberStatusIds,
    });

    return isActiveMember;
  } catch (error) {
    logWithTimestamp("error", "Exception vérification statut adhérent", error);
    return false;
  }
}

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

module.exports = {
  checkIfUserIsMember,
  updateUserStatusToMembership,
  createInvoiceForPayment,
  getInvoiceFromPayment,
  getReceiptFromPaymentIntent,
  createMembership,
};
