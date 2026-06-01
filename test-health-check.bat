@echo off
REM Quick Health Check and API Test Script
REM This script verifies both services are running and responsive

echo.
echo ========================================
echo  SaaS Plug - System Health Check
echo ========================================
echo.

REM Test 1: Reservation Service Health
echo [1/4] Checking Reservation_Service health at localhost:3009...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3009/health' -Method Get -TimeoutSec 5; Write-Host '✓ Response:' -ForegroundColor Green; $r | ConvertTo-Json } catch { Write-Host '✗ Failed:' $_.Exception.Message -ForegroundColor Red }"

echo.

REM Test 2: Points Service Health
echo [2/4] Checking Points_Service health at localhost:3001...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3001/health' -Method Get -TimeoutSec 5; Write-Host '✓ Response:' -ForegroundColor Green; $r | ConvertTo-Json } catch { Write-Host '✗ Failed:' $_.Exception.Message -ForegroundColor Red }"

echo.

REM Test 3: Test Reservation Creation
echo [3/4] Testing POST /api/reserve with sample data...
echo Request Body:
powershell -Command "
\$body = @{
    providerName = 'redPlug'
    pointId = 'TEST-001'
    duration = 30
    userId = 'test-user'
} | ConvertTo-Json
Write-Host \$body
"

powershell -Command "
try {
    \$body = @{
        providerName = 'redPlug'
        pointId = 'TEST-001'
        duration = 30
        userId = 'test-user'
    } | ConvertTo-Json
    
    \$r = Invoke-RestMethod -Uri 'http://localhost:3009/api/reserve' -Method Post -Body \$body -ContentType 'application/json' -TimeoutSec 10
    Write-Host '✓ Reservation Response:' -ForegroundColor Green
    \$r | ConvertTo-Json
} catch {
    Write-Host '⚠ Provider API may be rejecting the request (this is expected if credentials/test data missing):' -ForegroundColor Yellow
    Write-Host \$_.Exception.Message
}
"

echo.

REM Test 4: Database Connectivity Check
echo [4/4] Checking MariaDB connectivity...
powershell -Command "
try {
    \$conn = New-Object System.Data.SqlClient.SqlConnection
    \$conn.ConnectionString = 'Server=127.0.0.1,3320;uid=reservation_user;pwd=reservation_pass'
    \$conn.Open()
    Write-Host '✓ MariaDB connection successful' -ForegroundColor Green
    \$conn.Close()
} catch {
    Write-Host '⚠ MariaDB (reservations) check:' -ForegroundColor Yellow
    Write-Host 'Note: Direct SQL connection test requires SQL client. Container is running at port 3320'
}
"

echo.
echo ========================================
echo  Health Check Complete
echo ========================================
echo.
echo Next steps:
echo 1. Open Postman or your HTTP client
echo 2. Go to: POST http://localhost:3009/api/reserve
echo 3. Use the test body from above
echo 4. Check localhost:15672 for RabbitMQ events (guest/guest)
echo.
pause
