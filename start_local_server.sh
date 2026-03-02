#!/bin/bash

echo "🚀 Starting SoundDrop Local Test Server"
echo "========================================"
echo ""

# Check if dependencies are installed
if ! python3 -c "import flask" 2>/dev/null; then
    echo "⚠️  Flask not found. Installing dependencies..."
    python3 -m pip install --user -r requirements.txt
fi

echo "✅ Starting Flask development server..."
echo ""
echo "📍 Server will be available at: http://localhost:5000"
echo ""
echo "🧪 Test these endpoints:"
echo "   - http://localhost:5000/api/status"
echo "   - http://localhost:5000/api/test"
echo "   - http://localhost:5000/api/theme"
echo "   - http://localhost:5000/api/groups"
echo ""
echo "📝 Press Ctrl+C to stop the server"
echo ""
echo "========================================"
echo ""

# Start Flask server
cd "$(dirname "$0")"
python3 -c "
from app import app
print('✅ Flask app loaded successfully!')
print('')
app.run(host='0.0.0.0', port=5000, debug=True)
"
