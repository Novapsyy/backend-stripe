const Stripe = require("stripe");

// Configuration Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

module.exports = {
  stripe,
};
