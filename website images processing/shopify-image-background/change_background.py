#!/usr/bin/env python3
import os
import sys
import argparse
from pathlib import Path
from PIL import Image, ImageColor
import rembg

def change_background(input_path: Path, output_path: Path, bg_color_hex: str = "#EDEBE8", resize_canvas: bool = False, target_size: int = 1600, scale_factor: float = 0.836):
    """
    Removes the background of the input image using rembg and places the product
    on a new solid background color.
    """
    print(f"Processing: {input_path}")
    try:
        # Open the source image
        with Image.open(input_path) as img:
            # Convert to RGBA
            img_rgba = img.convert("RGBA")
            
            # Remove background using rembg
            print("  Removing background...")
            nobg_rgba = rembg.remove(img_rgba)
            
            # Get bounding box of the non-transparent content to crop tight
            bbox = nobg_rgba.getbbox()
            if not bbox:
                print(f"  Warning: No foreground detected in {input_path.name}")
                return False
            
            # Extract background RGB color
            bg_rgb = ImageColor.getrgb(bg_color_hex)[:3]
            
            if resize_canvas:
                # Crop to the product bounding box
                cropped_product = nobg_rgba.crop(bbox)
                w, h = cropped_product.size
                
                # Determine scaling to fit the target canvas size while keeping aspect ratio
                target_side = int(round(target_size * scale_factor))
                fit_scale = target_side / max(w, h)
                new_w = max(1, int(round(w * fit_scale)))
                new_h = max(1, int(round(h * fit_scale)))
                
                # Resize product
                resized_product = cropped_product.resize((new_w, new_h), Image.Resampling.LANCZOS)
                cropped_product.close()
                
                # Create a new canvas with the target background color
                canvas = Image.new("RGBA", (target_size, target_size), (*bg_rgb, 255))
                
                # Center the product
                x = (target_size - new_w) // 2
                # Place vertically centered (at 47% like in the main pipeline for a balanced look)
                center_y = int(round(target_size * 0.47))
                y = center_y - new_h // 2
                y = max(0, min(target_size - new_h, y))
                
                canvas.alpha_composite(resized_product, (x, y))
                resized_product.close()
            else:
                # Keep original image size, just substitute the background
                canvas = Image.new("RGBA", img.size, (*bg_rgb, 255))
                canvas.alpha_composite(nobg_rgba)
            
            # Convert final image back to RGB and save
            final_img = canvas.convert("RGB")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            final_img.save(output_path, format="JPEG", quality=95)
            
            nobg_rgba.close()
            canvas.close()
            final_img.close()
            print(f"  Saved to: {output_path}")
            return True
            
    except Exception as e:
        print(f"  Error processing {input_path.name}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Change product image background color using local rembg (removes background first)."
    )
    parser.add_argument(
        "--input", "-i", 
        required=True, 
        help="Path to input image file or directory containing images."
    )
    parser.add_argument(
        "--output", "-o", 
        help="Path to output image file or directory. If omitted, saves next to input with a '_bg_changed' suffix."
    )
    parser.add_argument(
        "--color", "-c", 
        default="#EDEBE8", 
        help="Hex color code for the new background (default: #EDEBE8)."
    )
    parser.add_argument(
        "--resize", "-r",
        action="store_true",
        help="Center and scale the product to fit a square Shopify-style canvas (default: 1600x1600)."
    )
    parser.add_argument(
        "--size", "-s",
        type=int,
        default=1600,
        help="Output size in pixels (if --resize is enabled, default: 1600)."
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=0.836,
        help="Product scale relative to canvas size (if --resize is enabled, default: 0.836)."
    )
    
    args = parser.parse_args()
    
    input_path = Path(args.input).resolve()
    
    # Determine input files
    files_to_process = []
    if input_path.is_file():
        files_to_process.append(input_path)
    elif input_path.is_dir():
        valid_extensions = {".jpg", ".jpeg", ".png", ".webp"}
        for root, _, files in os.walk(input_path):
            for file in files:
                if Path(file).suffix.lower() in valid_extensions:
                    files_to_process.append(Path(root) / file)
        print(f"Found {len(files_to_process)} image files in directory: {input_path}")
    else:
        print(f"Error: Input path does not exist: {input_path}")
        sys.exit(1)
        
    if not files_to_process:
        print("No valid images found to process.")
        sys.exit(0)
        
    # Process files
    success_count = 0
    for file in files_to_process:
        # Determine output path for this file
        if args.output:
            out_base = Path(args.output).resolve()
            if input_path.is_file():
                if out_base.is_dir() or args.output.endswith("/"):
                    out_file = out_base / f"{file.stem}_bg_changed.jpg"
                else:
                    out_file = out_base
            else:
                # Replicate directory structure under output dir
                rel_path = file.relative_to(input_path)
                out_file = out_base / rel_path.with_suffix(".jpg")
        else:
            # Save next to input
            out_file = file.parent / f"{file.stem}_bg_changed.jpg"
            
        success = change_background(
            input_path=file,
            output_path=out_file,
            bg_color_hex=args.color,
            resize_canvas=args.resize,
            target_size=args.size,
            scale_factor=args.scale
        )
        if success:
            success_count += 1
            
    print(f"\nDone! Successfully processed {success_count}/{len(files_to_process)} images.")

if __name__ == "__main__":
    main()
