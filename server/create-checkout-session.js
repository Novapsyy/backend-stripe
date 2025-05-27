import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Route de santé pour vérifier que l'API fonctionne
app.get("/", (req, res) => {
  res.json({ message: "API de paiement opérationnelle" });
});

// Route pour créer une session de checkout Stripe
app.post("/create-checkout-session", async (req, res) => {
  const { priceId } = req.body;

  // Validation basique
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

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur Stripe:", err);
    res.status(500).json({ error: err.message });
  }
});

// Pour Vercel, on n'a pas besoin d'app.listen en production
// Mais on garde la logique pour le développement local
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export pour Vercel (fonction serverless)
export default (req, res) => {
  return app(req, res);
};
