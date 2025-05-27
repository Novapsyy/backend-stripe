// /api/index.js

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-04-10",
});

export default async function handler(req, res) {
  // 🔐 Définis ici ton frontend autorisé :
  const allowedOrigin = process.env.FRONTEND_URL; // Utilise la variable d'environnement FRONTEND_URL

  // 🔧 Ajoute les headers CORS à toutes les réponses
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔁 Répondre à la requête pré-vol OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Erreur Stripe :", err);
    return res.status(500).json({ error: err.message });
  }
}
