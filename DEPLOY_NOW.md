# Deploy to Vercel - Quick Guide

## Option 1: Deploy via Vercel CLI (Recommended)

### Step 1: Login to Vercel
```bash
vercel login
```
- Select "Continue with GitHub" (or your preferred method)
- Complete authentication in browser

### Step 2: Link Project (if first time)
```bash
vercel link
```
- Follow prompts to link to existing project or create new one

### Step 3: Deploy
```bash
vercel --prod
```
- This will deploy to production
- You'll get a URL like: `https://your-project.vercel.app`

## Option 2: Deploy via GitHub (If repo connected)

### Step 1: Commit changes
```bash
git add .
git commit -m "Fix Vercel deployment configuration"
```

### Step 2: Push to GitHub
```bash
git push origin main
```

### Step 3: Vercel auto-deploys
- Vercel will automatically detect the push
- Check Vercel dashboard for deployment status

## After Deployment

### Test your deployment:
```bash
# Replace with your actual Vercel URL
./test_deployment.sh https://your-project.vercel.app
```

### Check deployment:
1. Go to https://vercel.com/dashboard
2. Find your project
3. Click on the latest deployment
4. Check "Functions" tab for logs
5. Test the URL

## Troubleshooting

### If deployment fails:
1. Check Vercel dashboard → Functions → Logs
2. Look for Python import errors
3. Verify `requirements.txt` includes all dependencies
4. Check that `api/index.py` exists

### Common issues:
- **Import errors**: Make sure `app.py` is in root directory
- **404 on API routes**: Check `vercel.json` routing
- **500 errors**: Check function logs for Python errors

## Files Ready for Deployment:
✅ `api/index.py` - Flask serverless function wrapper
✅ `vercel.json` - Vercel configuration
✅ `requirements.txt` - Python dependencies
✅ `app.py` - Flask application
