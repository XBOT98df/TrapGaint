#!/bin/bash

# Generate PNG icons from SVG using rsvg-convert
# This script creates all required icon sizes for Tauri (macOS, Windows, Linux)

cd "$(dirname "$0")"

# Check if we have rsvg-convert (from librsvg)
if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    
    # Generate PNG files at various sizes
    rsvg-convert -w 16 -h 16 lapetus-icon.svg -o icon-16.png
    rsvg-convert -w 32 -h 32 lapetus-icon.svg -o 32x32.png
    rsvg-convert -w 48 -h 48 lapetus-icon.svg -o icon-48.png
    rsvg-convert -w 128 -h 128 lapetus-icon.svg -o 128x128.png
    rsvg-convert -w 256 -h 256 lapetus-icon.svg -o 128x128@2x.png
    rsvg-convert -w 256 -h 256 lapetus-icon.svg -o icon-256.png
    rsvg-convert -w 512 -h 512 lapetus-icon.svg -o icon.png
    
    # === macOS icns ===
    mkdir -p icon.iconset
    rsvg-convert -w 16 -h 16 lapetus-icon.svg -o icon.iconset/icon_16x16.png
    rsvg-convert -w 32 -h 32 lapetus-icon.svg -o icon.iconset/icon_16x16@2x.png
    rsvg-convert -w 32 -h 32 lapetus-icon.svg -o icon.iconset/icon_32x32.png
    rsvg-convert -w 64 -h 64 lapetus-icon.svg -o icon.iconset/icon_32x32@2x.png
    rsvg-convert -w 128 -h 128 lapetus-icon.svg -o icon.iconset/icon_128x128.png
    rsvg-convert -w 256 -h 256 lapetus-icon.svg -o icon.iconset/icon_128x128@2x.png
    rsvg-convert -w 256 -h 256 lapetus-icon.svg -o icon.iconset/icon_256x256.png
    rsvg-convert -w 512 -h 512 lapetus-icon.svg -o icon.iconset/icon_256x256@2x.png
    rsvg-convert -w 512 -h 512 lapetus-icon.svg -o icon.iconset/icon_512x512.png
    rsvg-convert -w 1024 -h 1024 lapetus-icon.svg -o icon.iconset/icon_512x512@2x.png
    
    # Create icns file (macOS only)
    if command -v iconutil &> /dev/null; then
        iconutil -c icns icon.iconset -o icon.icns
        echo "Created icon.icns for macOS"
    fi
    
    # Clean up iconset folder
    rm -rf icon.iconset
    
    # === Windows ico ===
    if command -v magick &> /dev/null; then
        magick icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
        echo "Created icon.ico for Windows"
    elif command -v convert &> /dev/null; then
        convert icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
        echo "Created icon.ico for Windows"
    else
        echo "Warning: ImageMagick not found, skipping Windows icon generation"
    fi
    
    # Clean up temp files
    rm -f icon-16.png icon-48.png icon-256.png
    
    echo "Icons generated successfully!"
else
    echo "rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi
