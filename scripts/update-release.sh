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
    "Dragon.Client_aarch64.app.tar.gz.sig"
    "Dragon.Client_x64.app.tar.gz.sig"
)

for sig_file in "${REQUIRED_SIGS[@]}"; do
    if [ ! -f "$sig_file" ]; then
        echo "❌ Missing signature file: $sig_file"
        exit 1
    fi
    echo "  ✓ Found: $sig_file"
done

# Windows files may not match release tag version (e.g., release v2.0.75 contains 2.0.73 artifacts)
WINDOWS_MSI_SIG_FILE=$(ls Dragon.Client_*_x64_en-US.msi.sig 2>/dev/null | head -n 1 || true)
WINDOWS_NSIS_SIG_FILE=$(ls Dragon.Client_*_x64-setup.exe.sig 2>/dev/null | head -n 1 || true)

if [ -z "$WINDOWS_MSI_SIG_FILE" ] && [ -z "$WINDOWS_NSIS_SIG_FILE" ]; then
    echo "❌ Missing Windows signature files (expected MSI and/or NSIS)"
    echo "   - Dragon.Client_*_x64_en-US.msi.sig"
    echo "   - Dragon.Client_*_x64-setup.exe.sig"
    exit 1
fi

WINDOWS_MSI_FILE="${WINDOWS_MSI_SIG_FILE%.sig}"
WINDOWS_NSIS_FILE="${WINDOWS_NSIS_SIG_FILE%.sig}"

if [ -n "$WINDOWS_MSI_SIG_FILE" ]; then
    echo "  ✓ Found MSI: $WINDOWS_MSI_SIG_FILE"
fi
if [ -n "$WINDOWS_NSIS_SIG_FILE" ]; then
    echo "  ✓ Found NSIS: $WINDOWS_NSIS_SIG_FILE"
fi

# Create latest.json with Python
echo ""
echo "📝 Creating latest.json..."

export WINDOWS_MSI_FILE
export WINDOWS_NSIS_FILE

python3 << PYTHON
import json
import os
from datetime import datetime

# Read signatures
with open('Dragon.Client_aarch64.app.tar.gz.sig', 'r') as f:
    sig_aarch64 = f.read().strip()
with open('Dragon.Client_x64.app.tar.gz.sig', 'r') as f:
    sig_x64 = f.read().strip()

windows_msi_file = os.environ.get("WINDOWS_MSI_FILE", "")
windows_nsis_file = os.environ.get("WINDOWS_NSIS_FILE", "")

sig_windows_msi = None
sig_windows_nsis = None

if windows_msi_file:
    with open(f"{windows_msi_file}.sig", 'r') as f:
        sig_windows_msi = f.read().strip()

if windows_nsis_file:
    with open(f"{windows_nsis_file}.sig", 'r') as f:
        sig_windows_nsis = f.read().strip()

platforms = {
    "darwin-aarch64": {
        "signature": sig_aarch64,
        "url": "https://github.com/dhhd67807-lgtm/Block-Launcher/releases/download/${RELEASE_TAG}/Dragon.Client_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
        "signature": sig_x64,
        "url": "https://github.com/dhhd67807-lgtm/Block-Launcher/releases/download/${RELEASE_TAG}/Dragon.Client_x64.app.tar.gz"
    }
}

# Add installer-specific Windows targets so Tauri picks the exact installer type when available.
if sig_windows_nsis:
    platforms["windows-x86_64-nsis"] = {
        "signature": sig_windows_nsis,
        "url": f"https://github.com/dhhd67807-lgtm/Block-Launcher/releases/download/${RELEASE_TAG}/{windows_nsis_file}"
    }

if sig_windows_msi:
    platforms["windows-x86_64-msi"] = {
        "signature": sig_windows_msi,
        "url": f"https://github.com/dhhd67807-lgtm/Block-Launcher/releases/download/${RELEASE_TAG}/{windows_msi_file}"
    }

# Keep generic target for compatibility with clients that only request windows-x86_64.
if sig_windows_nsis:
    platforms["windows-x86_64"] = platforms["windows-x86_64-nsis"]
elif sig_windows_msi:
    platforms["windows-x86_64"] = platforms["windows-x86_64-msi"]

# Create JSON
data = {
    "version": "${VERSION}",
    "notes": "Dragon Client v${VERSION}",
    "pub_date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": platforms
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
echo "🔗 Verify at: https://github.com/dhhd67807-lgtm/Block-Launcher/releases/tag/${RELEASE_TAG}"
echo ""
echo "🧪 Test the updater JSON:"
echo "   curl -sL \"https://github.com/dhhd67807-lgtm/Block-Launcher/releases/download/${RELEASE_TAG}/latest.json\" | jq ."
echo ""
echo "🎉 Release update complete!"

# Clean up signature files
rm -f *.sig 2>/dev/null || true
