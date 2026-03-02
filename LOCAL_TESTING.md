# Local Testing Guide

## Quick Start

### 1. Install Dependencies (if not already done)
```bash
pip install -r requirements.txt
```

### 2. Start the Flask Server

**Option A: Use the convenience script**
```bash
./start_local_server.sh
```

**Option B: Run directly**
```bash
python3 -c "from app import app; app.run(host='0.0.0.0', port=5000, debug=True)"
```

**Option C: Use Flask CLI**
```bash
export FLASK_APP=app.py
flask run --host=0.0.0.0 --port=5000
```

The server will start on **http://localhost:5000**

### 3. Test the API Endpoints

**Option A: Use the test script** (requires `requests` library)
```bash
# Install requests if needed
pip install requests

# Run tests
python3 test_api.py
```

**Option B: Test manually with curl**
```bash
# Test status endpoint
curl http://localhost:5000/api/status

# Test theme endpoint
curl http://localhost:5000/api/theme

# Test groups endpoint
curl http://localhost:5000/api/groups

# Test sound drops endpoint
curl "http://localhost:5000/api/sound-drops?group=default"
```

**Option C: Test in browser**
Open these URLs in your browser:
- http://localhost:5000/api/status
- http://localhost:5000/api/theme
- http://localhost:5000/api/groups

### 4. Test the Frontend

Open `index.html` in your browser, or serve it:
```bash
# Simple HTTP server (Python 3)
python3 -m http.server 8000

# Then open http://localhost:8000/index.html
```

Make sure to update the API URLs in `script.js` if needed (they should work with relative paths).

## Expected Results

### ✅ Successful API Responses

**`/api/status`** should return:
```json
{
  "status": "healthy",
  "drops_count": 0,
  "storage_file": "/tmp/sound_drops.json",
  "timestamp": "2024-..."
}
```

**`/api/test`** should return:
```json
{
  "test": "success",
  "time": "2024-..."
}
```

**`/api/theme`** should return:
```json
{
  "title": "Urban Soundscapes",
  "description": "Capture the sounds...",
  "group_code": "default",
  "rotation_type": "daily"
}
```

**`/api/groups`** should return:
```json
{
  "default": {
    "name": "General Study",
    "description": "...",
    "active": true
  },
  ...
}
```

## Troubleshooting

### Port 5000 Already in Use
```bash
# Find what's using port 5000
lsof -ti:5000

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or use a different port
python3 -c "from app import app; app.run(port=5001)"
```

### Import Errors
```bash
# Make sure dependencies are installed
pip install -r requirements.txt

# Check Python version (should be 3.7+)
python3 --version
```

### MongoDB Connection Issues
- MongoDB connection failures are OK for local testing
- The app will use file-based storage as fallback
- Check `app.py` line 38 for MongoDB URI if needed

### API Returns 404
- Make sure Flask server is running
- Check that routes start with `/api/`
- Verify you're accessing `http://localhost:5000/api/...`

### API Returns 500
- Check Flask server console for error messages
- Verify MongoDB connection string (if using)
- Check that all dependencies are installed

## Testing Checklist

- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] Flask server starts without errors
- [ ] `/api/status` returns 200 OK
- [ ] `/api/test` returns 200 OK
- [ ] `/api/theme` returns theme JSON
- [ ] `/api/groups` returns groups JSON
- [ ] `/api/sound-drops` returns array (may be empty)
- [ ] Frontend loads and can make API calls

## Next Steps

Once local testing passes:
1. ✅ All API endpoints work
2. ✅ Frontend can communicate with API
3. ✅ No errors in console

Then you're ready to deploy to Vercel! See `DEPLOYMENT_GUIDE.md` for deployment instructions.
