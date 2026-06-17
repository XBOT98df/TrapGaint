#!/bin/bash

# Generate Dragon Client icons from dragon-app.jpg
# This script creates all required icon sizes for Tauri (macOS, Windows, Linux)
# IMPORTANT: Tauri requires RGBA PNG files (with alpha channel)
# Icons will have rounded corners for a modern look

cd "$(dirname "$0")"

SOURCE="../../new1.png"

if [ ! -f "$SOURCE" ]; then
    echo "Error: new1.png not found at $SOURCE"
    exit 1
fi

echo "Generating Dragon Client icons from new1.png with rounded corners..."

# Check for ImageMagick first (preferred for RGBA support)
if command -v magick &> /dev/null; then
    echo "Using ImageMagick (with RGBA support)..."
    
    # Function to create rounded corner icon
    create_rounded_icon() {
        local size=$1
        local output=$2
        local radius=$((size / 5))  # 20% radius for nice rounded corners
        
        magick "$SOURCE" -resize ${size}x${size} \
            \( +clone -alpha extract \
            -draw "fill black polygon 0,0 0,$radius $radius,0 fill white circle $radius,$radius $radius,0" \
            \( +clone -flip \) -compose Multiply -composite \
            \( +clone -flop \) -compose Multiply -composite \
            \) -alpha off -compose CopyOpacity -composite \
            -background none "$output"
    }
    
    # Generate PNG files at various sizes with alpha channel and rounded corners
    create_rounded_icon 32 32x32.png
    create_rounded_icon 128 128x128.png
    create_rounded_icon 256 128x128@2x.png
    create_rounded_icon 512 icon.png
    
    # === macOS icns ===
    mkdir -p icon.iconset
    create_rounded_icon 16 icon.iconset/icon_16x16.png
    create_rounded_icon 32 icon.iconset/icon_16x16@2x.png
    create_rounded_icon 32 icon.iconset/icon_32x32.png
    create_rounded_icon 64 icon.iconset/icon_32x32@2x.png
    create_rounded_icon 128 icon.iconset/icon_128x128.png
    create_rounded_icon 256 icon.iconset/icon_128x128@2x.png
    create_rounded_icon 256 icon.iconset/icon_256x256.png
    create_rounded_icon 512 icon.iconset/icon_256x256@2x.png
    create_rounded_icon 512 icon.iconset/icon_512x512.png
    create_rounded_icon 1024 icon.iconset/icon_512x512@2x.png
    
    # Create icns file (macOS)
    if command -v iconutil &> /dev/null; then
        iconutil -c icns icon.iconset -o icon.icns
        echo "✓ Created icon.icns for macOS"
    else
        echo "⚠ iconutil not found, skipping .icns generation"
    fi
    
    # Clean up iconset folder
    rm -rf icon.iconset
    
    # === Windows ico ===
    # Generate temp files for ico with alpha channel and rounded corners
    create_rounded_icon 16 icon-16.png
    create_rounded_icon 48 icon-48.png
    create_rounded_icon 256 icon-256.png
    
    # Create Windows ico
    magick icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
    echo "✓ Created icon.ico for Windows"
    
    # Clean up temp files
    rm -f icon-16.png icon-48.png icon-256.png
    
    echo "✓ Dragon Client icons generated successfully with RGBA support and rounded corners!"
    
else
    echo "Error: ImageMagick not found"
    echo "Install ImageMagick: brew install imagemagick"
    echo ""
    echo "Note: sips (macOS native) cannot create RGBA PNGs required by Tauri"
    exit 1
fi
