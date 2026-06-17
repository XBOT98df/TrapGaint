#!/bin/bash
# Generate NSIS installer images with black Dragon theme
set -euo pipefail

# Check if ImageMagick is installed
if command -v magick >/dev/null 2>&1; then
    MAGICK=(magick)
elif command -v convert >/dev/null 2>&1; then
    MAGICK=(convert)
else
    echo "ImageMagick is required. Install with: brew install imagemagick"
    exit 1
fi

cd "$(dirname "$0")"
LOGO="./dragon2.png"

if [ ! -f "$LOGO" ]; then
    echo "Missing logo file: $LOGO"
    exit 1
fi

# Header image (150x57) - Black gradient with dragon logo
"${MAGICK[@]}" -size 150x57 gradient:'#07080C-#161B28' \
    \( "$LOGO" -resize 30x30 \) -gravity west -geometry +7+0 -composite \
    header.bmp

# Sidebar image (164x314) - Dark setup panel with logo
"${MAGICK[@]}" -size 164x314 \
    gradient:'#05060A-#161A25' \
    \( "$LOGO" -resize 88x88 \) -gravity north -geometry +0+36 -composite \
    sidebar.bmp

echo "Generated black theme header.bmp and sidebar.bmp using dragon2.png"
