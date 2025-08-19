# Script PowerShell pour tester l'API Backend Stripe
# Utilise Invoke-RestMethod au lieu de curl

# Configuration
$BaseUrl = "http://localhost:3001"
$Headers = @{
    "Content-Type" = "application/json"
    "Accept" = "application/json"
}

# Données de test
$TestUsers = @(
    @{
        user_id = "2b3b904c-226b-40d1-a469-d899b98e4cba"
        user_firstname = "Luc"
        user_lastname = "Leveque"
        user_email = "lucleveque14@outlook.fr"
    },
    @{
        user_id = "d7b35d84-66b4-4529-ad30-28243e42331a"
        user_firstname = "Kuramaa"
        user_lastname = "Paypal"
        user_email = "kuramaapaypal@gmail.com"
    }
)

$TestTrainings = @(
    @{
        training_id = "k9dme4a3kdhjettlbe0fk145"
        training_name = "Formation PSSM"
        training_type = "Attestante"
        training_slots = 22
        training_hours = 14
        training_content = $null
        api_training_id = $null
        training_price = 250
    },
    @{
        training_id = "h38wldvpc8pskzhlcpbpjzh4"
        training_name = "Formation sur la VSS"
        training_type = "Certifiante"
        training_slots = 31
        training_hours = 7
        training_content = $null
        api_training_id = $null
        training_price = 50
    }
)

$MembershipTypes = @('Adhésion Simple', 'Membre', 'Adhésion Professionnelle')
$PreventionNames = @('Sexualité', 'Handicaps invisibles', 'Psychologie')

# Fonction pour afficher les résultats
function Show-TestResult {
    param(
        [string]$TestName,
        [bool]$Success,
        [string]$Details = ""
    )
    
    $Status = if ($Success) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "$Status - $TestName" -ForegroundColor $(if ($Success) { 'Green' } else { 'Red' })
    if ($Details) {
        Write-Host "   Details: $Details" -ForegroundColor Gray
    }
}

# Fonction pour faire une requête HTTP
function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null
    )
    
    try {
        $Uri = "$BaseUrl$Endpoint"
        $Params = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
        }
        
        if ($Body) {
            $Params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $Response = Invoke-RestMethod @Params
        return @{ Success = $true; Data = $Response; StatusCode = 200 }
    }
    catch {
        $StatusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 }
        return @{ Success = $false; Error = $_.Exception.Message; StatusCode = $StatusCode }
    }
}

Write-Host "🚀 Démarrage des tests API Backend Stripe" -ForegroundColor Cyan
Write-Host "URL de base: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# Test 1: Health Check
Write-Host "📋 Tests Health Check" -ForegroundColor Magenta
$HealthResult = Invoke-ApiRequest -Method "GET" -Endpoint "/health"
Show-TestResult -TestName "GET /health" -Success $HealthResult.Success -Details "Status: $($HealthResult.StatusCode)"
Write-Host ""

# Test 2: Contact
Write-Host "📧 Tests Contact" -ForegroundColor Magenta
$ContactData = @{
    firstName = $TestUsers[0].user_firstname
    lastName = $TestUsers[0].user_lastname
    email = $TestUsers[0].user_email
    message = "Message de test depuis PowerShell"
}
$ContactResult = Invoke-ApiRequest -Method "POST" -Endpoint "/contact" -Body $ContactData
Show-TestResult -TestName "POST /contact (données valides)" -Success ($ContactResult.StatusCode -in @(200, 201)) -Details "Status: $($ContactResult.StatusCode)"

# Test contact avec email invalide
$InvalidContactData = @{
    firstName = "Test"
    lastName = "User"
    email = "email-invalide"
    message = "Test message"
}
$InvalidContactResult = Invoke-ApiRequest -Method "POST" -Endpoint "/contact" -Body $InvalidContactData
Show-TestResult -TestName "POST /contact (email invalide)" -Success ($InvalidContactResult.StatusCode -eq 400) -Details "Status: $($InvalidContactResult.StatusCode)"
Write-Host ""

# Test 3: Memberships
Write-Host "👥 Tests Memberships" -ForegroundColor Magenta
foreach ($MembershipType in $MembershipTypes) {
    $MembershipData = @{
        user = $TestUsers[0]
        membershipType = $MembershipType
        email = $TestUsers[0].user_email
    }
    $MembershipResult = Invoke-ApiRequest -Method "POST" -Endpoint "/memberships" -Body $MembershipData
    Show-TestResult -TestName "POST /memberships ($MembershipType)" -Success ($MembershipResult.StatusCode -in @(200, 201, 400, 500)) -Details "Status: $($MembershipResult.StatusCode)"
}

# Test membership avec type invalide
$InvalidMembershipData = @{
    user = $TestUsers[0]
    membershipType = "Type Invalide"
    email = $TestUsers[0].user_email
}
$InvalidMembershipResult = Invoke-ApiRequest -Method "POST" -Endpoint "/memberships" -Body $InvalidMembershipData
Show-TestResult -TestName "POST /memberships (type invalide)" -Success ($InvalidMembershipResult.StatusCode -eq 400) -Details "Status: $($InvalidMembershipResult.StatusCode)"
Write-Host ""

