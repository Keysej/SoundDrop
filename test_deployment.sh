#!/bin/bash

echo "🧪 Testing Vercel Deployment Configuration"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="${1:-http://localhost:3000}"

echo "Testing against: $BASE_URL"
echo ""

# Test 1: API Status endpoint
echo "1️⃣ Testing /api/status endpoint..."
STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/status")
HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
BODY=$(echo "$STATUS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Status endpoint working!${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Status endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 2: API Test endpoint
echo "2️⃣ Testing /api/test endpoint..."
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/test")
HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
BODY=$(echo "$TEST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Test endpoint working!${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Test endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 3: API Theme endpoint
echo "3️⃣ Testing /api/theme endpoint..."
THEME_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/theme")
HTTP_CODE=$(echo "$THEME_RESPONSE" | tail -n1)
BODY=$(echo "$THEME_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Theme endpoint working!${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Theme endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 4: API Groups endpoint
echo "4️⃣ Testing /api/groups endpoint..."
GROUPS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/groups")
HTTP_CODE=$(echo "$GROUPS_RESPONSE" | tail -n1)
BODY=$(echo "$GROUPS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Groups endpoint working!${NC}"
    echo "Response: $BODY"
else
    echo -e "${RED}❌ Groups endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
fi
echo ""

# Test 5: Static file (index.html)
echo "5️⃣ Testing static file serving (index.html)..."
HTML_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/index.html")
HTTP_CODE=$(echo "$HTML_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Static files working!${NC}"
else
    echo -e "${YELLOW}⚠️ Static files may not be configured (HTTP $HTTP_CODE)${NC}"
fi
echo ""

echo "=========================================="
echo "Test complete!"
echo ""
echo "To test against production, run:"
echo "  ./test_deployment.sh https://your-domain.vercel.app"
