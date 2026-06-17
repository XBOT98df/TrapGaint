#!/bin/bash

echo "🚀 Deploying Friend Notification Worker to Cloudflare..."
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler is not installed. Installing..."
    npm install -g wrangler
fi

# Check if logged in
echo "📝 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please login to Cloudflare:"
    wrangler login
fi

# Check if KV namespace ID is set
if grep -q 'id = ""' wrangler.toml; then
    echo ""
    echo "⚠️  KV Namespace not configured!"
    echo "Creating KV namespace..."
    echo ""
    
    # Create KV namespace
    wrangler kv:namespace create "FRIEND_REQUESTS"
    
    echo ""
    echo "📋 Copy the 'id' value from above and paste it into wrangler.toml"
    echo "Then run this script again."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy
echo ""
echo "🚀 Deploying worker..."
npm run deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy the worker URL from above"
echo "2. Update CLOUDFLARE_WORKER_URL in client/src/pages/Launcher.tsx"
echo "3. Restart your app"
echo ""
