@echo off
setlocal

echo ===========================================
echo       Remote PC Control - Agent Setup
echo ===========================================
echo.

:: 1. Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org and rerun this script.
    pause
    exit /b 1
)

:: 2. Install dependencies
echo [1/3] Installing agent dependencies...
cd /d "%~dp0agent"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

:: 3. Configure .env if not already present
echo [2/3] Checking configuration...
if not exist .env (
    echo Creating agent/.env with your Render signaling server...
    (
        echo SIGNALING_URL=wss://remote-ou7s.onrender.com
        echo DEVICE_ID=my-pc
        echo PAIRING_TOKEN=d1c0140e801f35b57b0e3c1d3a8329e45f2ab92fdc0ebc3b9be43752aee59675
    ) > .env
    echo Configuration created.
) else (
    echo Configuration file agent/.env already exists.
)

:: 4. Start agent
echo.
echo [3/3] Starting agent...
echo ===========================================
echo  IMPORTANT: DO NOT CLOSE THIS WINDOW!
echo  Keep this terminal open while using remote control.
echo  If you close it, your PC will go offline.
echo ===========================================
call node src/index.js

pause
