@echo off
REM SaaS Plug - Multi-Provider Setup Script (Windows)
REM This script sets up all services and dependencies

echo.
echo ==========================================
echo SaaS Plug - Multi-Provider Integration
echo Setup Script
echo ==========================================
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed. Please install Node.js and npm first.
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm found: %NPM_VERSION%
echo.

REM Function to install dependencies
setlocal enabledelayedexpansion

echo Installing dependencies for all services...
echo.

REM Points Service
echo [SETUP] Installing dependencies for Points_Service...
if exist "Points_Service" (
    cd Points_Service
    if exist "package.json" (
        npm install
        if %errorlevel% equ 0 (
            echo [OK] Points_Service dependencies installed
        ) else (
            echo [ERROR] Failed to install Points_Service dependencies
            exit /b 1
        )
    ) else (
        echo [ERROR] package.json not found in Points_Service
        exit /b 1
    )
    cd ..
) else (
    echo [ERROR] Points_Service directory not found
    exit /b 1
)
echo.

REM Reservation Service
echo [SETUP] Installing dependencies for Reservation_Service...
if exist "Reservation_Service" (
    cd Reservation_Service
    if exist "package.json" (
        npm install
        if %errorlevel% equ 0 (
            echo [OK] Reservation_Service dependencies installed
        ) else (
            echo [ERROR] Failed to install Reservation_Service dependencies
            exit /b 1
        )
    ) else (
        echo [ERROR] package.json not found in Reservation_Service
        exit /b 1
    )
    cd ..
) else (
    echo [ERROR] Reservation_Service directory not found
    exit /b 1
)
echo.

REM API Gateway
echo [SETUP] Installing dependencies for API_Gateway...
if exist "API_Gateway" (
    cd API_Gateway
    if exist "package.json" (
        npm install
        if %errorlevel% equ 0 (
            echo [OK] API_Gateway dependencies installed
        ) else (
            echo [ERROR] Failed to install API_Gateway dependencies
            exit /b 1
        )
    ) else (
        echo [ERROR] package.json not found in API_Gateway
        exit /b 1
    )
    cd ..
) else (
    echo [ERROR] API_Gateway directory not found
    exit /b 1
)
echo.

echo ==========================================
echo [SUCCESS] All services configured!
echo ==========================================
echo.
echo Next Steps:
echo ===========
echo.
echo 1. Start Points Service (open new Command Prompt):
echo    cd Points_Service ^&^& npm start
echo.
echo 2. Start Reservation Service (open new Command Prompt):
echo    cd Reservation_Service ^&^& npm start
echo.
echo 3. Start API Gateway (open new Command Prompt):
echo    cd API_Gateway ^&^& npm start
echo.
echo 4. Start API Gateway (open new Command Prompt):
echo    cd API_Gateway ^&^& npm start
echo.
echo 5. Test services (in Command Prompt or PowerShell):
echo    curl http://localhost:8000/health
echo.
echo See QUICK_START_GUIDE.md for detailed instructions.
echo.
pause
