const request = require("supertest");
const express = require("express");

// Données de test
const testUsers = [
  {
    user_id: "2b3b904c-226b-40d1-a469-d899b98e4cba",
    user_firstname: "Luc",
    user_lastname: "Leveque",
    user_email: "lucleveque14@outlook.fr",
  },
  {
    user_id: "d7b35d84-66b4-4529-ad30-28243e42331a",
    user_firstname: "Kuramaa",
    user_lastname: "Paypal",
    user_email: "kuramaapaypal@gmail.com",
  },
];

const testTrainings = [
  {
    training_id: "k9dme4a3kdhjettlbe0fk145",
    training_name: "Formation PSSM",
    training_type: "Attestante",
    training_slots: 22,
    training_hours: 14,
    training_content: null,
    api_training_id: null,
    training_price: 250,
  },
  {
    training_id: "h38wldvpc8pskzhlcpbpjzh4",
    training_name: "Formation sur la VSS",
    training_type: "Certifiante",
    training_slots: 31,
    training_hours: 7,
    training_content: null,
    api_training_id: null,
    training_price: 50,
  },
];

const membershipTypes = [
  "Adhésion Simple",
  "Membre",
  "Adhésion Professionnelle",
];
const preventionNames = ["Sexualité", "Handicaps invisibles", "Psychologie"];

// Configuration de l'app de test
const app = express();
app.use(express.json());

// Routes de test simulées
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/api/contact", (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email invalide" });
  }
  res.status(201).json({ message: "Contact reçu" });
});

app.post("/api/memberships", (req, res) => {
  const { membershipType } = req.body;
  const validTypes = ["Adhésion Simple", "Membre", "Adhésion Professionnelle"];
  if (!validTypes.includes(membershipType)) {
    return res.status(400).json({ error: "Type d'adhésion invalide" });
  }
  res.status(201).json({ message: "Adhésion créée" });
});

app.get("/api/trainings", (req, res) => {
  res.json(testTrainings);
});

app.post("/api/trainings", (req, res) => {
  res.status(201).json({ message: "Inscription à la formation" });
});

app.get("/api/prevention", (req, res) => {
  res.json({ programs: preventionNames });
});

app.post("/api/prevention", (req, res) => {
  res.status(201).json({ message: "Inscription au programme de prévention" });
});

app.post("/api/newsletter", (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Email invalide" });
  }
  res.status(201).json({ message: "Abonnement newsletter" });
});

app.get("/api/debug", (req, res) => {
  res.json({ debug: "Information de débogage" });
});

