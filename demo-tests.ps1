# Script de démonstration des tests
# Ce script montre comment utiliser les deux méthodes de test

Write-Host "🚀 Démonstration des Tests Backend Stripe" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Vérification de l'environnement
Write-Host "📋 Vérification de l'environnement..." -ForegroundColor Yellow

# Vérifier si Node.js est installé
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js installé: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js non trouvé. Veuillez installer Node.js" -ForegroundColor Red
    exit 1
}

# Vérifier si npm est installé
try {
    $npmVersion = npm --version
    Write-Host "✅ npm installé: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm non trouvé" -ForegroundColor Red
    exit 1
}

# Vérifier si les dépendances sont installées
if (Test-Path "node_modules") {
    Write-Host "✅ Dépendances installées" -ForegroundColor Green
} else {
    Write-Host "⚠️  Installation des dépendances..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "🧪 MÉTHODE 1: Tests Unitaires avec Jest" -ForegroundColor Magenta
Write-Host "======================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "Exécution des tests Jest..." -ForegroundColor White
npm test

Write-Host ""
Write-Host "📊 Résumé des tests Jest:" -ForegroundColor Cyan
Write-Host "- Tests de validation des données" -ForegroundColor White
Write-Host "- Tests des routes API simulées" -ForegroundColor White
Write-Host "- Tests des utilitaires" -ForegroundColor White
Write-Host "- Validation des emails" -ForegroundColor White

Write-Host ""
Write-Host "🔧 MÉTHODE 2: Tests API avec PowerShell" -ForegroundColor Magenta
Write-Host "======================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "⚠️  IMPORTANT: Pour exécuter les tests API PowerShell:" -ForegroundColor Yellow
Write-Host "1. Démarrez le serveur backend sur http://localhost:3001" -ForegroundColor White
Write-Host "2. Exécutez: .\test-api.ps1" -ForegroundColor White
Write-Host ""

Write-Host "📝 Exemple de commande pour démarrer le serveur:" -ForegroundColor Cyan
Write-Host "npm start" -ForegroundColor Gray
Write-Host ""

Write-Host "📁 Fichiers créés:" -ForegroundColor Cyan
Write-Host "- backend.test.js      (Tests unitaires Jest)" -ForegroundColor White
Write-Host "- test-api.ps1         (Tests API PowerShell)" -ForegroundColor White
Write-Host "- jest.config.js       (Configuration Jest)" -ForegroundColor White
Write-Host "- README-TESTS.md      (Guide complet)" -ForegroundColor White
Write-Host "- demo-tests.ps1       (Ce script de démonstration)" -ForegroundColor White

Write-Host ""
Write-Host "📋 Données de test utilisées:" -ForegroundColor Cyan
Write-Host "- 2 utilisateurs de test" -ForegroundColor White
Write-Host "- 2 formations (PSSM, VSS)" -ForegroundColor White
Write-Host "- 3 types d'adhésion" -ForegroundColor White
Write-Host "- 3 programmes de prévention" -ForegroundColor White

Write-Host ""
Write-Host "🎯 Modules testés:" -ForegroundColor Cyan
Write-Host "✅ Health Check" -ForegroundColor Green
Write-Host "✅ Contact" -ForegroundColor Green
Write-Host "✅ Memberships" -ForegroundColor Green
Write-Host "✅ Trainings" -ForegroundColor Green
Write-Host "✅ Prevention" -ForegroundColor Green
Write-Host "✅ Newsletter" -ForegroundColor Green
Write-Host "✅ Debug" -ForegroundColor Green
Write-Host "✅ Email Services" -ForegroundColor Green
Write-Host "✅ Shared Utilities" -ForegroundColor Green
Write-Host "✅ Data Validation" -ForegroundColor Green

Write-Host ""
Write-Host "🚫 Exclusions (comme demandé):" -ForegroundColor Red
Write-Host "❌ Tests Stripe (non inclus)" -ForegroundColor Red

Write-Host ""
Write-Host "✅ Configuration terminée!" -ForegroundColor Green
Write-Host "Consultez README-TESTS.md pour plus de détails." -ForegroundColor Yellow

Write-Host ""
Write-Host "🔍 Commandes utiles:" -ForegroundColor Cyan
Write-Host "npm test              - Exécuter les tests" -ForegroundColor Gray
Write-Host "npm run test:watch   - Tests en mode surveillance" -ForegroundColor Gray
Write-Host "npm run test:coverage - Tests avec couverture" -ForegroundColor Gray
Write-Host ".\test-api.ps1        - Tests API PowerShell" -ForegroundColor Gray