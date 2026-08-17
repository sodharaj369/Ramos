@echo off
setlocal enabledelayedexpansion

echo ========================================
echo      STARTING SALES INTEL LOCAL APP
echo ========================================
echo.

rem 1. Check Docker CLI
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker CLI ^(docker^) is not installed or not in your PATH.
    echo Please install Docker Desktop and try again.
    echo.
    exit /b 1
)

rem 2. Check Docker Desktop daemon
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker Desktop is not running.
    echo Please start Docker Desktop and wait for it to initialize, then run this script again.
    echo.
    exit /b 1
)

echo [OK] Docker environment verified.
echo.

rem 3. Check Port 8080 (Sales Intel Web App)
set "APP_ALREADY_RUNNING=0"
call :check_http_health "http://localhost:8080"
if %ERRORLEVEL% equ 0 (
    set "APP_ALREADY_RUNNING=1"
    echo [INFO] Sales Intel web server is already responding on http://localhost:8080
) else (
    call :check_port_occupied 8080 > "%TEMP%\port_8080_check.txt" 2>&1
    if !ERRORLEVEL! neq 0 (
        set /p PORT_8080_INFO=<"%TEMP%\port_8080_check.txt"
        echo [FAIL] Port 8080 is occupied by another process: !PORT_8080_INFO!
        echo Cannot start Sales Intel web app on port 8080.
        echo.
    )
)

rem 4. Check Port 8081 (Email Verifier Container)
set "FORCE_REBUILD=0"
if /i "%~1"=="rebuild" set "FORCE_REBUILD=1"
if /i "%~1"=="--rebuild" set "FORCE_REBUILD=1"

if "!FORCE_REBUILD!"=="1" (
    echo [INFO] Rebuild requested. Stopping existing container sales-intel-email-verifier if active...
    docker stop sales-intel-email-verifier >nul 2>&1
    docker rm sales-intel-email-verifier >nul 2>&1
    echo Building Email Verifier Docker image ^(email-verifier-service^)...
    docker build -t email-verifier-service "%~dp0email-verifier-service"
)

set "VERIFIER_ALREADY_RUNNING=0"
call :check_container_status sales-intel-email-verifier > "%TEMP%\verifier_status.txt" 2>&1
set /p VERIFIER_STATUS=<"%TEMP%\verifier_status.txt"

if "!VERIFIER_STATUS!"=="RUNNING" (
    set "VERIFIER_ALREADY_RUNNING=1"
    echo [INFO] Container sales-intel-email-verifier is already running on port 8081.
) else (
    if "!VERIFIER_STATUS!"=="STOPPED" (
        echo Starting existing container sales-intel-email-verifier...
        docker start sales-intel-email-verifier >nul 2>&1
    ) else (
        call :check_port_occupied 8081 > "%TEMP%\port_8081_check.txt" 2>&1
        if !ERRORLEVEL! neq 0 (
            set /p PORT_8081_INFO=<"%TEMP%\port_8081_check.txt"
            echo [FAIL] Port 8081 is occupied by an external process: !PORT_8081_INFO!
            echo Cannot start Email Verifier service.
            echo.
        ) else (
            docker image inspect email-verifier-service >nul 2>&1
            if !ERRORLEVEL! neq 0 (
                echo Building Email Verifier Docker image ^(email-verifier-service^)...
                docker build -t email-verifier-service "%~dp0email-verifier-service"
                if !ERRORLEVEL! neq 0 (
                    echo [ERROR] Failed to build email-verifier-service Docker image.
                )
            )
            echo Launching Email Verifier container ^(sales-intel-email-verifier^)...
            docker run -d --name sales-intel-email-verifier -p 8081:8080 -e PORT=8080 email-verifier-service >nul 2>&1
        )
    )
)

rem 5. Check Port 8082 (Google Maps Scraper Container)
set "GMAPS_ALREADY_RUNNING=0"
call :check_container_status sales-intel-gmaps > "%TEMP%\gmaps_status.txt" 2>&1
set /p GMAPS_STATUS=<"%TEMP%\gmaps_status.txt"

if "!GMAPS_STATUS!"=="RUNNING" (
    set "GMAPS_ALREADY_RUNNING=1"
    echo [INFO] Container sales-intel-gmaps is already running on port 8082.
) else (
    if "!GMAPS_STATUS!"=="STOPPED" (
        echo Starting existing container sales-intel-gmaps...
        docker start sales-intel-gmaps >nul 2>&1
    ) else (
        call :check_port_occupied 8082 > "%TEMP%\port_8082_check.txt" 2>&1
        if !ERRORLEVEL! neq 0 (
            set /p PORT_8082_INFO=<"%TEMP%\port_8082_check.txt"
            echo [FAIL] Port 8082 is occupied by an external process: !PORT_8082_INFO!
            echo Cannot start Google Maps scraper service.
            echo.
        ) else (
            echo Launching Google Maps scraper container ^(sales-intel-gmaps^)...
            docker run -d --name sales-intel-gmaps -p 8082:8080 gosom/google-maps-scraper -web >nul 2>&1
        )
    )
)

