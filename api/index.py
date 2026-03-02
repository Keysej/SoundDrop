import sys
import os

# Add parent directory to path so we can import app.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel automatically detects Flask apps - just export the app instance
# The app will handle all routes including /api/* routes
