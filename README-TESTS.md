# Guide des Tests Backend Stripe

Ce guide explique comment utiliser les deux méthodes de test disponibles pour le backend Stripe.

## 📋 Données de Test

### Utilisateurs de Test

```json
[
  {
    "user_id": "2b3b904c-226b-40d1-a469-d899b98e4cba",
    "user_firstname": "Luc",
    "user_lastname": "Leveque",
    "user_email": "lucleveque14@outlook.fr"
  },
  {
    "user_id": "d7b35d84-66b4-4529-ad30-28243e42331a",
    "user_firstname": "Kuramaa",
    "user_lastname": "Paypal",
    "user_email": "kuramaapaypal@gmail.com"
  }
]
```

### Formations de Test

```json
[
  {
    "training_id": "k9dme4a3kdhjettlbe0fk145",
    "training_name": "Formation PSSM",
    "training_type": "Attestante",
    "training_slots": 22,
    "training_hours": 14,
    "training_price": 250
  },
  {
    "training_id": "h38wldvpc8pskzhlcpbpjzh4",
    "training_name": "Formation sur la VSS",
    "training_type": "Certifiante",
    "training_slots": 31,
    "training_hours": 7,
    "training_price": 50
  }
]
```

### Types d'Adhésion Valides

- Adhésion Simple
- Membre
- Adhésion Professionnelle

### Programmes de Prévention

- Sexualité
- Handicaps invisibles
- Psychologie

## 🧪 Méthode 1: Tests Unitaires avec Jest

### Installation des Dépendances

```bash
npm install --save-dev jest supertest
```

### Exécution des Tests

#### Tests simples

```bash
npm test
```

#### Tests en mode watch (surveillance)

```bash
npm run test:watch
```

#### Tests avec couverture de code

```bash
npm run test:coverage
```

### Modules Testés

- ✅ **Health**: Vérification du statut du serveur
- ✅ **Contact**: Envoi de messages de contact
- ✅ **Memberships**: Gestion des adhésions
- ✅ **Trainings**: Inscription aux formations
- ✅ **Prevention**: Programmes de prévention
- ✅ **Newsletter**: Abonnement à la newsletter
- ✅ **Debug**: Informations de débogage
- ✅ **Email Services**: Validation des emails
- ✅ **Shared Utilities**: Utilitaires partagés
- ✅ **Data Validation**: Validation des données

### Fichiers de Test

- `backend.test.js` - Tests unitaires complets
- `jest.config.js` - Configuration Jest

## 🔧 Méthode 2: Tests API avec PowerShell

### Prérequis

- PowerShell 5.0 ou supérieur
- Serveur backend démarré sur `http://localhost:3001`

### Exécution du Script

```powershell
.\test-api.ps1
```

### Fonctionnalités du Script

- 🌐 Tests HTTP avec `Invoke-RestMethod`
- 📊 Affichage coloré des résultats
- ✅ Validation des codes de statut
- 📝 Rapport détaillé des tests
- 🎯 Tests de cas valides et invalides

### Tests Effectués

1. **Health Check** - Vérification du statut du serveur
2. **Contact** - Envoi de messages (valides et invalides)
3. **Memberships** - Test de tous les types d'adhésion
4. **Trainings** - Liste et inscription aux formations
5. **Prevention** - Programmes de prévention
6. **Newsletter** - Abonnement (valide et invalide)
7. **Debug** - Informations de débogage
8. **Endpoints Inexistants** - Test des erreurs 404

## 📊 Interprétation des Résultats

### Codes de Statut Attendus

- **200**: Succès
- **201**: Créé avec succès
- **400**: Erreur de validation (attendu pour les données invalides)
- **404**: Endpoint non trouvé
- **500**: Erreur serveur

### Symboles dans PowerShell

- ✅ **PASS**: Test réussi
- ❌ **FAIL**: Test échoué
- 📋 **Health Check**
- 📧 **Contact**
- 👥 **Memberships**
- 🎓 **Trainings**
- 🛡️ **Prevention**
- 📰 **Newsletter**
- 🐛 **Debug**

## 🚫 Exclusions

Comme demandé, **les tests Stripe ne sont pas inclus** dans ces scripts de test.

## 🔍 Débogage

### Si les tests échouent

1. Vérifiez que le serveur est démarré
2. Vérifiez l'URL de base (`http://localhost:3001`)
3. Vérifiez les logs du serveur
4. Vérifiez la configuration des routes

### Logs détaillés

- Jest affiche les erreurs détaillées
- PowerShell affiche les codes de statut
- Consultez les logs du serveur pour plus d'informations

## 📁 Structure des Fichiers de Test

```
backend-stripe/
├── backend.test.js          # Tests unitaires Jest
├── test-api.ps1            # Script PowerShell
├── jest.config.js          # Configuration Jest
├── README-TESTS.md         # Ce guide
└── coverage/               # Rapports de couverture (généré)
```

## 🎯 Utilisation Recommandée

1. **Développement**: Utilisez `npm run test:watch` pour les tests en continu
2. **CI/CD**: Utilisez `npm run test:coverage` pour les rapports complets
3. **Tests manuels**: Utilisez le script PowerShell pour tester l'API en direct
4. **Débogage**: Combinez les deux méthodes pour une couverture complète

---

**Note**: Ces tests utilisent les données de test fournies et couvrent tous les modules refactorisés du backend Stripe, à l'exception des fonctionnalités Stripe comme demandé.
