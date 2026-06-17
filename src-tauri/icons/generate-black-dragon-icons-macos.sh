#!/bin/bash

# Generate app icons with solid black background and dragon logo (macOS native)
# Uses sips and Python PIL for image composition

cd "$(dirname "$0")"

SOURCE="../../attached_assets/generated_images/dragon.jpg"

if [ ! -f "$SOURCE" ]; then
    echo "Error: dragon.jpg not found at $SOURCE"
    exit 1
fi

echo "Generating app icons with black background and dragon logo..."

# Create Python script for compositing
cat > /tmp/create_icon.py << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
import sys
from PIL import Image, ImageDraw

def create_rounded_mask(size, radius):
    """Create a rounded rectangle mask"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
    return mask

def create_icon(source_path, output_path, size):
    # Calculate padding (12.5% on each side)
    padding = size // 8
    dragon_size = size - (padding * 2)
    
    # Calculate corner radius (18% of size for macOS-style rounded corners)
    corner_radius = int(size * 0.18)
    
    # Create black background with alpha channel (RGBA)
    img = Image.new('RGBA', (size, size), color=(0, 0, 0, 255))
    
    # Open and resize dragon image
    dragon = Image.open(source_path)
    dragon = dragon.convert('RGBA')
    dragon.thumbnail((dragon_size, dragon_size), Image.Resampling.LANCZOS)
    
    # Calculate position to center the dragon
    x = (size - dragon.width) // 2
    y = (size - dragon.height) // 2
    
    # Composite dragon onto black background
    img.paste(dragon, (x, y), dragon)
    
    # Apply rounded corners mask
    mask = create_rounded_mask(size, corner_radius)
    img.putalpha(mask)
    
    # Save as RGBA PNG
    img.save(output_path, 'PNG')
    print(f"✓ Created {output_path} ({size}x{size}) with rounded corners")

if __name__ == '__main__':
    source = sys.argv[1]
    output = sys.argv[2]
    size = int(sys.argv[3])
    create_icon(source, output, size)
PYTHON_SCRIPT

chmod +x /tmp/create_icon.py

# Check if PIL is available
if ! python3 -c "import PIL" 2>/dev/null; then
    echo "Installing Pillow (PIL)..."
    python3 -m pip install --user Pillow --quiet
fi

echo "Generating PNG files..."

# Generate PNG files at various sizes
python3 /tmp/create_icon.py "$SOURCE" 32x32.png 32
python3 /tmp/create_icon.py "$SOURCE" 128x128.png 128
python3 /tmp/create_icon.py "$SOURCE" 128x128@2x.png 256
python3 /tmp/create_icon.py "$SOURCE" icon.png 512

echo ""
echo "Generating macOS .icns file..."

# Create iconset directory
mkdir -p icon.iconset

# Generate all required sizes for icns
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_16x16.png 16
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_16x16@2x.png 32
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_32x32.png 32
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_32x32@2x.png 64
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_128x128.png 128
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_128x128@2x.png 256
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_256x256.png 256
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_256x256@2x.png 512
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_512x512.png 512
python3 /tmp/create_icon.py "$SOURCE" icon.iconset/icon_512x512@2x.png 1024

# Create icns file
if command -v iconutil &> /dev/null; then
    iconutil -c icns icon.iconset -o icon.icns
    echo "✓ Created icon.icns for macOS"
else
    echo "⚠ iconutil not found"
fi

# Clean up iconset folder
rm -rf icon.iconset

echo ""
echo "Generating Windows .ico file..."

# Generate temp files for ico
python3 /tmp/create_icon.py "$SOURCE" icon-16.png 16
python3 /tmp/create_icon.py "$SOURCE" icon-48.png 48
python3 /tmp/create_icon.py "$SOURCE" icon-256.png 256

# Try to create ico using Python PIL
python3 << 'PYTHON_ICO'
from PIL import Image
import sys

try:
    # Load all sizes
    img_16 = Image.open('icon-16.png')
    img_32 = Image.open('32x32.png')
    img_48 = Image.open('icon-48.png')
    img_128 = Image.open('128x128.png')
    img_256 = Image.open('icon-256.png')
    
    # Save as ico with multiple sizes
    img_256.save('icon.ico', format='ICO', 
                 sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
    print("✓ Created icon.ico for Windows")
except Exception as e:
    print(f"⚠ Failed to create icon.ico: {e}")
    sys.exit(1)
PYTHON_ICO

# Clean up temp files
rm -f icon-16.png icon-48.png icon-256.png /tmp/create_icon.py

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
