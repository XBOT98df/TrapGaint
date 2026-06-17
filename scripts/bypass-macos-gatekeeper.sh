#!/bin/bash

# Script to bypass macOS Gatekeeper restrictions for Dragon Client
# This removes the quarantine attribute that prevents unsigned apps from running

set -e

echo "🐉 Dragon Client - macOS Gatekeeper Bypass Script"
echo "=================================================="
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ Error: This script is only for macOS"
    exit 1
fi

# Define the app path
APP_PATH="/Applications/Dragon Client.app"

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: Dragon Client.app not found in /Applications/"
    echo "Please install Dragon Client first."
    exit 1
fi

echo "📍 Found Dragon Client at: $APP_PATH"
echo ""

# Remove quarantine attribute
echo "🔓 Removing quarantine attribute..."
xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Successfully removed quarantine attribute"
else
    echo "❌ Failed to remove quarantine attribute"
    echo "You may need to run this with sudo:"
    echo "sudo $0"
    exit 1
fi

echo ""

# Remove extended attributes
echo "🧹 Clearing all extended attributes..."
xattr -d com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo ""

# Allow app in System Preferences
echo "🔐 Attempting to allow app in System Preferences..."
spctl --add "$APP_PATH" 2>/dev/null || true
spctl --enable "$APP_PATH" 2>/dev/null || true

echo ""
echo "✅ All done! Dragon Client should now launch without restrictions."
echo ""
echo "If you still see warnings, try:"
echo "1. Right-click Dragon Client.app → Open"
echo "2. Click 'Open' in the security dialog"
echo ""
echo "Or run: sudo spctl --master-disable"
echo "(This disables Gatekeeper entirely - not recommended for security)"
echo ""
