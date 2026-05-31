@echo off
REM =====================================================
REM Database Setup Script for saasPlug Microservices
REM =====================================================
REM Usage: setup_databases.bat

SETLOCAL ENABLEDELAYEDEXPANSION

echo.
echo ==========================================
echo saasPlug Microservices Database Setup
echo ==========================================
echo.

REM Database credentials (customize as needed)
SET DB_ROOT_USER=root
SET DB_HOST=localhost

REM Provider Management Database
SET PROVIDER_DB=provider_mgmt_db
SET PROVIDER_USER=provider_mgmt_user
SET PROVIDER_PASS=provider_mgmt_pass

REM Analytics Database
SET ANALYTICS_DB=analytics_db
SET ANALYTICS_USER=analytics_user
SET ANALYTICS_PASS=analytics_pass

REM Billing Database
SET BILLING_DB=billing_db
SET BILLING_USER=billing_user
SET BILLING_PASS=billing_pass

echo Step 1: Creating Databases
echo.

echo Creating %PROVIDER_DB%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE DATABASE IF NOT EXISTS %PROVIDER_DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %ERRORLEVEL% EQU 0 (
  echo [OK] %PROVIDER_DB% created
) else (
  echo [ERROR] Failed to create %PROVIDER_DB%
  goto :error
)

echo Creating %ANALYTICS_DB%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE DATABASE IF NOT EXISTS %ANALYTICS_DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %ERRORLEVEL% EQU 0 (
  echo [OK] %ANALYTICS_DB% created
) else (
  echo [ERROR] Failed to create %ANALYTICS_DB%
  goto :error
)

echo Creating %BILLING_DB%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE DATABASE IF NOT EXISTS %BILLING_DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if %ERRORLEVEL% EQU 0 (
  echo [OK] %BILLING_DB% created
) else (
  echo [ERROR] Failed to create %BILLING_DB%
  goto :error
)

echo.
echo Step 2: Creating Users and Granting Privileges
echo.

echo Creating user %PROVIDER_USER%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE USER IF NOT EXISTS '%PROVIDER_USER%'@'%DB_HOST%' IDENTIFIED BY '%PROVIDER_PASS%'; GRANT ALL PRIVILEGES ON %PROVIDER_DB%.* TO '%PROVIDER_USER%'@'%DB_HOST%';"
if %ERRORLEVEL% EQU 0 (
  echo [OK] User %PROVIDER_USER% created
) else (
  echo [ERROR] Failed to create %PROVIDER_USER%
  goto :error
)

echo Creating user %ANALYTICS_USER%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE USER IF NOT EXISTS '%ANALYTICS_USER%'@'%DB_HOST%' IDENTIFIED BY '%ANALYTICS_PASS%'; GRANT ALL PRIVILEGES ON %ANALYTICS_DB%.* TO '%ANALYTICS_USER%'@'%DB_HOST%';"
if %ERRORLEVEL% EQU 0 (
  echo [OK] User %ANALYTICS_USER% created
) else (
  echo [ERROR] Failed to create %ANALYTICS_USER%
  goto :error
)

echo Creating user %BILLING_USER%...
mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "CREATE USER IF NOT EXISTS '%BILLING_USER%'@'%DB_HOST%' IDENTIFIED BY '%BILLING_PASS%'; GRANT ALL PRIVILEGES ON %BILLING_DB%.* TO '%BILLING_USER%'@'%DB_HOST%';"
if %ERRORLEVEL% EQU 0 (
  echo [OK] User %BILLING_USER% created
) else (
  echo [ERROR] Failed to create %BILLING_USER%
  goto :error
)

echo.
echo Step 3: Flushing Privileges
echo.

mysql -u %DB_ROOT_USER% -h %DB_HOST% -e "FLUSH PRIVILEGES;"
if %ERRORLEVEL% EQU 0 (
  echo [OK] Privileges flushed
) else (
  echo [ERROR] Failed to flush privileges
  goto :error
)

echo.
echo Step 4: Creating Tables from SQL Scripts
echo.

if exist "Provider_Management_Service\db\schema.sql" (
  echo Initializing Provider_Management_Service schema...
  mysql -u %PROVIDER_USER% -p%PROVIDER_PASS% -h %DB_HOST% %PROVIDER_DB% < Provider_Management_Service\db\schema.sql
  echo [OK] Provider_Management_Service schema created
) else (
  echo [ERROR] Provider_Management_Service/db/schema.sql not found
)

if exist "Analytics_Service\db\schema.sql" (
  echo Initializing Analytics_Service schema...
  mysql -u %ANALYTICS_USER% -p%ANALYTICS_PASS% -h %DB_HOST% %ANALYTICS_DB% < Analytics_Service\db\schema.sql
  echo [OK] Analytics_Service schema created
) else (
  echo [ERROR] Analytics_Service/db/schema.sql not found
)

if exist "Billing_Service\db\schema.sql" (
  echo Initializing Billing_Service schema...
  mysql -u %BILLING_USER% -p%BILLING_PASS% -h %DB_HOST% %BILLING_DB% < Billing_Service\db\schema.sql
  echo [OK] Billing_Service schema created
) else (
  echo [ERROR] Billing_Service/db/schema.sql not found
)

echo.
echo ==========================================
echo [OK] Database Setup Complete!
echo ==========================================
echo.
echo Summary:
echo   Provider Management Database: %PROVIDER_DB%
echo     User: %PROVIDER_USER%
echo     Password: %PROVIDER_PASS%
echo.
echo   Analytics Database: %ANALYTICS_DB%
echo     User: %ANALYTICS_USER%
echo     Password: %ANALYTICS_PASS%
echo.
echo   Billing Database: %BILLING_DB%
echo     User: %BILLING_USER%
echo     Password: %BILLING_PASS%
echo.
echo Next steps:
echo   1. Copy .env.template files to .env in each service directory
echo   2. Update credentials if different from defaults
echo   3. Install dependencies: npm install in each service
echo   4. Start services: node src/index.js
echo.
goto :end

:error
echo.
echo ==========================================
echo [ERROR] Database setup failed!
echo ==========================================
echo.

:end
ENDLOCAL
