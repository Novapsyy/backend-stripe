const { supabase } = require('../config/database');
const { logWithTimestamp } = require('../utils/logger');
const { getPriceFromPriceId } = require('./priceService');
const { updateUserStatusToMembership } = require('./userService');
const { sendMembershipConfirmationEmail } = require('./emailService');
const { getInvoiceFromPayment, createInvoiceForPayment } = require('./stripeService');

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
    // Récupérer l'email de contact de l'association
    const { data: association, error } = await supabase
      .from("associations")
      .select("association_name, contact_email")
      .eq("association_id", associationId)
      .single();

    if (error || !association?.contact_email) {
      logWithTimestamp(
        "warn",
        "Email association non trouvé pour confirmation adhésion",
        { associationId, error: error?.message }
      );
      return false;
    }

    const subject = "Confirmation de l'adhésion de votre association";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Adhésion confirmée pour ${association.association_name}</h2>
        
        <p>Nous sommes ravis de vous confirmer que l'adhésion de votre association a été activée avec succès.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Détails de l'adhésion :</h3>
          <p><strong>Association :</strong> ${association.association_name}</p>
          <p><strong>Prix :</strong> ${membershipData.membership_price}€</p>
          <p><strong>Début :</strong> ${new Date(
            membershipData.membership_start
          ).toLocaleDateString("fr-FR")}</p>
          <p><strong>Fin :</strong> ${new Date(
            membershipData.membership_end
          ).toLocaleDateString("fr-FR")}</p>
        </div>
        
        <p>Votre association peut maintenant profiter de tous les avantages de l'adhésion.</p>
        <p><strong>Important :</strong> L'adhésion est valable exactement un an. Vous recevrez des notifications avant expiration pour renouveler si vous le souhaitez.</p>
        
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        
        <p>Cordialement,<br>L'équipe Novapsy</p>
      </div>
    `;

    const { sendEmail } = require('./emailService');
    return await sendEmail(association.contact_email, subject, html);
  } catch (error) {
    logWithTimestamp("error", "Erreur envoi email confirmation adhésion association", {
      associationId,
      error: error.message,
    });
    return false;
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
  createMembership,
  sendAssociationMembershipConfirmationEmail
};