#!/usr/bin/env python3
"""
Local testing script for Flask app
Tests the Flask app directly without Vercel
"""
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test that all imports work"""
    print("🧪 Testing imports...")
    try:
        from app import app
        print("✅ Successfully imported Flask app")
        print(f"   Flask app instance: {app}")
        return app
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        print("\n💡 Tip: Install dependencies with:")
        print("   pip install -r requirements.txt")
        return None

def test_routes(app):
    """Test that routes are registered"""
    print("\n🧪 Testing route registration...")
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': sorted(rule.methods),
            'path': str(rule)
        })
    
    print(f"✅ Found {len(routes)} routes:")
    api_routes = [r for r in routes if r['path'].startswith('/api')]
    print(f"   - {len(api_routes)} API routes")
    
    # Show first 10 API routes
    print("\n   API Routes:")
    for route in api_routes[:10]:
        methods = ', '.join([m for m in route['methods'] if m != 'OPTIONS' and m != 'HEAD'])
        print(f"     {methods:8} {route['path']}")
    
    if len(api_routes) > 10:
        print(f"     ... and {len(api_routes) - 10} more")
    
    return routes

def test_app_config(app):
    """Test Flask app configuration"""
    print("\n🧪 Testing Flask app configuration...")
    print(f"   Debug mode: {app.debug}")
    print(f"   Testing mode: {app.testing}")
    print(f"   Secret key set: {app.secret_key is not None}")

def run_test_server(app):
    """Run a test server"""
    print("\n🚀 Starting test server...")
    print("   Server will run on http://localhost:5000")
    print("   Press Ctrl+C to stop")
    print("\n   Test endpoints:")
    print("     http://localhost:5000/api/status")
    print("     http://localhost:5000/api/test")
    print("     http://localhost:5000/api/theme")
    print("     http://localhost:5000/api/groups")
    print("\n" + "="*50)
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=True)
    except KeyboardInterrupt:
        print("\n\n✅ Server stopped")

if __name__ == '__main__':
    print("="*50)
    print("SoundDrop Local Testing")
    print("="*50)
    
    app = test_imports()
    if app is None:
        sys.exit(1)
    
    routes = test_routes(app)
    test_app_config(app)
    
    # Ask if user wants to start server
    print("\n" + "="*50)
    response = input("\nStart test server? (y/n): ").strip().lower()
    if response == 'y':
        run_test_server(app)
    else:
        print("\n✅ Import tests passed! Run with 'python test_local.py' and type 'y' to start server.")
