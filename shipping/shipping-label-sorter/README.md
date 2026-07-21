# Shipping Label Sorter

This Python utility automatically processes shipping labels, crops out blank margins and empty spaces, converts the content to black-and-white, and resizes it to fit a standard **4x6 inches portrait thermal PDF** (288 x 432 points).

## Key Features

- **Courier Processing**: All courier company labels are processed into 4x6 portrait output. No courier label is skipped because the courier is unsupported or unrecognized.
- **Skip Processed Orders**: Already processed Order IDs are skipped automatically. If output folder already contains any PDF file starting with the Order ID (e.g. `<order_id>_<courier>_4x6.pdf`), it will skip processing it again to avoid duplication and save time.
- **No content modification**: For non-Blue Dart couriers, barcodes, customer address, phone numbers, AWB/order numbers, and layout are preserved exactly as-is.
- **Whitespace Cropping (Blue Dart)**: Automatically detects the active boundary of the shipping label and crops out empty spaces (e.g., right-side white space from landscape pages).
- **Proportional Scaling**: Scales and fits the label content centered onto the 4x6 portrait page, stretching it as much as possible while maintaining aspect ratio.
- **Black-and-White Only (Blue Dart)**: Renders all page elements to high-resolution grayscale images, removing colors (such as red/pink table borders) while keeping text and barcodes extremely sharp and readable.
- **Grayscale PDF Output (Blue Dart)**: Saves the final document with native high-quality grayscale images (300 DPI).

---

## Supported Couriers & Logo Overlay Policy

All courier labels are output in 4x6 portrait format (288 x 432 points).

- **Blue Dart**: Transformed using the 4x6 thermal layout flow. Output saved as `<order_id>_bluedart_4x6.pdf`.
  - **Logo Overlay & Old Logo Removal**: The old distorted Shiprocket logo area is covered with a solid white rectangle first (if `REMOVE_OLD_LOGO = True`), then `assets/logo.png` is overlaid on top (if `ADD_NEW_LOGO = True`). If the logo is missing, a warning is logged (`Logo not found at assets/logo.png. Old logo removed, new logo not inserted.`).
  - **Visual Layout & Spacing**: The Blue Dart thermal label layout is preserved exactly as the original to prevent overlaps or formatting issues. Only the top-right logo area is cleared and replaced.
  - **Configurable Coordinates**: Coordinates and sizes for the logo clearing/overlaying parameters are fully configurable at the top of `shipping_label_sorter.py`.
- **Amazon / Amazon Shipping / ATS**: Keeps its current handling but outputs as a 4x6 portrait page. No logo is added, and no color/content conversion is performed. Output saved as `<order_id>_amazon_4x6.pdf`.
- **Unknown / Delhivery / Others**: Exported as plain 4x6 portrait labels without any modification (no logo, no styling) and are NOT skipped. Output saved as `<order_id>_<courier>_4x6.pdf` (or with fallback naming if order ID is missing).

---

## Project Structure

```text
shipping-label-sorter/
├── assets/
│   └── logo.png             # Place Entitled logo here
├── courier_rules/
│   ├── __init__.py
│   ├── base.py
│   ├── bluedart.py
│   ├── delhivery.py
│   ├── amazon.py
│   └── unknown.py
├── input/                   # Place input PDFs here
├── output/                  # Converted PDFs and converter.log
├── shipping_label_sorter.py # Main execution script
├── requirements.txt         # PyMuPDF
└── README.md
```

---

## Ubuntu-safe Installation and Execution (Virtual Environment Only)

Follow these exact steps to set up the virtual environment and run the utility safely on Ubuntu:

```bash
cd ~/Desktop/Shivam/arkn/Resources/Entitled/shipping/shipping-label-sorter

python3 -m venv .venv

source .venv/bin/activate

python -m pip install --upgrade pip

python -m pip install -r requirements.txt

python shipping_label_sorter.py
```

---

## Usage

Place the PDF files you want to convert inside the `input/` folder.

### 1. Run Sorter & Converted Outputs
Running the script without arguments uses the default directories (`input` and `output` folders in the current working directory). These folders will be created automatically if they are missing:

```bash
python shipping_label_sorter.py
```

Processed Blue Dart files are saved to `output/` with the format `<order_id>_bluedart_4x6.pdf`. Scaled Amazon files are saved with the format `<order_id>_amazon_4x6.pdf`. Other/unknown couriers are saved as `<order_id>_<courier>_4x6.pdf` or `unknown_order_<sourcefilename>_p<page_number>_<courier>_4x6.pdf`. No pages are skipped.

### 2. Custom Folders
You can specify custom input and output folders using the `--input` and `--output` options:

```bash
python shipping_label_sorter.py --input path/to/input --output path/to/output
```

### 3. Regenerate Existing Labels
By default, the sorter skips an Order ID if a matching PDF already exists in the output folder. To rebuild labels after changing logo/layout handling, run:

```bash
python shipping_label_sorter.py --force
```

---

## Log Output

Logs are saved directly to the output directory in two formats:
1. **Text Log (`converter.log`)**:
   - List of files found in the input folder.
   - Auto-detected courier partner for each file.
   - File-by-file progress, including detected crop bounding boxes.
   - Processing details for all courier types.
   - Final summary of processed files.
2. **Excel Log (`converter_log.xlsx`)**:
   - Save timestamp, source file, page number, order ID, courier, action taken, output file path, status, and message.
   - Tracks all events including: `processed`, `copied`, `skipped_already_processed`, `failed`, `printed`, and `print_failed`.

---

## Thermal Printing Support

After the conversion script finishes processing, the interactive print prompt will launch:
```text
Enter Order ID to print, or press Enter to exit:
```
Enter a processed Order ID to search the output directory and print the corresponding 4x6 label.

### Print Configurations
Configure printing behavior at the top of `shipping_label_sorter.py`:
- `ENABLE_PRINT_PROMPT = True`: Toggle post-processing printing prompt.
- `THERMAL_PRINTER_NAME = ""`: Specify printer name. If empty, the system default printer is used.

Thermal printing is executed via the `lp` command with 4x6 portrait media options.
