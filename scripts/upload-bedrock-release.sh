#!/bin/bash

# Upload Bedrock Edition to GitHub Releases
# This script creates a release tag and uploads the bedrock zip file

set -e

REPO="dhhd67807-lgtm/Block-Launcher"
TAG="bedrock-resources"
ZIP_FILE="src-tauri/resources/bedrock-1.21.13201.zip"

echo "🚀 Uploading Bedrock Edition to GitHub Releases..."

# Check if zip file exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: $ZIP_FILE not found!"
    echo "Please create it first by running:"
    echo "  cd src-tauri/resources"
    echo "  zip -r bedrock-1.21.13201.zip bedrock/"
    exit 1
fi

echo "📦 Zip file size: $(du -h $ZIP_FILE | cut -f1)"

# Check if GitHub token is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GITHUB_TOKEN environment variable not set!"
    echo "Please set it with: export GITHUB_TOKEN=your_token_here"
    exit 1
fi

# Create or update the release
echo "📝 Creating/updating release tag: $TAG"
RELEASE_DATA=$(cat <<EOF
{
  "tag_name": "$TAG",
  "name": "Bedrock Edition Resources",
  "body": "Bedrock Edition v1.21.13201 files for Dragon Client launcher.\n\nThis release contains the Bedrock Edition game files that are downloaded on-demand when users install Bedrock Edition.",
  "draft": false,
  "prerelease": false
}
EOF
)

# Try to create the release (will fail if it already exists)
RELEASE_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d "$RELEASE_DATA")

# Get the release ID (either from creation or fetch existing)
RELEASE_ID=$(echo "$RELEASE_RESPONSE" | grep -o '"id": [0-9]*' | head -1 | grep -o '[0-9]*')

if [ -z "$RELEASE_ID" ]; then
    echo "📥 Release already exists, fetching ID..."
    RELEASE_ID=$(curl -s \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/$REPO/releases/tags/$TAG" \
      | grep -o '"id": [0-9]*' | head -1 | grep -o '[0-9]*')
fi

echo "✅ Release ID: $RELEASE_ID"

# Upload the asset
echo "📤 Uploading bedrock-1.21.13201.zip..."
UPLOAD_URL="https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=bedrock-1.21.13201.zip"

curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP_FILE" \
  "$UPLOAD_URL"

echo ""
echo "✅ Upload complete!"
echo "📍 Download URL: https://github.com/$REPO/releases/download/$TAG/bedrock-1.21.13201.zip"
