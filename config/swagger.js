// swagger.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Novapsy Backend API",
      version: "2.3.0",
      description:
        "API complète pour la plateforme Novapsy - Gestion des adhésions, formations, paiements et services",
      contact: {
        name: "Novapsy Support",
        email: "contact@novapsy.info",
      },
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? "https://your-app.vercel.app"
            : "http://localhost:3000",
        description:
          process.env.NODE_ENV === "production" ? "Production" : "Development",
      },
    ],
    components: {
      schemas: {
        // Schémas de base
        User: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID unique de l'utilisateur" },
            email: {
              type: "string",
              format: "email",
              description: "Email de l'utilisateur",
            },
            name: {
              type: "string",
              description: "Nom complet de l'utilisateur",
            },
          },
        },

        // Schémas de paiement
        PaymentIntent: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID du payment intent Stripe" },
            amount: { type: "number", description: "Montant en centimes" },
            currency: { type: "string", description: "Devise (EUR)" },
            status: {
              type: "string",
              enum: [
                "requires_payment_method",
                "requires_confirmation",
                "requires_action",
                "processing",
                "requires_capture",
                "canceled",
                "succeeded",
              ],
            },
            customer: { type: "string", description: "ID du client Stripe" },
            metadata: {
              type: "object",
              description: "Métadonnées du paiement",
            },
          },
        },

        CheckoutSession: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID de la session Stripe" },
            url: {
              type: "string",
              description: "URL de redirection vers Stripe",
            },
            amount_total: {
              type: "number",
              description: "Montant total en centimes",
            },
            currency: { type: "string", description: "Devise" },
            customer: { type: "string", description: "ID du client Stripe" },
            metadata: {
              type: "object",
              description: "Métadonnées de la session",
            },
          },
        },

        // Schémas d'adhésion
        MembershipStatus: {
          type: "object",
          properties: {
            isMember: {
              type: "boolean",
              description: "Statut d'adhésion actuel",
            },
            membershipType: { type: "string", description: "Type d'adhésion" },
            expirationDate: {
              type: "string",
              format: "date",
              description: "Date d'expiration",
            },
            status: { type: "string", description: "Statut détaillé" },
          },
        },

        // Schémas de formation
        TrainingDetails: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID de la formation" },
            name: { type: "string", description: "Nom court de la formation" },
            full_name: {
              type: "string",
              description: "Nom complet de la formation",
            },
            price: { type: "number", description: "Prix de base" },
            member_price: { type: "number", description: "Prix adhérent" },
            duration: { type: "number", description: "Durée en heures" },
            training_type: { type: "string", description: "Type de formation" },
          },
        },

        // Schémas de contact
        ContactForm: {
          type: "object",
          required: ["name", "email", "subject", "message"],
          properties: {
            name: { type: "string", description: "Nom du contact" },
            email: {
              type: "string",
              format: "email",
              description: "Email du contact",
            },
            subject: { type: "string", description: "Sujet du message" },
            message: { type: "string", description: "Contenu du message" },
            phone: { type: "string", description: "Téléphone (optionnel)" },
            organization: {
              type: "string",
              description: "Organisation (optionnel)",
            },
          },
        },

        // Schémas de prévention
        PreventionRequest: {
          type: "object",
          required: ["theme", "organization", "contact"],
          properties: {
            theme: { type: "string", description: "Thème de prévention" },
            organization: {
              type: "string",
              description: "Organisation demandeuse",
            },
            contact: { type: "string", description: "Contact principal" },
            email: {
              type: "string",
              format: "email",
              description: "Email de contact",
            },
            phone: { type: "string", description: "Téléphone" },
            details: { type: "string", description: "Détails de la demande" },
          },
        },

        // Schémas de santé système
        HealthStatus: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["healthy", "degraded", "unhealthy"],
            },
            timestamp: { type: "string", format: "date-time" },
            version: { type: "string", description: "Version de l'API" },
            uptime: {
              type: "number",
              description: "Temps de fonctionnement en secondes",
            },
            checks: {
              type: "object",
              properties: {
                database: { type: "string", enum: ["ok", "error"] },
                stripe: { type: "string", enum: ["ok", "error"] },
                email: { type: "string", enum: ["ok", "error", "skipped"] },
              },
            },
          },
        },

        // Schémas de réponse
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", description: "Message de succès" },
            data: { type: "object", description: "Données de réponse" },
          },
        },

        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", description: "Message d'erreur" },
            message: { type: "string", description: "Description détaillée" },
            errors: {
              type: "array",
              items: { type: "string" },
              description: "Liste des erreurs de validation",
            },
          },
        },
      },

      securitySchemes: {
        StripeWebhook: {
          type: "apiKey",
          in: "header",
          name: "stripe-signature",
          description: "Signature Stripe pour la vérification des webhooks",
        },
      },
    },

    paths: {
      // === ENDPOINTS DE SANTÉ ===
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Vérification de l'état de santé du système",
          description:
            "Endpoint de monitoring pour vérifier l'état des services (base de données, Stripe, email)",
          parameters: [
            {
              name: "test_email",
              in: "query",
              description: "Inclure un test d'envoi d'email",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            200: {
              description: "Système en bonne santé",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthStatus" },
                },
              },
            },
            206: {
              description: "Système partiellement dégradé",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthStatus" },
                },
              },
            },
            503: {
              description: "Système indisponible",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS DE CONTACT ===
      "/contact": {
        post: {
          tags: ["Contact"],
          summary: "Envoi d'un message de contact",
          description:
            "Traite et envoie un message via le formulaire de contact",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContactForm" },
              },
            },
          },
          responses: {
            200: {
              description: "Message envoyé avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            400: {
              description: "Erreur de validation",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/contact/test": {
        get: {
          tags: ["Contact"],
          summary: "Test de la configuration email",
          description:
            "Teste la configuration email en envoyant un email de test",
          responses: {
            200: {
              description: "Test réussi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            500: {
              description: "Erreur de configuration",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS DE PRÉVENTION ===
      "/api/send-prevention-request": {
        post: {
          tags: ["Prevention"],
          summary: "Envoi d'une demande de prévention",
          description:
            "Traite et envoie une demande d'intervention de prévention",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["to", "subject", "requestData"],
                  properties: {
                    to: {
                      type: "string",
                      format: "email",
                      description: "Email destinataire",
                    },
                    subject: {
                      type: "string",
                      description: "Sujet de la demande",
                    },
                    requestData: {
                      $ref: "#/components/schemas/PreventionRequest",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Demande envoyée avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            400: {
              description: "Données manquantes ou invalides",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/api/test-prevention-request": {
        post: {
          tags: ["Prevention"],
          summary: "Test d'une demande de prévention",
          description:
            "Teste l'envoi d'une demande de prévention avec des données fictives",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["theme"],
                  properties: {
                    theme: {
                      type: "string",
                      description: "Thème de prévention à tester",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Test réussi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            400: {
              description: "Thème manquant",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/api/prevention/stats": {
        get: {
          tags: ["Prevention"],
          summary: "Statistiques des demandes de prévention",
          description: "Récupère les statistiques des demandes de prévention",
          responses: {
            200: {
              description: "Statistiques récupérées",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total_requests: { type: "number" },
                      successful_requests: { type: "number" },
                      failed_requests: { type: "number" },
                      themes: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS D'ADHÉSION ===
      "/create-payment-attestation/{paymentIntentId}": {
        post: {
          tags: ["Membership"],
          summary: "Création d'une attestation de paiement",
          description:
            "Génère une attestation de paiement pour un payment intent réussi",
          parameters: [
            {
              name: "paymentIntentId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID du payment intent Stripe",
            },
          ],
          responses: {
            200: {
              description: "Attestation créée avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      attestation: {
                        type: "object",
                        properties: {
                          payment_intent_id: { type: "string" },
                          amount: { type: "number" },
                          currency: { type: "string" },
                          status: { type: "string" },
                          date_french: { type: "string" },
                          customer_email: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Paiement non réussi ou invalide",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/create-checkout-session": {
        post: {
          tags: ["Membership"],
          summary: "Création d'une session de paiement pour adhésion",
          description:
            "Crée une session Stripe pour le paiement d'une adhésion",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["priceId", "userId", "userType"],
                  properties: {
                    priceId: {
                      type: "string",
                      description: "ID du prix Stripe",
                    },
                    userId: {
                      type: "string",
                      description: "ID de l'utilisateur",
                    },
                    userType: {
                      type: "string",
                      enum: ["individual", "student", "association"],
                      description: "Type d'utilisateur",
                    },
                    associationId: {
                      type: "string",
                      description: "ID de l'association (si applicable)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Session créée avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      sessionId: { type: "string" },
                      url: { type: "string" },
                      amount: { type: "number" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Paramètres manquants ou invalides",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/process-payment-success": {
        post: {
          tags: ["Membership"],
          summary: "Traitement d'un paiement réussi",
          description:
            "Traite un paiement réussi et crée l'adhésion correspondante",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sessionId"],
                  properties: {
                    sessionId: {
                      type: "string",
                      description: "ID de la session Stripe",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Paiement traité avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            400: {
              description: "Session invalide ou déjà traitée",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/membership-status/{userId}/{userType}": {
        get: {
          tags: ["Membership"],
          summary: "Vérification du statut d'adhésion",
          description: "Vérifie le statut d'adhésion d'un utilisateur",
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de l'utilisateur",
            },
            {
              name: "userType",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["individual", "student", "association"],
              },
              description: "Type d'utilisateur",
            },
          ],
          responses: {
            200: {
              description: "Statut récupéré avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MembershipStatus" },
                },
              },
            },
            404: {
              description: "Utilisateur non trouvé",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/receipt/{invoiceId}": {
        get: {
          tags: ["Membership"],
          summary: "Récupération d'un reçu",
          description: "Récupère le reçu d'une facture Stripe",
          parameters: [
            {
              name: "invoiceId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de la facture Stripe",
            },
          ],
          responses: {
            200: {
              description: "Reçu récupéré avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      invoice: { type: "object" },
                      receipt_url: { type: "string" },
                      download_url: { type: "string" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Facture non trouvée",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS DE FORMATION ===
      "/create-training-checkout": {
        post: {
          tags: ["Training"],
          summary: "Création d'une session de paiement pour formation",
          description:
            "Crée une session Stripe pour le paiement d'une formation avec réduction adhérent",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["priceId", "userId", "trainingId"],
                  properties: {
                    priceId: {
                      type: "string",
                      description: "ID du prix de la formation",
                    },
                    userId: {
                      type: "string",
                      description: "ID de l'utilisateur",
                    },
                    trainingId: {
                      type: "string",
                      description: "ID de la formation",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Session créée avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      sessionId: { type: "string" },
                      url: { type: "string" },
                      finalPrice: { type: "number" },
                      isMember: { type: "boolean" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Paramètres manquants ou formation non trouvée",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/check-training-purchase/{userId}/{trainingId}": {
        get: {
          tags: ["Training"],
          summary: "Vérification d'un achat de formation",
          description:
            "Vérifie si un utilisateur a acheté une formation spécifique",
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de l'utilisateur",
            },
            {
              name: "trainingId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de la formation",
            },
          ],
          responses: {
            200: {
              description: "Vérification effectuée",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      hasPurchased: { type: "boolean" },
                      purchaseDate: { type: "string", format: "date-time" },
                      details: { type: "object" },
                    },
                  },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/process-training-purchase": {
        post: {
          tags: ["Training"],
          summary: "Traitement d'un achat de formation",
          description: "Traite un achat de formation réussi",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sessionId"],
                  properties: {
                    sessionId: {
                      type: "string",
                      description: "ID de la session Stripe",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Achat traité avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            400: {
              description: "Session invalide",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/training-details/{priceId}/{userId}": {
        get: {
          tags: ["Training"],
          summary: "Détails d'une formation pour un utilisateur",
          description:
            "Récupère les détails d'une formation avec le prix adapté au statut d'adhérent",
          parameters: [
            {
              name: "priceId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID du prix de la formation",
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de l'utilisateur",
            },
          ],
          responses: {
            200: {
              description: "Détails récupérés avec succès",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/TrainingDetails" },
                      {
                        type: "object",
                        properties: {
                          finalPrice: { type: "number" },
                          isMember: { type: "boolean" },
                          discount: { type: "number" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            404: {
              description: "Formation non trouvée",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS DE PAIEMENT GÉNÉRIQUES ===
      "/webhook": {
        post: {
          tags: ["Payments"],
          summary: "Webhook Stripe",
          description: "Gestionnaire des événements webhook de Stripe",
          security: [{ StripeWebhook: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Événement Stripe webhook",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Webhook traité avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      received: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
            400: {
              description: "Signature invalide",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur de traitement",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/payment-intent/{paymentIntentId}": {
        get: {
          tags: ["Payments"],
          summary: "Récupération d'un payment intent",
          description: "Récupère les détails d'un payment intent Stripe",
          parameters: [
            {
              name: "paymentIntentId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID du payment intent",
            },
          ],
          responses: {
            200: {
              description: "Payment intent récupéré",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentIntent" },
                },
              },
            },
            404: {
              description: "Payment intent non trouvé",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/create-invoice": {
        post: {
          tags: ["Payments"],
          summary: "Création d'une facture",
          description: "Crée une facture Stripe pour un paiement",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["paymentIntentId", "customerId"],
                  properties: {
                    paymentIntentId: {
                      type: "string",
                      description: "ID du payment intent",
                    },
                    customerId: {
                      type: "string",
                      description: "ID du client Stripe",
                    },
                    description: {
                      type: "string",
                      description: "Description de la facture",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Facture créée avec succès",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      invoice: { type: "object" },
                      invoiceId: { type: "string" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Paramètres manquants",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      // === ENDPOINTS UTILITAIRES ===
      "/send-newsletter": {
        post: {
          tags: ["Utilities"],
          summary: "Envoi de newsletter",
          description: "Envoie une newsletter à tous les abonnés",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "html"],
                  properties: {
                    subject: {
                      type: "string",
                      description: "Sujet de la newsletter",
                    },
                    html: {
                      type: "string",
                      description: "Contenu HTML de la newsletter",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Newsletter envoyée avec succès",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessResponse" },
                },
              },
            },
            500: {
              description: "Erreur d'envoi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/user-email/{userId}": {
        get: {
          tags: ["Utilities"],
          summary: "Récupération de l'email d'un utilisateur",
          description:
            "Récupère l'email d'un utilisateur par son ID (endpoint de debug)",
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de l'utilisateur",
            },
          ],
          responses: {
            200: {
              description: "Email récupéré",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      email: { type: "string", format: "email" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Utilisateur non trouvé",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Erreur serveur",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
    },

    tags: [
      {
        name: "Health",
        description: "Endpoints de monitoring et santé du système",
      },
      {
        name: "Contact",
        description: "Gestion des messages de contact",
      },
      {
        name: "Prevention",
        description: "Gestion des demandes d'intervention de prévention",
      },
      {
        name: "Membership",
        description: "Gestion des adhésions et paiements d'adhésion",
      },
      {
        name: "Training",
        description: "Gestion des formations et paiements de formation",
      },
      {
        name: "Payments",
        description: "Gestion générique des paiements et webhooks Stripe",
      },
      {
        name: "Utilities",
        description: "Endpoints utilitaires et de debug",
      },
    ],
  },
  apis: [
    "./memberships/*.js",
    "./trainings/*.js",
    "./payments/*.js",
    "./health/*.js",
    "./contact/*.js",
    "./prevention/*.js",
    "./server.js",
  ],
};

const specs = swaggerJsdoc(options);

module.exports = { specs, swaggerUi };
