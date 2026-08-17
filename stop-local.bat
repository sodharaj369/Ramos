@echo off
setlocal enabledelayedexpansion

echo ========================================
echo       STOPPING SALES INTEL SERVICES
echo ========================================
echo.

rem 1. Stop Sales Intel dev server if running on port 8080
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($n) { $p = Get-Process -Id $n.OwningProcess -ErrorAction SilentlyContinue; if ($p.ProcessName -eq 'node') { Stop-Process -Id $n.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped Sales Intel dev server (PID ' + $n.OwningProcess + ')') } else { Write-Host ('Port 8080 is occupied by non-node process ' + $p.ProcessName + ' (PID ' + $n.OwningProcess + '). Skipped.') } } else { Write-Host 'Sales Intel dev server is not running on port 8080.' }"

echo.

rem 2. Stop Docker containers
echo Stopping Docker containers (sales-intel-email-verifier, sales-intel-gmaps)...
docker stop sales-intel-email-verifier sales-intel-gmaps >nul 2>&1
docker rm sales-intel-email-verifier sales-intel-gmaps >nul 2>&1

echo.
echo ========================================
echo    SALES INTEL SERVICES STOPPED cleanly
echo ========================================
echo.
