// shared/validation.js
const { z } = require("zod");
const schemas = require("./schemas");

/**
 * Middleware de validation Zod
 * @param {Object} schema - Objet contenant les schémas à valider
 * @param {z.ZodSchema} schema.body - Schéma pour le body de la requête
 * @param {z.ZodSchema} schema.params - Schéma pour les paramètres de la requête
 * @param {z.ZodSchema} schema.query - Schéma pour les query parameters
 * @returns {Function} Middleware Express
 */
function validateRequest(schema = {}) {
  return (req, res, next) => {
    try {
      // Validation du body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validation des paramètres
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      // Validation des query parameters
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => {
          const field = err.path.join(".");
          let message = err.message;

          // Messages d'erreur personnalisés en français
          switch (err.code) {
            case "invalid_type":
              message = `Le champ '${field}' doit être de type ${err.expected}`;
              break;
            case "too_small":
              if (err.type === "string") {
                message = `Le champ '${field}' doit contenir au moins ${err.minimum} caractères`;
              } else {
                message = `Le champ '${field}' doit être supérieur ou égal à ${err.minimum}`;
              }
              break;
            case "too_big":
              if (err.type === "string") {
                message = `Le champ '${field}' ne peut pas dépasser ${err.maximum} caractères`;
              } else {
                message = `Le champ '${field}' doit être inférieur ou égal à ${err.maximum}`;
              }
              break;
            case "invalid_string":
              if (err.validation === "email") {
                message = `Le champ '${field}' doit être une adresse email valide`;
              } else if (err.validation === "url") {
                message = `Le champ '${field}' doit être une URL valide`;
              } else if (err.validation === "uuid") {
                message = `Le champ '${field}' doit être un UUID valide`;
              }
              break;
            case "invalid_enum_value":
              message = `Le champ '${field}' doit être l'une des valeurs suivantes: ${err.options.join(", ")}`;
              break;
            case "unrecognized_keys":
              message = `Champs non autorisés: ${err.keys.join(", ")}`;
              break;
            default:
              message = `Erreur de validation pour le champ '${field}': ${err.message}`;
          }

          return {
            field,
            message,
            code: err.code,
            received: err.received,
          };
        });

        return res.status(400).json({
          success: false,
          message: "Données de requête invalides",
          errors: formattedErrors,
          timestamp: new Date().toISOString(),
        });
      }

      // Erreur inattendue
      console.error("Erreur de validation inattendue:", error);
      return res.status(500).json({
        success: false,
        message: "Erreur interne du serveur",
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Middleware de validation des réponses
 * @param {z.ZodSchema} schema - Schéma Zod pour valider la réponse
 * @returns {Function} Middleware Express
 */
function validateResponse(schema) {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      try {
        const validatedData = schema.parse(data);
        return originalJson.call(this, validatedData);
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error("Erreur de validation de réponse:", {
            url: req.originalUrl,
            method: req.method,
            error: error.message,
            timestamp: new Date().toISOString(),
          });

          return originalJson.call(this, {
            success: false,
            message: "Erreur de format de réponse du serveur",
            timestamp: new Date().toISOString(),
          });
        }
        return originalJson.call(this, data);
      }
    };

    next();
  };
}

/**
 * Validation manuelle d'un objet avec un schéma
 * @param {any} data - Données à valider
 * @param {z.ZodSchema} schema - Schéma de validation
 * @returns {Object} Résultat de la validation
 */
function validateData(data, schema) {
  try {
    const validatedData = schema.parse(data);
    return {
      success: true,
      data: validatedData,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((err) => {
        const field = err.path.join(".");
        let message = err.message;

        // Messages d'erreur personnalisés en français
        switch (err.code) {
          case "invalid_type":
            message = `Le champ '${field}' doit être de type ${err.expected}`;
            break;
          case "too_small":
            if (err.type === "string") {
              message = `Le champ '${field}' doit contenir au moins ${err.minimum} caractères`;
            } else {
              message = `Le champ '${field}' doit être supérieur ou égal à ${err.minimum}`;
            }
            break;
          case "too_big":
            if (err.type === "string") {
              message = `Le champ '${field}' ne peut pas dépasser ${err.maximum} caractères`;
            } else {
              message = `Le champ '${field}' doit être inférieur ou égal à ${err.maximum}`;
            }
            break;
          case "invalid_string":
            if (err.validation === "email") {
              message = `Le champ '${field}' doit être une adresse email valide`;
            } else if (err.validation === "url") {
              message = `Le champ '${field}' doit être une URL valide`;
            } else if (err.validation === "uuid") {
              message = `Le champ '${field}' doit être un UUID valide`;
            }
            break;
          case "invalid_enum_value":
            message = `Le champ '${field}' doit être l'une des valeurs suivantes: ${err.options.join(", ")}`;
            break;
          case "unrecognized_keys":
            message = `Champs non autorisés: ${err.keys.join(", ")}`;
            break;
          default:
            message = `Erreur de validation pour le champ '${field}': ${err.message}`;
        }

        return {
          field,
          message,
          code: err.code,
          received: err.received,
        };
      });

      return {
        success: false,
        message: "Données invalides",
        errors: formattedErrors,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: false,
      message: "Erreur de validation inattendue",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Schémas de validation prêts à l'emploi pour les routes communes
 */
const validationSchemas = {
  // Paramètres communs
  userId: {
    params: z.object({
      userId: schemas.uuidSchema,
    }),
  },

  paymentIntentId: {
    params: z.object({
      paymentIntentId: schemas.paymentIntentIdSchema,
    }),
  },

  invoiceId: {
    params: z.object({
      invoiceId: schemas.invoiceIdSchema,
    }),
  },

  // Routes membership
  membershipCheckout: {
    body: schemas.createMembershipCheckoutSchema,
  },

  membershipStatus: {
    params: z.object({
      userId: schemas.uuidSchema,
      userType: z.enum(["user", "association"]),
    }),
  },

  // Routes training
  trainingCheckout: {
    body: schemas.createTrainingCheckoutSchema,
  },

  trainingPurchaseCheck: {
    params: z.object({
      userId: schemas.uuidSchema,
      trainingId: schemas.uuidSchema,
    }),
  },

  trainingDetails: {
    params: z.object({
      priceId: schemas.priceIdSchema,
      userId: schemas.uuidSchema,
    }),
  },

  // Routes contact
  contactForm: {
    body: schemas.contactFormSchema,
  },

  // Routes prevention
  preventionRequest: {
    body: schemas.preventionRequestDataSchema,
  },

  preventionTest: {
    body: schemas.testPreventionRequestSchema,
  },

  // Routes payment
  checkoutSession: {
    body: schemas.createCheckoutSessionSchema,
  },

  paymentSuccess: {
    body: schemas.processMembershipPaymentSuccessSchema,
  },

  paymentFailure: {
    body: z.object({
      sessionId: schemas.sessionIdSchema,
      error: z.string(),
    }),
  },

  // Newsletter
  newsletter: {
    body: schemas.sendNewsletterSchema,
  },

  // Webhook
  stripeWebhook: {
    body: schemas.stripeWebhookEventSchema,
  },
};

module.exports = {
  validateRequest,
  validateResponse,
  validateData,
  validationSchemas,
  schemas,
};