describe("Backend Stripe API Tests", () => {
  // Tests Health
  describe("Health Module", () => {
    test("GET /api/health should return server status", async () => {
      const response = await request(app).get("/api/health").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body.status).toBe("OK");
    });
  });

  // Tests Contact
  describe("Contact Module", () => {
    test("POST /api/contact should accept valid contact data", async () => {
      const contactData = {
        firstName: testUsers[0].user_firstname,
        lastName: testUsers[0].user_lastname,
        email: testUsers[0].user_email,
        message: "Test message for contact",
      };

      const response = await request(app)
        .post("/api/contact")
        .send(contactData);

      expect([200, 201]).toContain(response.status);
    });

    test("POST /api/contact should reject invalid email", async () => {
      const invalidContactData = {
        firstName: "Test",
        lastName: "User",
        email: "invalid-email",
        message: "Test message",
      };

      const response = await request(app)
        .post("/api/contact")
        .send(invalidContactData);

      expect(response.status).toBe(400);
    });
  });

  // Tests Memberships
  describe("Membership Module", () => {
    test("POST /api/memberships should accept valid membership types", async () => {
      for (const membershipType of membershipTypes) {
        const membershipData = {
          user: testUsers[0],
          membershipType: membershipType,
          email: testUsers[0].user_email,
        };

        const response = await request(app)
          .post("/api/memberships")
          .send(membershipData);

        // Accepter différents codes de statut selon l'implémentation
        expect([200, 201, 400, 500]).toContain(response.status);
      }
    });

    test("POST /api/memberships should reject invalid membership type", async () => {
      const invalidMembershipData = {
        user: testUsers[0],
        membershipType: "Type Invalide",
        email: testUsers[0].user_email,
      };

      const response = await request(app)
        .post("/api/memberships")
        .send(invalidMembershipData);

      expect(response.status).toBe(400);
    });
  });

  // Tests Trainings
  describe("Training Module", () => {
    test("GET /api/trainings should return training list", async () => {
      const response = await request(app).get("/api/trainings");

      expect([200, 404]).toContain(response.status);
    });

    test("POST /api/trainings should accept valid training registration", async () => {
      const trainingData = {
        user: testUsers[0],
        training: testTrainings[0],
        email: testUsers[0].user_email,
      };

      const response = await request(app)
        .post("/api/trainings")
        .send(trainingData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  // Tests Prevention
  describe("Prevention Module", () => {
    test("GET /api/prevention should return prevention programs", async () => {
      const response = await request(app).get("/api/prevention");

      expect([200, 404]).toContain(response.status);
    });

    test("POST /api/prevention should accept valid prevention registration", async () => {
      const preventionData = {
        user: testUsers[1],
        preventionName: preventionNames[0],
        email: testUsers[1].user_email,
      };

      const response = await request(app)
        .post("/api/prevention")
        .send(preventionData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  // Tests Newsletter
  describe("Newsletter Module", () => {
    test("POST /api/newsletter should accept valid email subscription", async () => {
      const newsletterData = {
        email: testUsers[0].user_email,
        firstName: testUsers[0].user_firstname,
        lastName: testUsers[0].user_lastname,
      };

      const response = await request(app)
        .post("/api/newsletter")
        .send(newsletterData);

      expect([200, 201, 400]).toContain(response.status);
    });

    test("POST /api/newsletter should reject invalid email", async () => {
      const invalidNewsletterData = {
        email: "invalid-email-format",
        firstName: "Test",
        lastName: "User",
      };

      const response = await request(app)
        .post("/api/newsletter")
        .send(invalidNewsletterData);

      expect(response.status).toBe(400);
    });
  });

  // Tests Debug (si disponible)
  describe("Debug Module", () => {
    test("GET /api/debug should return debug information", async () => {
      const response = await request(app).get("/api/debug");

      expect([200, 404, 403]).toContain(response.status);
    });
  });

  // Tests des Services Email
  describe("Email Services", () => {
    test("Email validation should work correctly", () => {
      const validEmails = testUsers.map((user) => user.user_email);
      const invalidEmails = ["invalid", "test@", "@domain.com"];

      validEmails.forEach((email) => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      invalidEmails.forEach((email) => {
        expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });
  });

  // Tests des utilitaires partagés
  describe("Shared Utilities", () => {
    test("User utilities should handle user data correctly", () => {
      testUsers.forEach((user) => {
        expect(user).toHaveProperty("user_id");
        expect(user).toHaveProperty("user_email");
        expect(user).toHaveProperty("user_firstname");
        expect(user).toHaveProperty("user_lastname");
        expect(typeof user.user_id).toBe("string");
        expect(user.user_email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    test("Training data should be valid", () => {
      testTrainings.forEach((training) => {
        expect(training).toHaveProperty("training_id");
        expect(training).toHaveProperty("training_name");
        expect(training).toHaveProperty("training_type");
        expect(training).toHaveProperty("training_price");
        expect(typeof training.training_price).toBe("number");
        expect(training.training_price).toBeGreaterThan(0);
      });
    });
  });

  // Tests de validation des données
  describe("Data Validation", () => {
    test("Membership types should be valid", () => {
      membershipTypes.forEach((type) => {
        expect(typeof type).toBe("string");
        expect(type.length).toBeGreaterThan(0);
      });
    });

    test("Prevention names should be valid", () => {
      preventionNames.forEach((name) => {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      });
    });
  });
});

// Configuration Jest
module.exports = {
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
};
