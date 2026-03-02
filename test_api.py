#!/usr/bin/env python3
"""
Test API endpoints locally
Run this while the Flask server is running on port 5000
"""
import requests
import json
import sys

BASE_URL = "http://localhost:5000"

def test_endpoint(name, url, method="GET", data=None):
    """Test an API endpoint"""
    print(f"\n🧪 Testing {name}...")
    print(f"   {method} {url}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=5)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=5)
        else:
            print(f"   ❌ Unsupported method: {method}")
            return False
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"   ✅ Success!")
                print(f"   Response: {json.dumps(data, indent=2)[:200]}...")
                return True
            except:
                print(f"   ✅ Success! (non-JSON response)")
                print(f"   Response: {response.text[:200]}...")
                return True
        else:
            print(f"   ❌ Failed with status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"   ❌ Connection failed - is the server running on {BASE_URL}?")
        print(f"   💡 Start server with: ./start_local_server.sh")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def main():
    print("="*60)
    print("SoundDrop API Local Testing")
    print("="*60)
    print(f"\nTesting against: {BASE_URL}")
    print("\nMake sure the Flask server is running!")
    print("Start it with: ./start_local_server.sh")
    print("="*60)
    
    results = []
    
    # Test basic endpoints
    results.append(("Status", test_endpoint("API Status", f"{BASE_URL}/api/status")))
    results.append(("Test", test_endpoint("API Test", f"{BASE_URL}/api/test")))
    results.append(("Theme", test_endpoint("API Theme", f"{BASE_URL}/api/theme")))
    results.append(("Groups", test_endpoint("API Groups", f"{BASE_URL}/api/groups")))
    results.append(("Sound Drops", test_endpoint("API Sound Drops", f"{BASE_URL}/api/sound-drops?group=default")))
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status} - {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Your API is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        sys.exit(1)
