import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Fonction serverless pour Vercel
export default async function handler(req, res) {
  // Configuration CORS
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Gestion des requêtes OPTIONS (preflight CORS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Route GET pour tester l'API
  if (req.method === "GET") {
    return res.json({ message: "API de paiement opérationnelle" });
  }

  // Route POST pour créer une session de checkout
  if (req.method === "POST") {
    const { priceId } = req.body;

    // Validation
    if (!priceId) {
      return res.status(400).json({ error: "priceId est requis" });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.FRONTEND_URL}/success`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error("Erreur Stripe:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Méthode non autorisée
  return res.status(405).json({ error: "Méthode non autorisée" });
}