rem 6. Start Sales Intel web app in separate window if not running
if "!APP_ALREADY_RUNNING!"=="0" (
    call :check_port_occupied 8080 >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo Launching Sales Intel web app in dedicated window...
        start "Sales Intel Web App" cmd /k "cd /d %~dp0. && npm run dev -- --port 8080"
    )
)

rem 7. Open Docker log view windows
call :check_container_status sales-intel-email-verifier > "%TEMP%\verifier_status.txt" 2>&1
set /p VERIFIER_STATUS=<"%TEMP%\verifier_status.txt"
if "!VERIFIER_STATUS!"=="RUNNING" (
    start "Sales Intel - Email Verifier Logs" cmd /c "docker logs -f sales-intel-email-verifier"
)

call :check_container_status sales-intel-gmaps > "%TEMP%\gmaps_status.txt" 2>&1
set /p GMAPS_STATUS=<"%TEMP%\gmaps_status.txt"
if "!GMAPS_STATUS!"=="RUNNING" (
    start "Sales Intel - Google Maps Logs" cmd /c "docker logs -f sales-intel-gmaps"
)

echo.
echo Waiting for services to respond...
echo.

rem 8. Health Checks Polling
set "STATUS_APP=FAIL"
set "STATUS_VERIFIER=FAIL"
set "STATUS_GMAPS=FAIL"

set "MAX_POLLS=15"

for /l %%k in (1,1,%MAX_POLLS%) do (
    if "!STATUS_APP!"=="FAIL" (
        call :check_http_health "http://localhost:8080"
        if !ERRORLEVEL! equ 0 set "STATUS_APP=OK"
    )
    if "!STATUS_VERIFIER!"=="FAIL" (
        call :check_http_health "http://localhost:8081/health"
        if !ERRORLEVEL! equ 0 set "STATUS_VERIFIER=OK"
    )
    if "!STATUS_GMAPS!"=="FAIL" (
        call :check_http_health "http://localhost:8082"
        if !ERRORLEVEL! equ 0 set "STATUS_GMAPS=OK"
    )

    if "!STATUS_APP!"=="OK" if "!STATUS_VERIFIER!"=="OK" if "!STATUS_GMAPS!"=="OK" goto :health_done
    ping 127.0.0.1 -n 3 >nul
)

:health_done

echo ========================================
echo        SALES INTEL LOCAL SERVICES
echo ========================================
if "!STATUS_APP!"=="OK" (
    echo [OK] Sales Intel      :8080
) else (
    echo [FAIL] Sales Intel      :8080
)
if "!STATUS_VERIFIER!"=="OK" (
    echo [OK] Email Verifier   :8081
) else (
    echo [FAIL] Email Verifier   :8081
)
if "!STATUS_GMAPS!"=="OK" (
    echo [OK] Google Maps      :8082
) else (
    echo [FAIL] Google Maps      :8082
)
echo ========================================
echo.

if "!STATUS_APP!"=="OK" (
    echo Web server is ready. Opening http://localhost:8080...
    start http://localhost:8080
) else (
    echo Sales Intel web app did not start or respond on port 8080.
)

del "%TEMP%\port_8080_check.txt" >nul 2>&1
del "%TEMP%\port_8081_check.txt" >nul 2>&1
del "%TEMP%\port_8082_check.txt" >nul 2>&1
del "%TEMP%\verifier_status.txt" >nul 2>&1
del "%TEMP%\gmaps_status.txt" >nul 2>&1

goto :eof

rem ============================================================================
rem SUBROUTINES
rem ============================================================================

:check_http_health
powershell -NoProfile -ExecutionPolicy Bypass -Command "$r = try { (Invoke-WebRequest -Uri '%~1' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop).StatusCode } catch { 0 }; if ($r -ge 200 -and $r -lt 500) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%

:check_port_occupied
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n = Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($n) { $p = Get-Process -Id $n.OwningProcess -ErrorAction SilentlyContinue; Write-Host ($p.ProcessName + ' (PID ' + $n.OwningProcess + ')'); exit 1 } else { exit 0 }"
exit /b %ERRORLEVEL%

:check_container_status
powershell -NoProfile -ExecutionPolicy Bypass -Command "$name = '%~1'; $running = docker ps --filter ('name=' + $name) --format '{{.Names}}'; if ($running -eq $name) { Write-Host 'RUNNING'; exit 0 }; $all = docker ps -a --filter ('name=' + $name) --format '{{.Names}}'; if ($all -eq $name) { Write-Host 'STOPPED'; exit 0 }; Write-Host 'MISSING'; exit 0"
exit /b 0
