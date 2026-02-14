# Deploy to Railway Without GitHub

## Method 1: Railway CLI (Recommended)

### Step 1: Install Railway CLI

**Windows (PowerShell):**
```powershell
powershell -Command "iwr https://railway.app/install.ps1 -useb | iex"
```

**Mac/Linux:**
```bash
curl -fsSL https://railway.app/install.sh | sh
```

### Step 2: Login to Railway
```bash
railway login
```
This will open a browser window to authenticate.

### Step 3: Initialize Your Project

Navigate to your project folder:
```bash
cd C:\Users\Alex\Downloads\OwnDc3
```

Initialize Railway project:
```bash
railway init
```

Select "Empty Project" or create new.

### Step 4: Deploy
```bash
railway up
```

Your app will deploy and you'll get a URL like:
`https://owndc-production.up.railway.app`

### Step 5: Set Environment Variables (if needed)
```bash
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=your-secret-key-here
```

---

## Method 2: Railway Dashboard + ZIP Upload

### Step 1: Create Project
1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Empty Project"

### Step 2: Prepare Your Files

Create a `railway.json` file in your project:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Step 3: Upload via Dashboard

**Option A: Direct Upload**
1. In Railway dashboard, go to your project
2. Click on "Deploy" tab
3. Select "Upload" 
4. Upload your entire project folder as ZIP

**Option B: Git Integration (if you change your mind)**
1. Click "Connect Repo"
2. Follow GitHub connection steps

### Step 4: Add Environment Variables

In Railway dashboard:
1. Go to "Variables" tab
2. Add:
   - `NODE_ENV` = `production`
   - `PORT` = `3000` (Railway sets this automatically)
   - `SESSION_SECRET` = `your-random-secret-key`

### Step 5: Deploy

Railway will automatically deploy after upload.

---

## Method 3: Using Railway's nixpacks.toml

Create `nixpacks.toml` in your project root:

```toml
[phases.build]
cmds = ['npm install']

[phases.setup]
nixPkgs = ['nodejs', 'npm']

[start]
cmd = 'npm start'
```

Then use Railway CLI:
```bash
railway login
railway init
railway up
```

---

## Important Files for Railway

Make sure these files exist in your project:

### 1. `package.json` (must have start script)
```json
{
  "name": "owndc",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2. `Procfile` (alternative)
```
web: npm start
```

### 3. `.railwayignore` (optional)
Create this to exclude files:
```
node_modules/
*.log
.env
.DS_Store
```

---

## Step-by-Step Complete Guide

### 1. Open Terminal in Project Folder

**Windows:**
```cmd
cd C:\Users\Alex\Downloads\OwnDc3
```

### 2. Create railway.json

Create a file named `railway.json` with this content:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 3. Login to Railway

```bash
railway login
```

### 4. Create New Project

```bash
railway init
```

You'll see options:
- Create new project
- Select existing project

Choose "Create new project" and name it `owndc`

### 5. Deploy

```bash
railway up
```

This will:
- Install dependencies
- Build your app
- Deploy to Railway
- Show you the URL

### 6. Get Your URL

After deployment:
```bash
railway domain
```

Or check the Railway dashboard for the URL.

### 7. View Logs

```bash
railway logs
```

---

## Troubleshooting

### Port Issue
Railway automatically sets PORT environment variable. Make sure your server.js uses:
```javascript
const PORT = process.env.PORT || 3000;
```

### Database Issue
Railway's filesystem is ephemeral. Your SQLite database will reset on each deploy.

**Solution:** Add Railway Database
```bash
railway add --database
```

Or use Railway's PostgreSQL:
1. Go to Railway dashboard
2. Click "New" → "Database" → "Add PostgreSQL"
3. Use DATABASE_URL in your app

### Environment Variables
Set them via CLI:
```bash
railway variables set KEY=VALUE
```

Or in dashboard under "Variables" tab.

---

## Quick Commands Reference

```bash
# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# View status
railway status

# View logs
railway logs

# Open in browser
railway open

# Get domain/URL
railway domain

# Set environment variable
railway variables set KEY=VALUE

# List variables
railway variables

# Connect to database (if using Railway Postgres)
railway connect
```

---

## Alternative: Railway Dashboard Only

If you don't want to use CLI at all:

1. Go to https://railway.app/new
2. Click "Deploy Template"
3. Or click "Empty Project"
4. Go to "Deployments" tab
5. Click "Upload" 
6. Zip your project folder (without node_modules)
7. Upload the ZIP
8. Add environment variables
9. Railway will auto-deploy

**Note:** Railway's free tier includes:
- 500 hours/month
- 1GB RAM
- 1GB disk
- Automatic HTTPS

---

## URL Format

Once deployed, your app will be at:
`https://owndc-production.up.railway.app`

Or you can add a custom domain in Railway dashboard under "Settings" → "Domains"

---

## Deploy Now - Quick Command

Open terminal in your project folder and run:

```bash
cd C:\Users\Alex\Downloads\OwnDc3

# Install Railway CLI if not installed
npm install -g @railway/cli

# Login
railway login

# Initialize (creates new project)
railway init

# Deploy
railway up

# Get URL
railway domain
```

**Done!** 🚀
