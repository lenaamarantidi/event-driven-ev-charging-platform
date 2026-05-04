@echo off
REM Frontend Run Script (Windows)
REM Installs dependencies if needed and starts Vite dev server
REM Usage: run_frontend.bat

setlocal

REM Get the script directory
set FRONTEND_DIR=%~dp0
cd /d "%FRONTEND_DIR%"

echo.
echo ========================================================
echo EV Charger Frontend
echo ========================================================

REM Set Node.js path explicitly
set "PATH=C:\Program Files\nodejs;%PATH%"

REM Step 1: Check Node.js and npm
echo.
echo [1/2] Checking Node.js and npm...
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo OK: Node.js found
echo OK: npm found

REM Step 2: Ensure dependencies exist
echo.
echo [2/2] Verifying dependencies...
if not exist node_modules (
    echo Installing dependencies...
    if exist package-lock.json (
        npm ci
    ) else (
        npm install
    )
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo OK: Dependencies installed
    echo.
    echo Frontend will be available at: http://localhost:5173
) else (
    echo OK: Dependencies present
)

echo.
echo ========================================================
echo Starting Vite dev server...
    echo Open: http://localhost:5173
echo ========================================================
echo.

npm run dev

pause
