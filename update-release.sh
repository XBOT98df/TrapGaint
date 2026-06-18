#!/bin/bash

# Dragon Client - Update Release Script
# This script updates the latest.json for an existing release with proper signatures

set -e

echo "🐉 Dragon Client - Update Release"
echo "=================================="

# Check if version is provided
if [ -z "$1" ]; then
    echo "❌ Error: Version number required"
    echo "Usage: ./scripts/update-release.sh <version>"
    echo "Example: ./scripts/update-release.sh 2.0.48"
    exit 1
fi

VERSION="$1"
RELEASE_TAG="v${VERSION}"

echo "📦 Version: ${VERSION}"
echo "🏷️  Release Tag: ${RELEASE_TAG}"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if logged in to GitHub
if ! gh auth status &> /dev/null; then
    echo "❌ Not logged in to GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

# Check if release exists
echo ""
echo "🔍 Checking if release ${RELEASE_TAG} exists..."
if ! gh release view "${RELEASE_TAG}" &> /dev/null; then
    echo "❌ Release ${RELEASE_TAG} does not exist"
    echo "Please create the release first using the GitHub Actions workflow"
    exit 1
fi

echo "✅ Release ${RELEASE_TAG} found"

# Download signature files
echo ""
echo "📥 Downloading signature files..."
rm -f *.sig 2>/dev/null || true

gh release download "${RELEASE_TAG}" -p "*.sig" --clobber

# Check if required signature files exist
REQUIRED_SIGS=(
    "TrapGaint_aarch64.app.tar.gz.sig"
    "TrapGaint_x64.app.tar.gz.sig"
)

for sig_file in "${REQUIRED_SIGS[@]}"; do
    if [ ! -f "$sig_file" ]; then
        echo "❌ Missing signature file: $sig_file"
        exit 1
    fi
    echo "  ✓ Found: $sig_file"
done

# Windows file may not match release tag version (e.g., release v2.0.75 contains 2.0.73 artifacts)
WINDOWS_SIG_FILE=$(ls TrapGaint_*_x64_en-US.msi.sig 2>/dev/null | head -n 1)
if [ -z "$WINDOWS_SIG_FILE" ]; then
    echo "❌ Missing Windows signature file: TrapGaint_*_x64_en-US.msi.sig"
    exit 1
fi
WINDOWS_MSI_FILE="${WINDOWS_SIG_FILE%.sig}"
echo "  ✓ Found: $WINDOWS_SIG_FILE"

# Create latest.json with Python
echo ""
echo "📝 Creating latest.json..."

python3 << PYTHON
import json
from datetime import datetime

# Read signatures
with open('TrapGaint_aarch64.app.tar.gz.sig', 'r') as f:
    sig_aarch64 = f.read().strip()
with open('TrapGaint_x64.app.tar.gz.sig', 'r') as f:
    sig_x64 = f.read().strip()
with open('${WINDOWS_SIG_FILE}', 'r') as f:
    sig_windows = f.read().strip()

# Create JSON
data = {
    "version": "${VERSION}",
    "notes": "Dragon Client v${VERSION}",
    "pub_date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "darwin-aarch64": {
            "signature": sig_aarch64,
            "url": "https://github.com/XBOT98df/TrapGaint/releases/download/${RELEASE_TAG}/TrapGaint_aarch64.app.tar.gz"
        },
        "darwin-x86_64": {
            "signature": sig_x64,
            "url": "https://github.com/XBOT98df/TrapGaint/releases/download/${RELEASE_TAG}/TrapGaint_x64.app.tar.gz"
        },
        "windows-x86_64": {
            "signature": sig_windows,
            "url": "https://github.com/XBOT98df/TrapGaint/releases/download/${RELEASE_TAG}/${WINDOWS_MSI_FILE}"
        }
    }
}

with open('latest.json', 'w') as f:
    json.dump(data, f, indent=2)

print("✅ Created latest.json")
print(json.dumps(data, indent=2))
PYTHON

# Upload latest.json to release
echo ""
echo "📤 Uploading latest.json to release..."
gh release upload "${RELEASE_TAG}" latest.json --clobber

echo ""
echo "✅ Successfully updated release ${RELEASE_TAG}"
echo ""
echo "🔗 Verify at: https://github.com/XBOT98df/TrapGaint/releases/tag/${RELEASE_TAG}"
echo ""
echo "🧪 Test the updater JSON:"
echo "   curl -sL \"https://github.com/XBOT98df/TrapGaint/releases/download/${RELEASE_TAG}/latest.json\" | jq ."
echo ""
echo "🎉 Release update complete!"

# Clean up signature files
rm -f *.sig 2>/dev/null || true
