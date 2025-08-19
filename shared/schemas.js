// shared/schemas.js
// Schémas Zod pour la validation des données dans l'API Novapsy

const { z } = require("zod");

// ===== SCHÉMAS DE BASE =====

// Schéma pour les UUIDs
const uuidSchema = z.string().uuid("UUID invalide");

// Schéma pour les emails
const emailSchema = z.string().email("Email invalide");

// Schéma pour les montants (en centimes)
const amountSchema = z.number().int().positive("Le montant doit être positif");

// Schéma pour les prix Stripe
const priceIdSchema = z
  .string()
  .startsWith("price_", "ID de prix Stripe invalide");

// Schéma pour les sessions Stripe
const sessionIdSchema = z
  .string()
  .startsWith("cs_", "ID de session Stripe invalide");

// Schéma pour les payment intents Stripe
const paymentIntentIdSchema = z
  .string()
  .startsWith("pi_", "ID de payment intent Stripe invalide");

// Schéma pour les customers Stripe
const customerIdSchema = z
  .string()
  .startsWith("cus_", "ID de customer Stripe invalide");

// Schéma pour les invoices Stripe
const invoiceIdSchema = z
  .string()
  .startsWith("in_", "ID de facture Stripe invalide");

// ===== SCHÉMAS MEMBERSHIP =====

// Schéma pour la création d'une session de checkout membership
const createMembershipCheckoutSchema = z.object({
  priceId: priceIdSchema,
  userId: uuidSchema,
  userType: z.enum(
    ["user", "association"],
    "Type d'utilisateur invalide"
  ),
  associationId: uuidSchema.optional(),
  associationName: z.string().min(1, "Nom d'association requis").optional(),
});

// Schéma pour le traitement du succès de paiement membership
const processMembershipPaymentSuccessSchema = z.object({
  sessionId: sessionIdSchema,
});

// Schéma pour les métadonnées de membership
const membershipMetadataSchema = z.object({
  userId: uuidSchema,
  userType: z.enum(["user", "association"]),
  priceId: priceIdSchema,
  associationId: uuidSchema.optional(),
  associationName: z.string().optional(),
  type: z.literal("membership"),
});

// Schéma pour les données de membership
const membershipDataSchema = z.object({
  user_id: uuidSchema,
  membership_type: z.enum(["user", "association"]),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  payment_amount: z.number().positive(),
  payment_status: z.enum(["pending", "paid", "failed"]),
  stripe_session_id: sessionIdSchema,
  stripe_customer_id: customerIdSchema.optional(),
  association_id: uuidSchema.optional(),
  association_name: z.string().optional(),
});

// ===== SCHÉMAS TRAINING =====

// Schéma pour la création d'une session de checkout training
const createTrainingCheckoutSchema = z.object({
  priceId: priceIdSchema,
  userId: uuidSchema,
  trainingId: uuidSchema,
});

// Schéma pour le traitement d'achat de formation
const processTrainingPurchaseSchema = z.object({
  sessionId: sessionIdSchema,
});

// Schéma pour les métadonnées de training
const trainingMetadataSchema = z.object({
  userId: uuidSchema,
  trainingId: uuidSchema,
  priceId: priceIdSchema,
  originalPrice: z.string().regex(/^\d+(\.\d{2})?$/, "Prix original invalide"),
  discountedPrice: z.string().regex(/^\d+(\.\d{2})?$/, "Prix réduit invalide"),
  isMember: z.enum(["true", "false"]),
  type: z.literal("training"),
});

// Schéma pour les données d'achat de formation
const trainingPurchaseDataSchema = z.object({
  user_id: uuidSchema,
  training_id: uuidSchema,
  purchase_date: z.string().datetime(),
  purchase_amount: z.number().positive(),
  original_price: z.number().positive(),
  member_discount: z.number().min(0),
  payment_status: z.enum(["pending", "paid", "failed"]),
  stripe_session_id: sessionIdSchema,
  hours_purchased: z.number().positive(),
  hours_consumed: z.number().min(0),
});

// ===== SCHÉMAS PAYMENT =====

// Schéma pour la création d'une session de checkout générique
const createCheckoutSessionSchema = z.object({
  priceId: priceIdSchema,
  userId: uuidSchema,
  userEmail: emailSchema,
  type: z.enum(
    ["membership", "training", "prevention"],
    "Type de paiement invalide"
  ),
  metadata: z.record(z.string()).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// Schéma pour la création d'une facture
const createInvoiceSchema = z.object({
  paymentIntentId: paymentIntentIdSchema,
  customerId: customerIdSchema,
  metadata: z.record(z.string()).optional(),
});

// Schéma pour les données d'attestation de paiement
const paymentAttestationSchema = z.object({
  payment_intent_id: paymentIntentIdSchema,
  amount: z.number().positive(),
  currency: z.string().length(3),
  status: z.literal("PAYÉ"),
  created: z.number().int().positive(),
  date_french: z.string(),
  time_french: z.string(),
  customer_email: emailSchema.optional(),
  customer_name: z.string().optional(),
  charge_id: z.string().optional(),
  payment_method: z.string().optional(),
  last4: z.string().length(4).optional(),
  brand: z.string().optional(),
});

// ===== SCHÉMAS CONTACT =====

// Schéma pour le formulaire de contact
const contactFormSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100, "Nom trop long"),
  email: emailSchema,
  subject: z.string().min(1, "Le sujet est requis").max(200, "Sujet trop long"),
  message: z
    .string()
    .min(10, "Le message doit contenir au moins 10 caractères")
    .max(2000, "Message trop long"),
  phone: z.string().optional(),
  company: z.string().optional(),
});

