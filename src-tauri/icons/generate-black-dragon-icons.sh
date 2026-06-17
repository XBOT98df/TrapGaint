#!/bin/bash

# Generate app icons with solid black background and dragon logo
# This script creates all required icon sizes for Tauri (macOS, Windows, Linux)

cd "$(dirname "$0")"

SOURCE="../../attached_assets/generated_images/dragon.jpg"

if [ ! -f "$SOURCE" ]; then
    echo "Error: dragon.jpg not found at $SOURCE"
    exit 1
fi

echo "Generating app icons with black background and dragon logo..."

# Check for available tools
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
elif command -v convert &> /dev/null; then
    CONVERT_CMD="convert"
else
    echo "Error: ImageMagick not found"
    echo "Install ImageMagick:"
    echo "  macOS: brew install imagemagick"
    echo "  Linux: sudo apt-get install imagemagick"
    exit 1
fi

echo "Using ImageMagick..."

# Function to create icon with black background and centered dragon
create_icon() {
    local size=$1
    local output=$2
    local padding=$((size / 8))  # 12.5% padding on each side
    local dragon_size=$((size - padding * 2))
    
    # Create black background, resize dragon, and composite
    $CONVERT_CMD -size ${size}x${size} xc:black \
        \( "$SOURCE" -resize ${dragon_size}x${dragon_size} \) \
        -gravity center -composite \
        "$output"
}

echo "Generating PNG files..."

# Generate PNG files at various sizes
create_icon 32 32x32.png
create_icon 128 128x128.png
create_icon 256 128x128@2x.png
create_icon 512 icon.png

echo "✓ PNG files created"

# === macOS icns ===
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Generating macOS .icns file..."
    
    mkdir -p icon.iconset
    create_icon 16 icon.iconset/icon_16x16.png
    create_icon 32 icon.iconset/icon_16x16@2x.png
    create_icon 32 icon.iconset/icon_32x32.png
    create_icon 64 icon.iconset/icon_32x32@2x.png
    create_icon 128 icon.iconset/icon_128x128.png
    create_icon 256 icon.iconset/icon_128x128@2x.png
    create_icon 256 icon.iconset/icon_256x256.png
    create_icon 512 icon.iconset/icon_256x256@2x.png
    create_icon 512 icon.iconset/icon_512x512.png
    create_icon 1024 icon.iconset/icon_512x512@2x.png
    
    # Create icns file (macOS)
    if command -v iconutil &> /dev/null; then
        iconutil -c icns icon.iconset -o icon.icns
        echo "✓ Created icon.icns for macOS"
    else
        echo "⚠ iconutil not found, skipping .icns generation"
    fi
    
    # Clean up iconset folder
    rm -rf icon.iconset
else
    echo "⚠ Skipping macOS .icns generation (not on macOS)"
fi

# === Windows ico ===
echo "Generating Windows .ico file..."

# Generate temp files for ico at standard Windows sizes
create_icon 16 icon-16.png
create_icon 48 icon-48.png
create_icon 256 icon-256.png

# Create Windows ico with multiple sizes
$CONVERT_CMD icon-16.png 32x32.png icon-48.png 128x128.png icon-256.png icon.ico

if [ -f icon.ico ]; then
    echo "✓ Created icon.ico for Windows"
else
    echo "⚠ Failed to create icon.ico"
fi

# Clean up temp files
rm -f icon-16.png icon-48.png icon-256.png

echo ""
echo "✅ Icon generation complete!"
echo ""
echo "Generated files:"
echo "  - 32x32.png"
echo "  - 128x128.png"
echo "  - 128x128@2x.png"
echo "  - icon.png (512x512)"
echo "  - icon.icns (macOS)"
echo "  - icon.ico (Windows)"
echo ""
echo "The icons feature:"
echo "  • Solid black background"
echo "  • Centered dragon logo with 12.5% padding"
echo "  • All required sizes for Tauri apps"
