# SaaS Plug - Multi-Provider Setup Script (PowerShell)
# This script sets up all services and dependencies

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SaaS Plug - Multi-Provider Integration" -ForegroundColor Cyan
Write-Host "Setup Script (PowerShell)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if npm is installed
$npmversionOutput = npm --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm is not installed. Please install Node.js and npm first." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] npm found: $npmversionOutput" -ForegroundColor Green
Write-Host ""

# Function to install dependencies
function Install-Service {
    param([string]$ServiceName)
    
    Write-Host "[SETUP] Installing dependencies for $ServiceName..." -ForegroundColor Yellow
    
    if (Test-Path $ServiceName) {
        Push-Location $ServiceName
        
        if (Test-Path "package.json") {
            npm install
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] $ServiceName dependencies installed" -ForegroundColor Green
            } else {
                Write-Host "[ERROR] Failed to install $ServiceName dependencies" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "[ERROR] package.json not found in $ServiceName" -ForegroundColor Red
            exit 1
        }
        
        Pop-Location
    } else {
        Write-Host "[ERROR] $ServiceName directory not found" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

# Install dependencies for all services
Write-Host "Installing dependencies for all services..." -ForegroundColor Cyan
Write-Host ""

Install-Service "Points_Service"
Install-Service "Reservation_Service"
Install-Service "API_Gateway"

Write-Host "========================================" -ForegroundColor Green
Write-Host "[SUCCESS] All services configured!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "============" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start Points Service (open new PowerShell window):" -ForegroundColor White
Write-Host "   cd Points_Service; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start Reservation Service (open new PowerShell window):" -ForegroundColor White
Write-Host "   cd Reservation_Service; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start API Gateway (open new PowerShell window):" -ForegroundColor White
Write-Host "   cd Reservation_Service; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Start API Gateway (open new PowerShell window):" -ForegroundColor White
Write-Host "   cd API_Gateway; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Test services (in PowerShell):" -ForegroundColor White
Write-Host "   curl http://localhost:8000/health" -ForegroundColor Gray
Write-Host ""
Write-Host "See QUICK_START_GUIDE.md for detailed instructions." -ForegroundColor Cyan
Write-Host ""

Write-Host "Or run this command to start all services in new windows:" -ForegroundColor Yellow
Write-Host "powershell -Command { @('Points_Service', 'Reservation_Service', 'API_Gateway') | ForEach-Object { Start-Process powershell -ArgumentList ""-NoExit -Command cd '$_'; npm start"" } }" -ForegroundColor Gray
Write-Host ""
