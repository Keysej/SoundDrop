# SoundDrop - Vercel Deployment

## Quick Start

1. **Push to GitHub** (new repository)
2. **Import to Vercel:**
   - Go to https://vercel.com/dashboard
   - Click "Add New Project"
   - Import from GitHub
   - Select your repository
   - Click "Deploy"

## Project Structure

```
.
├── api/
│   └── index.py          # Flask serverless function
├── app.py                # Flask application
├── requirements.txt      # Python dependencies
├── vercel.json          # Vercel configuration
├── index.html           # Main page
├── style.css            # Styles
├── script.js            # Frontend JavaScript
└── *.html               # Other pages
```

## API Endpoints

- `GET /api/status` - Health check
- `GET /api/theme` - Get current theme
- `GET /api/groups` - Get research groups
- `GET /api/sound-drops` - Get sound drops
- `POST /api/sound-drops` - Create sound drop

## Configuration

- **Runtime:** Python 3.x (auto-detected)
- **Framework:** Flask (auto-detected)
- **Static Files:** Served from root directory
- **API Routes:** Handled by Flask via `api/index.py`

## Testing

After deployment:
```bash
curl https://your-app.vercel.app/api/status
curl https://your-app.vercel.app/api/theme
```

## Troubleshooting

### 404 Errors
- Check that `api/index.py` exists and imports `app` correctly
- Verify `vercel.json` routing configuration
- Check Vercel function logs in dashboard

### 500 Errors
- Check Vercel function logs
- Verify all dependencies in `requirements.txt`
- Check MongoDB connection (if using)
