#!/bin/bash

# Lapetus Client macOS Installer
# This script removes quarantine flags and installs the app

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       Lapetus Client Installer            ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

APP_NAME="Lapetus Client.app"
DMG_NAME="Lapetus Client"

# Find the app in common locations
find_app() {
    # Check Downloads folder for DMG or app
    if [ -d "$HOME/Downloads/$APP_NAME" ]; then
        echo "$HOME/Downloads/$APP_NAME"
        return
    fi
    
    # Check if DMG is mounted
    if [ -d "/Volumes/$DMG_NAME/$APP_NAME" ]; then
        echo "/Volumes/$DMG_NAME/$APP_NAME"
        return
    fi
    
    # Check Desktop
    if [ -d "$HOME/Desktop/$APP_NAME" ]; then
        echo "$HOME/Desktop/$APP_NAME"
        return
    fi
    
    # Check Applications
    if [ -d "/Applications/$APP_NAME" ]; then
        echo "/Applications/$APP_NAME"
        return
    fi
    
    echo ""
}

# Mount DMG if found
mount_dmg() {
    for dmg in "$HOME/Downloads"/*.dmg; do
        if [[ "$dmg" == *"Lapetus"* ]]; then
            echo "📀 Found DMG: $dmg"
            echo "   Mounting..."
            hdiutil attach "$dmg" -nobrowse -quiet
            sleep 2
            return 0
        fi
    done
    return 1
}

echo "🔍 Looking for Lapetus Client..."
echo ""

# Try to mount DMG first
mount_dmg

APP_PATH=$(find_app)

if [ -z "$APP_PATH" ]; then
    echo "❌ Could not find Lapetus Client!"
    echo ""
    echo "Please make sure you have:"
    echo "  1. Downloaded the DMG from GitHub releases"
    echo "  2. The DMG is in your Downloads folder"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Found: $APP_PATH"
echo ""

# Remove quarantine attribute
echo "🔓 Removing quarantine flags..."
xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Quarantine removed!"
else
    echo "❌ Failed to remove quarantine. Try running with sudo:"
    echo "   sudo xattr -cr \"$APP_PATH\""
    exit 1
fi

# Copy to Applications if not already there
if [[ "$APP_PATH" != "/Applications/$APP_NAME" ]]; then
    echo ""
    echo "📁 Installing to Applications folder..."
    
    # Remove old version if exists
    if [ -d "/Applications/$APP_NAME" ]; then
        rm -rf "/Applications/$APP_NAME"
    fi
    
    cp -R "$APP_PATH" "/Applications/"
    
    if [ $? -eq 0 ]; then
        echo "✅ Installed to /Applications/$APP_NAME"
        
        # Remove quarantine from installed app too
        xattr -cr "/Applications/$APP_NAME"
    else
        echo "⚠️  Could not copy to Applications. You may need to drag it manually."
    fi
fi

echo ""
echo "🎮 Installation complete!"
echo ""
echo "You can now open Lapetus Client from:"
echo "  • Launchpad"
echo "  • Applications folder"
echo "  • Spotlight (Cmd + Space, type 'Lapetus')"
echo ""

# Offer to open the app
read -p "Open Lapetus Client now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "/Applications/$APP_NAME"
fi
