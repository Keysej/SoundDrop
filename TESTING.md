# Testing Vercel Deployment

## Quick Test Guide

### Option 1: Test Locally with Vercel CLI

1. **Start the local dev server:**
   ```bash
   vercel dev
   ```
   This will start a local server (usually on port 3000) that mimics Vercel's production environment.

2. **Run the test script:**
   ```bash
   ./test_deployment.sh http://localhost:3000
   ```

3. **Or test manually:**
   ```bash
   # Test API status
   curl http://localhost:3000/api/status
   
   # Test API theme
   curl http://localhost:3000/api/theme
   
   # Test API groups
   curl http://localhost:3000/api/groups
   ```

### Option 2: Deploy and Test on Vercel

1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```
   Or push to GitHub if Vercel is connected to your repo.

2. **Get your deployment URL** from Vercel dashboard or CLI output.

3. **Test production:**
   ```bash
   ./test_deployment.sh https://your-app.vercel.app
   ```

## Expected API Endpoints

All endpoints should return JSON:

- `GET /api/status` - Health check and data status
- `GET /api/test` - Simple test endpoint
- `GET /api/theme` - Get current theme
- `GET /api/groups` - Get available research groups
- `GET /api/sound-drops` - Get sound drops (requires group parameter)
- `POST /api/sound-drops` - Create new sound drop
- `GET /api/research/status` - Research data status

## Troubleshooting

### If API endpoints return 404:
- Check that `api/index.py` exists and imports `app` correctly
- Verify `vercel.json` routes `/api/*` to `api/index.py`
- Check Vercel build logs for Python import errors

### If API endpoints return 500:
- Check Vercel function logs for Python errors
- Verify `requirements.txt` includes all dependencies
- Check MongoDB connection (if using)

### If static files don't load:
- Static files (HTML, CSS, JS) should be served automatically
- Check that files are in the root directory
- Verify file paths in HTML are correct

## Manual Verification Checklist

- [ ] `/api/status` returns `{"status": "healthy", ...}`
- [ ] `/api/test` returns `{"test": "success", ...}`
- [ ] `/api/theme` returns theme JSON
- [ ] `/api/groups` returns groups JSON
- [ ] `index.html` loads correctly
- [ ] Static assets (CSS, JS) load correctly
