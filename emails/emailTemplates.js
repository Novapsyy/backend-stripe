/**
 * Détermine les couleurs selon le thème de prévention
 * @param {string} categoryName - Nom de la catégorie
 * @returns {object} Couleurs du thème
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
 * Génère le HTML pour l'email de contact
 * @param {object} contactData - Données du contact
 * @returns {string} HTML de l'email
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
 * Génère l'email de confirmation pour l'utilisateur
 * @param {string} userName - Nom de l'utilisateur
 * @param {string} userMessage - Message de l'utilisateur (extrait)
 * @returns {string} HTML de l'email de confirmation
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
 * @param {object} requestData - Données de la demande
 * @returns {string} HTML de l'email
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
    userEmail,
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

          ${
            userEmail
              ? `
          <!-- Contact User Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:${userEmail}?subject=Réponse à votre demande de prévention - ${category.nom}&body=Bonjour,%0D%0A%0D%0ANous avons bien reçu votre demande de prévention concernant "${category.nom}".%0D%0A%0D%0ANous vous recontactons pour finaliser les modalités de votre formation.%0D%0A%0D%0ACordialement,%0D%0AL'équipe Novapsy" 
               style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; border-radius: 8px; font-weight: 600; font-size: 16px; text-decoration: none; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              📧 Contacter l'utilisateur.rice
            </a>
          </div>
          `
              : ""
          }

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

/**
 * Génère le HTML pour l'email de confirmation d'adhésion
 * @param {object} membershipData - Données de l'adhésion
 * @returns {string} HTML de l'email
 */
function generateMembershipConfirmationHTML(membershipData) {
  return `
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
}

/**
 * Génère le HTML pour l'email de confirmation d'adhésion association
 * @param {object} association - Données de l'association
 * @param {object} membershipData - Données de l'adhésion
 * @returns {string} HTML de l'email
 */
function generateAssociationMembershipConfirmationHTML(
  association,
  membershipData
) {
  return `
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
}

/**
 * Génère le HTML pour l'email de confirmation d'achat de formation
 * @param {object} purchaseData - Données de l'achat
 * @param {object} trainingDetails - Détails de la formation
 * @returns {string} HTML de l'email
 */
function generateTrainingPurchaseConfirmationHTML(
  purchaseData,
  trainingDetails
) {
  return `
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
}

/**
 * Génère le HTML pour l'email de remboursement de formation
 * @param {object} refundData - Données du remboursement
 * @returns {string} HTML de l'email
 */
function generateTrainingRefundHTML(refundData) {
  const {
    purchase,
    refundAmount,
    refundPercent,
    daysUntil,
    sessionFirstDay,
    trainingDetails,
  } = refundData;

  const isFullRefund = refundPercent === 100;
  const isPartialRefund = refundPercent > 0 && refundPercent < 100;
  const isNoRefund = refundPercent === 0;

  const headerColor = isFullRefund ? "#10b981" : isPartialRefund ? "#f59e0b" : "#ef4444";
  const statusLabel = isFullRefund
    ? "Remboursement intégral"
    : isPartialRefund
    ? `Remboursement partiel (${refundPercent}%)`
    : "Aucun remboursement";

  const sessionDateStr = sessionFirstDay
    ? new Date(sessionFirstDay).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Non renseignée";

  const refundDelayMessage = daysUntil !== null
    ? `L'annulation a été effectuée <strong>${daysUntil} jour${daysUntil > 1 ? "s" : ""}</strong> avant le début de la session.`
    : "Date de session non renseignée au moment de l'annulation.";

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Annulation de formation - Novapsy</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">

        <div style="background: ${headerColor}; padding: 32px 40px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Annulation de formation</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 15px;">${statusLabel}</p>
        </div>

        <div style="padding: 32px 40px;">
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Votre formation <strong>${trainingDetails.full_name || trainingDetails.name}</strong> a bien été annulée.
          </p>

          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin: 0 0 16px; color: #111827; font-size: 16px;">Récapitulatif</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Formation</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${trainingDetails.full_name || trainingDetails.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date d'achat</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">${new Date(purchase.purchase_date).toLocaleDateString("fr-FR")}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date de session</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">${sessionDateStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Montant payé</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; text-align: right;">${purchase.purchase_amount}€</td>
              </tr>
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 12px 0 6px; color: #111827; font-size: 15px; font-weight: 600;">Remboursement</td>
                <td style="padding: 12px 0 6px; color: ${headerColor}; font-size: 15px; text-align: right; font-weight: 700;">${refundAmount}€ (${refundPercent}%)</td>
              </tr>
            </table>
          </div>

          <div style="background-color: ${isNoRefund ? "#fef2f2" : "#f0fdf4"}; border-left: 4px solid ${headerColor}; padding: 14px 18px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
              ${refundDelayMessage}
              ${isNoRefund
                ? "<br>Conformément à nos conditions, aucun remboursement n'est possible à moins de 16 jours du début de la session."
                : isPartialRefund
                ? "<br>Conformément à nos conditions, un remboursement partiel de 80% est appliqué entre 16 et 30 jours avant la session."
                : "<br>Votre remboursement intégral sera crédité sur votre moyen de paiement d'origine sous 5 à 10 jours ouvrés."}
            </p>
          </div>

          ${!isNoRefund ? `
          <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
            Le remboursement de <strong>${refundAmount}€</strong> sera crédité sur votre moyen de paiement d'origine sous 5 à 10 jours ouvrés.
          </p>
          ` : ""}

          <p style="color: #374151; font-size: 14px; line-height: 1.6; margin-top: 24px;">
            Pour toute question, n'hésitez pas à nous contacter.
          </p>

          <p style="color: #374151; font-size: 14px; margin-top: 24px;">
            Cordialement,<br>
            <strong>L'équipe Novapsy</strong>
          </p>
        </div>

        <div style="background-color: #f3f4f6; padding: 20px 40px; text-align: center;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} Novapsy — Tous droits réservés</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  getPreventionThemeColors,
  generateContactEmailHTML,
  generateConfirmationEmailHTML,
  generatePreventionRequestEmailHTML,
  generateMembershipConfirmationHTML,
  generateAssociationMembershipConfirmationHTML,
  generateTrainingPurchaseConfirmationHTML,
  generateTrainingRefundHTML,
};
