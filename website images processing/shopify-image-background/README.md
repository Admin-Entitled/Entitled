# Shopify Image Background Changer

This script removes the background of product images using `rembg` (runs locally) and places them on a solid background color (default `#EDEBE8`).

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

**1. Process a single image:**
```bash
python change_background.py --input "path/to/image.jpg" --output "path/to/output.jpg"
```

**2. Process a directory of images:**
```bash
python change_background.py --input "path/to/input_folder" --output "path/to/output_folder"
```

**3. Center and scale to standard 1600x1600 Shopify canvas (with default padding/alignment):**
```bash
python change_background.py --input "path/to/input_folder" --output "path/to/output_folder" --resize
```

### Options

* `--input`, `-i`: Path to input image file or directory containing images (required).
* `--output`, `-o`: Path to output image file or directory (if omitted, saves next to input with a `_bg_changed` suffix).
* `--color`, `-c`: Hex color code for the new background (default: `#EDEBE8`).
* `--resize`, `-r`: Center and scale the product to fit a square Shopify-style canvas (default size: `1600x1600`).
* `--size`, `-s`: Output size in pixels (if `--resize` is enabled, default: `1600`).
* `--scale`: Product scale relative to canvas size (if `--resize` is enabled, default: `0.836`).
