#!/bin/bash

echo "🚀 SoundDrop Vercel Deployment"
echo "=============================="
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with:"
    echo "   npm i -g vercel"
    exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Not logged in to Vercel"
    echo ""
    echo "Please login first:"
    echo "   vercel login"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Logged in to Vercel"
echo ""

# Check if project is linked
if [ ! -f ".vercel/project.json" ]; then
    echo "📦 Linking project to Vercel..."
    vercel link
    echo ""
fi

echo "🚀 Deploying to Vercel..."
echo ""

# Deploy to production
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Test your deployment URL"
echo "   2. Run: ./test_deployment.sh https://your-project.vercel.app"
echo "   3. Check Vercel dashboard for logs"
