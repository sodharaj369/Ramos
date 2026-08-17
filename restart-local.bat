@echo off
setlocal

echo ========================================
echo     RESTARTING SALES INTEL SERVICES
echo ========================================
echo.

call "%~dp0stop-local.bat"

echo.
echo Waiting 2 seconds before startup...
ping 127.0.0.1 -n 3 >nul
echo.

call "%~dp0start-local.bat"
