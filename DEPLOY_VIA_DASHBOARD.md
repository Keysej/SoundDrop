# Deploy via Vercel Dashboard - Step by Step

## Quick Deployment Guide

### Step 1: Go to Your Vercel Dashboard
Visit: https://vercel.com/jimale-keyses-projects

### Step 2: Add New Project or Select Existing

**If you don't have a project yet:**
1. Click **"Add New Project"** button
2. Click **"Import Git Repository"**
3. Select **"Keysej/Audio-hub"** from the list
4. Click **"Import"**

**If you already have the project:**
1. Find your project in the list
2. Click on it to open
3. Go to **"Settings"** → **"Git"**
4. Make sure it's connected to `Keysej/Audio-hub`

### Step 3: Configure Project Settings

Vercel should auto-detect your configuration, but verify:

**Framework Preset:** 
- Should auto-detect as "Other" or "Python"
- If not, select "Other"

**Root Directory:** 
- Leave as `.` (root)

**Build Command:** 
- Leave empty (Vercel handles Python automatically)

**Output Directory:** 
- Leave empty

**Install Command:** 
- Leave empty (Vercel uses `requirements.txt` automatically)

### Step 4: Environment Variables (if needed)

If your MongoDB connection needs environment variables:
1. Go to **"Settings"** → **"Environment Variables"**
2. Add any needed variables
3. For now, MongoDB URI is in code, so you can skip this

### Step 5: Deploy!

1. Click **"Deploy"** button
2. Wait for build to complete (usually 1-2 minutes)
3. You'll see build logs in real-time

### Step 6: Test Your Deployment

Once deployed, you'll get a URL like:
- `https://your-project.vercel.app`
- Or `https://your-project-username.vercel.app`

Test the API:
```bash
# Replace with your actual URL
curl https://your-project.vercel.app/api/status
curl https://your-project.vercel.app/api/theme
```

Or use the test script:
```bash
./test_deployment.sh https://your-project.vercel.app
```

## What Vercel Will Auto-Detect

✅ **Python Runtime** - From `requirements.txt`
✅ **Flask App** - From `api/index.py`
✅ **Routes** - From `vercel.json`
✅ **Dependencies** - From `requirements.txt`

## Troubleshooting

### If Build Fails:
1. Check **"Deployments"** → Click on failed deployment → **"Logs"**
2. Look for Python import errors
3. Common issues:
   - Missing dependencies in `requirements.txt`
   - Import path issues in `api/index.py`
   - MongoDB connection errors (these are OK, app will use file storage)

### If API Returns 404:
1. Check `vercel.json` routing configuration
2. Verify `api/index.py` exists and imports `app` correctly
3. Check function logs in Vercel dashboard

### If API Returns 500:
1. Check function logs in Vercel dashboard
2. Look for Python errors
3. Check MongoDB connection (if using)

## Files Vercel Needs (All Ready ✅)

- ✅ `api/index.py` - Flask serverless function
- ✅ `vercel.json` - Routing configuration  
- ✅ `requirements.txt` - Python dependencies
- ✅ `app.py` - Flask application
- ✅ Static files (HTML, CSS, JS) - Will be served automatically

## After Successful Deployment

1. **Test all endpoints:**
   ```bash
   ./test_deployment.sh https://your-project.vercel.app
   ```

2. **Check function logs:**
   - Dashboard → Your Project → Functions → `api/index.py`
   - Look for any errors or warnings

3. **Update frontend (if needed):**
   - Make sure `script.js` uses relative paths for API calls
   - Test the frontend at your Vercel URL

4. **Set up custom domain (optional):**
   - Settings → Domains → Add your domain
