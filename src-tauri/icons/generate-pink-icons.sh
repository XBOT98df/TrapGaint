#!/bin/bash

# Generate Pink Dragon Client icons
# This script creates all required icon sizes with pink theme for Tauri (macOS, Windows, Linux)

cd "$(dirname "$0")"

# Use SIEFRA.png (pink tier logo) as source
SOURCE="../../client/public/SIEFRA.png"

if [ ! -f "$SOURCE" ]; then
    echo "Error: SIEFRA.png not found at $SOURCE"
    echo "Trying alternative source..."
    SOURCE="../../attached_assets/generated_images/SIEFRA.png"
    if [ ! -f "$SOURCE" ]; then
        echo "Error: No pink logo found"
        exit 1
    fi
fi

echo "🎨 Generating Pink Dragon Client icons from SIEFRA.png..."

# Check for available tools
if command -v sips &> /dev/null; then
    echo "Using sips (macOS native)..."
    
    # Generate PNG files at various sizes
    sips -z 32 32 "$SOURCE" --out 32x32.png
    sips -z 128 128 "$SOURCE" --out 128x128.png
    sips -z 256 256 "$SOURCE" --out 128x128@2x.png
    sips -z 512 512 "$SOURCE" --out icon.png
    
    # === macOS icns ===
    mkdir -p icon.iconset
    sips -z 16 16 "$SOURCE" --out icon.iconset/icon_16x16.png
    sips -z 32 32 "$SOURCE" --out icon.iconset/icon_16x16@2x.png
    sips -z 32 32 "$SOURCE" --out icon.iconset/icon_32x32.png
    sips -z 64 64 "$SOURCE" --out icon.iconset/icon_32x32@2x.png
    sips -z 128 128 "$SOURCE" --out icon.iconset/icon_128x128.png
    sips -z 256 256 "$SOURCE" --out icon.iconset/icon_128x128@2x.png
    sips -z 256 256 "$SOURCE" --out icon.iconset/icon_256x256.png
    sips -z 512 512 "$SOURCE" --out icon.iconset/icon_256x256@2x.png
    sips -z 512 512 "$SOURCE" --out icon.iconset/icon_512x512.png
    sips -z 1024 1024 "$SOURCE" --out icon.iconset/icon_512x512@2x.png
    
    # Create icns file (macOS)
    if command -v iconutil &> /dev/null; then
        iconutil -c icns icon.iconset -o icon.icns
        echo "✓ Created icon.icns for macOS (Pink theme)"
    fi
    
    # Clean up iconset folder
    rm -rf icon.iconset
    
    # === Windows ico ===
    # Generate temp files for ico
    sips -z 16 16 "$SOURCE" --out icon-16.png
    sips -z 48 48 "$SOURCE" --out icon-48.png
    sips -z 256 256 "$SOURCE" --out icon-256.png
    
    if command -v magick &> /dev/null; then
        magick icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
        echo "✓ Created icon.ico for Windows (Pink theme)"
    elif command -v convert &> /dev/null; then
        convert icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
        echo "✓ Created icon.ico for Windows (Pink theme)"
    else
        echo "⚠ ImageMagick not found, skipping Windows icon generation"
    fi
    
    # Clean up temp files
    rm -f icon-16.png icon-48.png icon-256.png
    
    echo "✨ Pink Dragon Client icons generated successfully!"
    
elif command -v magick &> /dev/null; then
    echo "Using ImageMagick..."
    
    # Generate PNG files at various sizes
    magick "$SOURCE" -resize 32x32 32x32.png
    magick "$SOURCE" -resize 128x128 128x128.png
    magick "$SOURCE" -resize 256x256 128x128@2x.png
    magick "$SOURCE" -resize 512x512 icon.png
    
    # Generate temp files for ico
    magick "$SOURCE" -resize 16x16 icon-16.png
    magick "$SOURCE" -resize 48x48 icon-48.png
    magick "$SOURCE" -resize 256x256 icon-256.png
    
    # Create Windows ico
    magick icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico
    echo "✓ Created icon.ico for Windows (Pink theme)"
    
    # Clean up temp files
    rm -f icon-16.png icon-48.png icon-256.png
    
    echo "✨ Pink Dragon Client icons generated!"
    echo "⚠ Note: macOS .icns file requires iconutil (run on macOS)"
    
else
    echo "Error: No image conversion tool found"
    echo "Install ImageMagick: brew install imagemagick"
    exit 1
fi

echo ""
echo "📋 Icon files created:"
echo "  - 32x32.png"
echo "  - 128x128.png"
echo "  - 128x128@2x.png"
echo "  - icon.png (512x512)"
echo "  - icon.icns (macOS)"
echo "  - icon.ico (Windows)"
echo ""
echo "🎨 Theme: Pink (#ec4899 - SIEFRA tier)"