// Schéma pour la validation du formulaire de contact
const contactFormValidationSchema = z.object({
  name: z.object({
    isValid: z.boolean(),
    error: z.string().optional(),
  }),
  email: z.object({
    isValid: z.boolean(),
    error: z.string().optional(),
  }),
  subject: z.object({
    isValid: z.boolean(),
    error: z.string().optional(),
  }),
  message: z.object({
    isValid: z.boolean(),
    error: z.string().optional(),
  }),
});

// ===== SCHÉMAS PREVENTION =====

// Schéma pour les données de demande de prévention
const preventionRequestDataSchema = z.object({
  organizationName: z.string().min(1, "Nom de l'organisation requis"),
  contactPerson: z.string().min(1, "Personne de contact requise"),
  email: emailSchema,
  phone: z.string().optional(),
  organizationType: z.string().min(1, "Type d'organisation requis"),
  targetAudience: z.string().min(1, "Public cible requis"),
  expectedParticipants: z
    .number()
    .int()
    .positive("Nombre de participants invalide"),
  preferredDates: z.string().min(1, "Dates préférées requises"),
  specificNeeds: z.string().optional(),
  budget: z.string().optional(),
  additionalInfo: z.string().optional(),
});

// Schéma pour l'envoi d'une demande de prévention
const sendPreventionRequestSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1, "Sujet requis"),
  requestData: preventionRequestDataSchema,
});

// Schéma pour le test d'une demande de prévention
const testPreventionRequestSchema = z.object({
  theme: z.string().min(1, "Thème requis").max(100, "Thème trop long"),
});

// ===== SCHÉMAS HEALTH =====

// Schéma pour le health check
const healthCheckSchema = z.object({
  testEmail: z.boolean().optional(),
});

// ===== SCHÉMAS NEWSLETTER =====

// Schéma pour l'envoi de newsletter
const sendNewsletterSchema = z.object({
  subject: z.string().min(1, "Sujet requis"),
  content: z.string().min(1, "Contenu requis"),
  recipients: z.array(emailSchema).min(1, "Au moins un destinataire requis"),
});

// ===== SCHÉMAS WEBHOOK =====

// Schéma pour les événements webhook Stripe
const stripeWebhookEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "checkout.session.completed",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ]),
  data: z.object({
    object: z.record(z.any()),
  }),
  created: z.number(),
});

// ===== SCHÉMAS DE PARAMÈTRES DE ROUTE =====

// Paramètres pour les routes avec userId
const userIdParamsSchema = z.object({
  userId: uuidSchema,
});

// Paramètres pour les routes avec paymentIntentId
const paymentIntentParamsSchema = z.object({
  paymentIntentId: paymentIntentIdSchema,
});

// Paramètres pour les routes avec invoiceId
const invoiceParamsSchema = z.object({
  invoiceId: invoiceIdSchema,
});

// Paramètres pour les routes avec membershipId
const membershipParamsSchema = z.object({
  membershipId: uuidSchema,
});

// Paramètres pour les routes avec trainingId
const trainingParamsSchema = z.object({
  trainingId: uuidSchema,
});

// Paramètres pour les routes avec associationId
const associationParamsSchema = z.object({
  associationId: uuidSchema,
});

// Paramètres pour les routes avec priceId
const priceParamsSchema = z.object({
  priceId: priceIdSchema,
});

// Paramètres combinés pour membership status
const membershipStatusParamsSchema = z.object({
  userId: uuidSchema,
  userType: z.enum(["user", "association"]),
});

// Paramètres combinés pour training details
const trainingDetailsParamsSchema = z.object({
  priceId: priceIdSchema,
  userId: uuidSchema,
});

// Paramètres combinés pour check training purchase
const checkTrainingPurchaseParamsSchema = z.object({
  userId: uuidSchema,
  trainingId: uuidSchema,
});

// ===== SCHÉMAS DE RÉPONSE =====

// Schéma de réponse générique de succès
const successResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.any().optional(),
});

// Schéma de réponse générique d'erreur
const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  errors: z.record(z.string()).optional(),
});

// Schéma de réponse pour les sessions Stripe
const stripeSessionResponseSchema = z.object({
  success: z.literal(true),
  sessionId: sessionIdSchema,
  url: z.string().url(),
});

// ===== EXPORTS =====

module.exports = {
  // Schémas de base
  uuidSchema,
  emailSchema,
  amountSchema,
  priceIdSchema,
  sessionIdSchema,
  paymentIntentIdSchema,
  customerIdSchema,
  invoiceIdSchema,

  // Schémas Membership
  createMembershipCheckoutSchema,
  processMembershipPaymentSuccessSchema,
  membershipMetadataSchema,
  membershipDataSchema,

  // Schémas Training
  createTrainingCheckoutSchema,
  processTrainingPurchaseSchema,
  trainingMetadataSchema,
  trainingPurchaseDataSchema,

  // Schémas Payment
  createCheckoutSessionSchema,
  createInvoiceSchema,
  paymentAttestationSchema,

  // Schémas Contact
  contactFormSchema,
  contactFormValidationSchema,

  // Schémas Prevention
  preventionRequestDataSchema,
  sendPreventionRequestSchema,
  testPreventionRequestSchema,

  // Schémas Health
  healthCheckSchema,

  // Schémas Newsletter
  sendNewsletterSchema,

  // Schémas Webhook
  stripeWebhookEventSchema,

  // Schémas de paramètres de route
  userIdParamsSchema,
  paymentIntentParamsSchema,
  invoiceParamsSchema,
  membershipParamsSchema,
  trainingParamsSchema,
  associationParamsSchema,
  priceParamsSchema,
  membershipStatusParamsSchema,
  trainingDetailsParamsSchema,
  checkTrainingPurchaseParamsSchema,

  // Schémas de réponse
  successResponseSchema,
  errorResponseSchema,
  stripeSessionResponseSchema,
};
