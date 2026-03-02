# Setup Guide for New GitHub Repository

## Files Ready for Deployment ✅

All necessary files are configured and ready:

### Core Files:
- ✅ `api/index.py` - Flask serverless function wrapper
- ✅ `app.py` - Flask application
- ✅ `requirements.txt` - Python dependencies
- ✅ `vercel.json` - Vercel configuration

### Static Files (need to be in `public/` folder):
- `index.html`
- `style.css`
- `script.js`
- `about.html`
- `admin.html`
- `contact.html`
- `archive.html`
- `archive.js`
- Other HTML/CSS/JS files

## Important: Vercel Static Files Requirement

Vercel requires static files to be in a `public/` directory. 

### Option 1: Move files to public/ (Recommended)
```bash
mkdir public
mv *.html *.css *.js public/ 2>/dev/null || true
# Keep api/, app.py, requirements.txt, vercel.json in root
```

### Option 2: Update vercel.json to serve from root
The current vercel.json should work, but Vercel best practice is `public/` folder.

## Deployment Steps

1. **Create new GitHub repository**
2. **Push all files** to the new repo
3. **In Vercel Dashboard:**
   - Add New Project
   - Import from GitHub
   - Select your new repository
   - Vercel will auto-detect Python/Flask
   - Click Deploy

## Current Configuration

The `vercel.json` is configured to:
- Route `/api/*` → Flask function (`api/index.py`)
- Serve static files from root (or `public/` if you move them)
- Route `/` → `index.html`

## Testing

After deployment, test:
```bash
./test_deployment.sh https://your-new-app.vercel.app
```
