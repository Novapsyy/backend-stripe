import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Hello from Express on Vercel!"));

export default app;
