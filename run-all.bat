@echo off
setlocal

echo ===================================================
echo     CityMart Invoice Portal Bot Runner
echo ===================================================

REM Remove stale endpoint file if it exists
if exist browser-endpoint.json del /f /q browser-endpoint.json

echo Starting browser server in background...
start "" node scripts/browser-server.js

echo Waiting for browser server to be ready...
:WAIT_LOOP
if exist browser-endpoint.json goto READY
timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:READY
echo Browser server is ready!
timeout /t 2 /nobreak >nul

echo.
echo Running login check / auto-login...
node scripts/auto-login.js
if errorlevel 1 (
  echo.
  echo [ERROR] Login was not completed or failed.
  echo Please make sure you are logged in before running the scraper.
  pause
  exit /b 1
)

echo.
echo Launching invoice scraper bot...
node src/bot.js
if errorlevel 1 (
  echo.
  echo [ERROR] Bot encountered an issue during execution.
  pause
  exit /b 1
)

echo.
echo ===================================================
echo Process completed! Browser window remains active.
echo ===================================================
pause
