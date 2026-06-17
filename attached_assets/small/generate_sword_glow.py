from PIL import Image
import os

# Sword types to process
swords = ['diamond_sword', 'iron_sword', 'golden_sword', 'stone_sword', 'wooden_sword', 'netherite_sword']

input_dir = 'textures/item'
output_dir = 'textures/item/glow'

# Create output directory if it doesn't exist
os.makedirs(output_dir, exist_ok=True)

for sword in swords:
    input_path = os.path.join(input_dir, f'{sword}.png')
    
    if not os.path.exists(input_path):
        print(f"Skipping {sword} - file not found")
        continue
    
    # Load the sword texture
    img = Image.open(input_path).convert('RGBA')
    
    # Create a new image for the glow - make it completely transparent
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    
    # Get pixel data
    pixels = img.load()
    glow_pixels = glow.load()
    
    width, height = img.size
    
    # Create ULTRA thin white outline - only single pixel edge with low opacity
    # First pass: mark edge pixels
    edge_pixels = set()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # If pixel is solid (part of sword)
            if a > 200:
                # Check if it's on the edge (has at least one transparent neighbor)
                for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        _, _, _, na = pixels[nx, ny]
                        if na < 10:  # Has transparent neighbor
                            edge_pixels.add((x, y))
                            break
    
    # Second pass: add VERY subtle white outline just outside the edge
    for x, y in edge_pixels:
        # Add white pixel in transparent neighbors with very low opacity (10% of original)
        for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                _, _, _, na = pixels[nx, ny]
                if na < 10:  # Transparent pixel
                    # Make it a very subtle white outline - 10% opacity
                    glow_pixels[nx, ny] = (255, 255, 255, 25)
    
    # Save the glow texture
    output_path = os.path.join(output_dir, f'{sword}_glow.png')
    glow.save(output_path)
    print(f"Created {output_path}")

print("\nGlow textures generated successfully!")
print(f"Output directory: {output_dir}")
