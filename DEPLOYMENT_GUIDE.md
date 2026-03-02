# Deployment Guide for SoundDrop on Vercel

## ✅ Configuration Complete

Your Vercel deployment is now configured with:
- ✅ Flask serverless function at `api/index.py`
- ✅ Proper `vercel.json` routing configuration
- ✅ All dependencies in `requirements.txt`

## 🚀 Deployment Steps

### Option 1: Deploy via Vercel CLI

1. **Login to Vercel (if not already):**
   ```bash
   vercel login
   ```

2. **Link your project (if not already linked):**
   ```bash
   vercel link
   ```
   Follow the prompts to connect to your Vercel project.

3. **Deploy:**
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via GitHub

1. **Push changes to GitHub:**
   ```bash
   git add .
   git commit -m "Fix Vercel deployment configuration"
   git push origin main
   ```
   
   Note: Make sure your GitHub repo is connected to Vercel in the Vercel dashboard.

2. **Vercel will automatically deploy** when you push to the main branch.

## 🧪 Testing After Deployment

### 1. Test API Endpoints

Once deployed, test these endpoints:

```bash
# Replace YOUR_DOMAIN with your Vercel domain
DOMAIN="https://your-app.vercel.app"

# Health check
curl $DOMAIN/api/status

# Test endpoint
curl $DOMAIN/api/test

# Get theme
curl $DOMAIN/api/theme

# Get groups
curl $DOMAIN/api/groups
```

### 2. Use the Test Script

```bash
./test_deployment.sh https://your-app.vercel.app
```

### 3. Test in Browser

Visit your Vercel URL and check:
- ✅ Main page loads (`/index.html`)
- ✅ API calls work (check browser console)
- ✅ Static assets load (CSS, JS)

## 🔍 Troubleshooting

### Issue: API endpoints return 404

**Solution:** Check that:
1. `api/index.py` exists and imports `app` correctly
2. `vercel.json` has the correct routing
3. Routes start with `/api/` in Flask app

### Issue: API endpoints return 500

**Solution:** 
1. Check Vercel function logs in dashboard
2. Verify MongoDB connection string is correct
3. Check `requirements.txt` has all dependencies

### Issue: Import errors in logs

**Solution:**
- Ensure `app.py` is in the root directory
- Check that `api/index.py` correctly adds parent directory to path
- Verify Python version compatibility

### Issue: Static files don't load

**Solution:**
- Static files should be served automatically
- Check file paths are relative (not absolute)
- Verify files are committed to git

## 📋 Pre-Deployment Checklist

- [x] `api/index.py` created and imports Flask app
- [x] `vercel.json` configured with correct routes
- [x] `requirements.txt` includes Flask and pymongo
- [ ] MongoDB connection string is correct
- [ ] All static files are in repository
- [ ] Test script created (`test_deployment.sh`)

## 🔗 Useful Links

- Vercel Dashboard: https://vercel.com/dashboard
- Function Logs: Check in Vercel dashboard under your project → Functions
- Flask on Vercel Docs: https://vercel.com/docs/frameworks/backend/flask

## 📝 Next Steps After Successful Deployment

1. Test all API endpoints
2. Verify MongoDB connection works
3. Test the frontend with real API calls
4. Monitor function logs for any errors
5. Set up environment variables if needed (for MongoDB password, etc.)
