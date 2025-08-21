// Configuration du serveur
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Prix des produits Stripe
const PRICES = {
  // Adhésions forfait unique (1 an)
  price_1RknRO05Uibkj68MUPgVuW2Y: 30, // Adhésion Simple
  price_1RknR205Uibkj68MeezgOEAs: 20, // Adhésion Pro
  price_1RknQd05Uibkj68MgNOg2UxF: 10, // Membre Asso

  // Formations
  price_1RZKxz05Uibkj68MfCpirZlH: 250, // PSSM
  price_1RT2Gi05Uibkj68MuYaG5HZn: 50, // VSS
};

// Détails des formations
const TRAININGS = {
  price_1RZKxz05Uibkj68MfCpirZlH: {
    name: "PSSM",
    full_name: "Premiers Secours en Santé Mentale",
    base_price: 250,
    member_discount: 35,
    duration: 14,
    training_type: "Premiers Secours en Santé Mentale",
  },
  price_1RT2Gi05Uibkj68MuYaG5HZn: {
    name: "VSS",
    full_name: "Violences Sexistes et Sexuelles",
    base_price: 50,
    member_discount: 15,
    duration: 7,
    training_type: "Violences Sexistes et Sexuelles",
  },
};

// Origines autorisées pour CORS
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:5173",
  "https://novapsy.info",
  "https://www.novapsy.info",
];

module.exports = {
  PORT,
  FRONTEND_URL,
  WEBHOOK_SECRET,
  PRICES,
  TRAININGS,
  ALLOWED_ORIGINS,
};
