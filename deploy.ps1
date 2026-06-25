# PowerShell deployment script for saasPlug
# Windows-compatible version of deploy.sh

param(
    [bool]$ResetData = $true,
    [bool]$Frontend = $true,
    [string]$OperatorUsername = "operator",
    [string]$OperatorEmail = "operator@charger.io",
    [string]$OperatorPassword = "operator123"
)

$ErrorActionPreference = "Stop"
$ROOT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

function Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor Green
}

function Check-Command {
    param([string]$Command)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "Missing required command: $Command" -ForegroundColor Red
        exit 1
    }
}

# Verify required commands
Check-Command docker
Check-Command curl
Check-Command node

Log "Starting deployment for saasPlug..."

# Reset or stop containers
if ($ResetData) {
    Log "Resetting Docker containers and persisted volumes"
    docker compose down --volumes --remove-orphans
} else {
    Log "Stopping existing containers without deleting volumes"
    docker compose down --remove-orphans
}

# Start services
Log "Building and starting backend/database containers"
try {
    docker compose up -d --build
} catch {
    Log "Initial compose startup hit a dependency timing issue; retrying once"
    Start-Sleep -Seconds 10
    docker compose up -d --build
}

# Wait for services to be healthy
$services = @(
    "saasplug-rabbitmq",
    "saasplug-message-broker",
    "saasplug-mysql-central",
    "saasplug-mariadb-provider",
    "saasplug-mariadb-auth",
    "saasplug-mariadb-analytics",
    "saasplug-mariadb-billing",
    "saasplug-central"
)

foreach ($service in $services) {
    Log "Waiting for $service to become healthy"
    $timeout = 120
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        $status = docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $service 2>$null
        if ($status -eq "healthy" -or $status -eq "running") {
            Write-Host "  $service : $status" -ForegroundColor Cyan
            break
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    if ($elapsed -ge $timeout) {
        Write-Host "Timed out waiting for $service" -ForegroundColor Red
        docker logs --tail=80 $service
        exit 1
    }
}

# Wait for HTTP endpoints
$endpoints = @(
    "http://localhost:5517/auth/health",
    "http://localhost:5516/health",
    "http://localhost:5518/health",
    "http://localhost:5514/health",
    "http://localhost:5520/health",
    "http://localhost:5521/health",
    "http://localhost:5522/health"
)

foreach ($endpoint in $endpoints) {
    Log "Waiting for HTTP endpoint $endpoint"
    $timeout = 120
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        try {
            $response = Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -lt 500) {
                Write-Host "  ready: $endpoint" -ForegroundColor Cyan
                break
            }
        } catch {
            # Expected until service is ready
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    if ($elapsed -ge $timeout) {
        Write-Host "Timed out waiting for $endpoint" -ForegroundColor Red
        exit 1
    }
}

# Seed providers
Log "Seeding provider accounts"
docker compose run --rm `
    -e DB_HOST=mariadb-provider `
    -e DB_PORT=3306 `
    -e DB_USER=provider_user `
    -e DB_PASSWORD=provider_pass `
    provider-management-service npm run seed

# Create operator user
Log "Creating reserved operator user in Auth DB"
$operatorPassword = $OperatorPassword

# Insert operator user via SQL
$sqlScript = @"
INSERT INTO User (username, email, password_hash, first_name, last_name)
VALUES ('$OperatorUsername', '$OperatorEmail', SHA2('$operatorPassword', 256), 'SaaS', 'Operator')
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  updated_at = CURRENT_TIMESTAMP;
"@

# Execute via docker exec
$sqlScript | docker exec -i saasplug-mariadb-auth mariadb -uroot -proot auth_db

Write-Host "  operator login identifier: $OperatorUsername or $OperatorEmail" -ForegroundColor Cyan
Write-Host "  operator password: $operatorPassword" -ForegroundColor Cyan

# Load analytics data
Log "Loading mock analytics data"
if (Test-Path "Analytics_Service/db/mock-provider-analytics-seed.sql") {
    Get-Content "Analytics_Service/db/mock-provider-analytics-seed.sql" | docker exec -i saasplug-mariadb-analytics mariadb -uroot -proot analytics_db
}

# Load billing data
Log "Loading billing data"
if (Test-Path "Billing_Service/db/init.sql") {
    Get-Content "Billing_Service/db/init.sql" | docker exec -i saasplug-mariadb-billing mariadb -uroot -proot billing_db
}

# Repopulate points from providers
Log "Loading charging points from provider adapters into central Points DB"
try {
    $response = curl.exe -fsS -X POST "http://localhost:5512/db/repopulate" `
        -H "Content-Type: application/json" `
        -d "{}"
    Write-Host "  Repopulation response: $response" -ForegroundColor Cyan
} catch {
    Write-Host "  Warning: Could not repopulate points (service might not be ready)" -ForegroundColor Yellow
}

Log "Deployment data is ready"
Write-Host "  Backend examples:" -ForegroundColor Yellow
Write-Host "    Auth:      http://localhost:5517/auth/health"
Write-Host "    Points:    http://localhost:5512/api/points"
Write-Host "    Analytics: http://localhost:5518/health"
Write-Host "    Billing:   http://localhost:5514/health"
Write-Host "  Operator credentials:" -ForegroundColor Yellow
Write-Host "    username: $OperatorUsername"
Write-Host "    email:    $OperatorEmail"
Write-Host "    password: $operatorPassword"
Write-Host "  Frontend:" -ForegroundColor Yellow
Write-Host "    http://localhost:3311"

if ($Frontend) {
    Log "Starting React frontend"
    & "$ROOT_DIR/front-end/run_frontend.sh"
} else {
    Write-Host "Frontend skipped. To start manually:" -ForegroundColor Yellow
    Write-Host "  cd front-end && npm run dev" -ForegroundColor Cyan
}