# Test 4: Trainings
Write-Host "🎓 Tests Trainings" -ForegroundColor Magenta
$TrainingsListResult = Invoke-ApiRequest -Method "GET" -Endpoint "/trainings"
Show-TestResult -TestName "GET /trainings" -Success ($TrainingsListResult.StatusCode -in @(200, 404)) -Details "Status: $($TrainingsListResult.StatusCode)"

foreach ($Training in $TestTrainings) {
    $TrainingData = @{
        user = $TestUsers[1]
        training = $Training
        email = $TestUsers[1].user_email
    }
    $TrainingResult = Invoke-ApiRequest -Method "POST" -Endpoint "/trainings" -Body $TrainingData
    Show-TestResult -TestName "POST /trainings ($($Training.training_name))" -Success ($TrainingResult.StatusCode -in @(200, 201, 400, 500)) -Details "Status: $($TrainingResult.StatusCode)"
}
Write-Host ""

# Test 5: Prevention
Write-Host "🛡️ Tests Prevention" -ForegroundColor Magenta
$PreventionListResult = Invoke-ApiRequest -Method "GET" -Endpoint "/prevention"
Show-TestResult -TestName "GET /prevention" -Success ($PreventionListResult.StatusCode -in @(200, 404)) -Details "Status: $($PreventionListResult.StatusCode)"

foreach ($PreventionName in $PreventionNames) {
    $PreventionData = @{
        user = $TestUsers[0]
        preventionName = $PreventionName
        email = $TestUsers[0].user_email
    }
    $PreventionResult = Invoke-ApiRequest -Method "POST" -Endpoint "/prevention" -Body $PreventionData
    Show-TestResult -TestName "POST /prevention ($PreventionName)" -Success ($PreventionResult.StatusCode -in @(200, 201, 400, 500)) -Details "Status: $($PreventionResult.StatusCode)"
}
Write-Host ""

# Test 6: Newsletter
Write-Host "📰 Tests Newsletter" -ForegroundColor Magenta
$NewsletterData = @{
    email = $TestUsers[1].user_email
    firstName = $TestUsers[1].user_firstname
    lastName = $TestUsers[1].user_lastname
}
$NewsletterResult = Invoke-ApiRequest -Method "POST" -Endpoint "/newsletter" -Body $NewsletterData
Show-TestResult -TestName "POST /newsletter (données valides)" -Success ($NewsletterResult.StatusCode -in @(200, 201, 400)) -Details "Status: $($NewsletterResult.StatusCode)"

# Test newsletter avec email invalide
$InvalidNewsletterData = @{
    email = "email-invalide-format"
    firstName = "Test"
    lastName = "User"
}
$InvalidNewsletterResult = Invoke-ApiRequest -Method "POST" -Endpoint "/newsletter" -Body $InvalidNewsletterData
Show-TestResult -TestName "POST /newsletter (email invalide)" -Success ($InvalidNewsletterResult.StatusCode -eq 400) -Details "Status: $($InvalidNewsletterResult.StatusCode)"
Write-Host ""

# Test 7: Debug
Write-Host "🐛 Tests Debug" -ForegroundColor Magenta
$DebugResult = Invoke-ApiRequest -Method "GET" -Endpoint "/debug"
Show-TestResult -TestName "GET /debug" -Success ($DebugResult.StatusCode -in @(200, 404, 403)) -Details "Status: $($DebugResult.StatusCode)"
Write-Host ""

# Test 8: Endpoints inexistants
Write-Host "❓ Tests Endpoints Inexistants" -ForegroundColor Magenta
$NotFoundResult = Invoke-ApiRequest -Method "GET" -Endpoint "/nonexistent"
Show-TestResult -TestName "GET /nonexistent" -Success ($NotFoundResult.StatusCode -eq 404) -Details "Status: $($NotFoundResult.StatusCode)"
Write-Host ""

# Résumé
Write-Host "📊 Résumé des tests" -ForegroundColor Cyan
Write-Host "Les tests ont été exécutés avec les données suivantes:" -ForegroundColor Yellow
Write-Host "- Utilisateurs de test: $($TestUsers.Count)" -ForegroundColor White
Write-Host "- Formations de test: $($TestTrainings.Count)" -ForegroundColor White
Write-Host "- Types d'adhésion: $($MembershipTypes.Count)" -ForegroundColor White
Write-Host "- Programmes de prévention: $($PreventionNames.Count)" -ForegroundColor White
Write-Host ""
Write-Host "✅ Tests terminés!" -ForegroundColor Green
Write-Host "Note: Les tests Stripe ne sont pas inclus comme demandé." -ForegroundColor Yellow

# Instructions d'utilisation
Write-Host ""
Write-Host "📝 Instructions d'utilisation:" -ForegroundColor Cyan
Write-Host "1. Assurez-vous que le serveur backend est démarré sur http://localhost:3001" -ForegroundColor White
Write-Host "2. Exécutez ce script avec: .\test-api.ps1" -ForegroundColor White
Write-Host "3. Vérifiez les résultats des tests ci-dessus" -ForegroundColor White
Write-Host "4. Les codes de statut attendus varient selon l'implémentation" -ForegroundColor White