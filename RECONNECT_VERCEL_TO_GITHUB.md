# How to Reconnect Vercel to GitHub Repository

## Step-by-Step Guide to Re-import Project

### Option 1: Reconnect Existing Project (Recommended)

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Log in with your GitHub account

2. **Find Your Project**
   - Look for project named `audio-hub` or `Audio-hub`
   - Click on it

3. **Go to Settings**
   - Click "Settings" tab
   - Scroll to "Git" section

4. **Check Repository Connection**
   - Should show: `Keysej/Audio-hub`
   - If disconnected, click "Connect Repository"
   - Select `Keysej/Audio-hub` from the list

5. **Verify Production Branch**
   - Ensure "Production Branch" is set to `main`
   - This ensures deployments come from your main branch

---

### Option 2: Delete and Re-import (If Option 1 Doesn't Work)

1. **Delete Current Project in Vercel**
   - Go to Project Settings
   - Scroll to bottom
   - Click "Delete Project"
   - Confirm deletion

2. **Import Fresh from GitHub**
   - Click "Add New Project" in Vercel dashboard
   - Select "Import Git Repository"
   - Choose `Keysej/Audio-hub`
   - Click "Import"

3. **Configure Project Settings**
   - **Framework Preset**: Other (or leave default)
   - **Root Directory**: `./` (root)
   - **Build Command**: Leave empty (static files)
   - **Output Directory**: Leave empty
   - **Install Command**: Leave empty

4. **Environment Variables** (if needed)
   - Add any required environment variables
   - For MongoDB: Already in `app.py`, no env vars needed

5. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete

---

### Option 3: Update via Vercel CLI (Advanced)

If you have Vercel CLI installed:

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Link to existing project
vercel link

# Deploy
vercel --prod
```

---

## After Reconnecting: Verify Domain

1. **Check Deployment**
   - Go to "Deployments" tab
   - Find the latest deployment
   - Check its status (should be "Ready")

2. **Check Domains**
   - Go to "Settings" → "Domains"
   - Note the Production domain (should be something like `audio-hub-*.vercel.app`)
   - This is your working domain

3. **Update Code**
   - Update `index.html` redirect script with the new domain
   - Update GitHub About section with the new domain

---

## What to Check After Re-import

✅ **Repository Connection**: Shows `Keysej/Audio-hub`  
✅ **Production Branch**: Set to `main`  
✅ **Auto Deploy**: Enabled for main branch  
✅ **Latest Deployment**: Shows recent commits  
✅ **Domain**: Production domain is accessible  

---

## If Domain Changes After Re-import

If Vercel assigns a new domain (e.g., `audio-hub-xyz123.vercel.app`):

1. **Update `index.html` redirect**:
   ```javascript
   const productionDomain = 'audio-hub-xyz123.vercel.app'; // New domain
   ```

2. **Update GitHub About**:
   - Go to: https://github.com/Keysej/Audio-hub/settings
   - Update "Website" field with new domain

3. **Commit and Push**:
   ```bash
   git add index.html
   git commit -m "Update to new Vercel domain"
   git push origin main
   ```

---

## Troubleshooting

**Problem**: Project not showing in Vercel  
**Solution**: Make sure you're logged in with the correct GitHub account

**Problem**: Can't find repository  
**Solution**: Check that repository is public or you have access

**Problem**: Deployment fails  
**Solution**: Check build logs in Vercel dashboard for errors

**Problem**: Domain not working  
**Solution**: Wait a few minutes for DNS propagation, then test

---

## Current Repository Info

- **GitHub URL**: `https://github.com/Keysej/Audio-hub`
- **Repository**: `Keysej/Audio-hub`
- **Branch**: `main`
- **Current Working Domain**: `audio-hub-ten.vercel.app` (may change after re-import)
