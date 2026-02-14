@echo off
cls
echo ============================================
echo   OwnDc - Railway Deployment Script
echo ============================================
echo.

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js/npm is not installed!
    echo Please install Node.js first: https://nodejs.org
    pause
    exit /b 1
)

echo [Step 1/6] Installing Railway CLI...
echo.

REM Install Railway CLI globally
npm install -g @railway/cli

if errorlevel 1 (
    echo [ERROR] Failed to install Railway CLI
    pause
    exit /b 1
)

echo.
echo [OK] Railway CLI installed
echo.

REM Check if railway.json exists
if not exist railway.json (
    echo [Step 2/6] Creating railway.json...
    (
        echo {
        echo   "$schema": "https://railway.app/railway.schema.json",
        echo   "build": {
        echo     "builder": "NIXPACKS"
        echo   },
        echo   "deploy": {
        echo     "startCommand": "npm start",
        echo     "healthcheckPath": "/",
        echo     "restartPolicyType": "ON_FAILURE"
        echo   }
        echo }
    ) > railway.json
    echo [OK] railway.json created
) else (
    echo [OK] railway.json already exists
)

echo.
echo [Step 3/6] Logging in to Railway...
echo.
echo A browser window will open. Please login with your Railway account.
echo.

railway login

if errorlevel 1 (
    echo [ERROR] Login failed
    pause
    exit /b 1
)

echo.
echo [OK] Logged in successfully
echo.
echo [Step 4/6] Initializing Railway project...
echo.
echo Select "Create a new project" and give it a name
echo.

railway init

if errorlevel 1 (
    echo [ERROR] Failed to initialize project
    pause
    exit /b 1
)

echo.
echo [OK] Project initialized
echo.
echo [Step 5/6] Deploying to Railway...
echo.
echo This may take a few minutes...
echo.

railway up

if errorlevel 1 (
    echo [ERROR] Deployment failed
    pause
    exit /b 1
)

echo.
echo [OK] Deployment successful!
echo.
echo [Step 6/6] Getting your app URL...
echo.

railway domain

echo.
echo ============================================
echo   DEPLOYMENT COMPLETE! 
echo ============================================
echo.
echo Your app is now live on Railway!
echo.
echo Next steps:
echo 1. Set environment variables: railway variables set SESSION_SECRET=your-secret
echo 2. View logs: railway logs
echo 3. Open app: railway open
echo.
echo To redeploy later, just run: railway up
echo.
pause
