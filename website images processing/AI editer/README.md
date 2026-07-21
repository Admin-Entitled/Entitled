# Gemini Batch Processing Setup

This project keeps only the Google Gemini batch-processing flow for Shopify product images.

The final Shopify formatting is deterministic in Python:

- Gemini edits the product image
- Python removes disconnected artifacts
- Python crops the product region
- Python recenters the garment on a clean `1600x1600` canvas
- Python exports the final Shopify-ready file

## 1. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 2. Install requirements

```bash
pip install -r requirements.txt
```

## 3. Add `GEMINI_API_KEY` in `.env`

```bash
cp .env.example .env
nano .env
```

Set:

```env
GEMINI_API_KEY=your_api_key_here
```

## 4. Prepare the `references/` folder

Create:

```text
references/front.webp
references/back.webp
references/top.webp
```

## 5. Prepare the `input/` folder

Example:

```text
input/product-001/front.jpg
input/product-001/back.jpg
input/product-001/top.jpg

input/product-002/front.jpg
input/product-002/back.jpg
input/product-002/top.jpg
```

The script will mirror this structure into `results/` and keep filenames unchanged.

## 6. Run dry-run

```bash
python gemini_batch_process.py --dry-run
```

Dry run validates references, input discovery, and role detection without calling Gemini or writing final output images.

## 7. Run actual Gemini processing

```bash
python gemini_batch_process.py
```

Optional full command:

```bash
python gemini_batch_process.py \
  --references references \
  --input input \
  --output results \
  --cache resized_cache \
  --model gemini-3.1-flash-image \
  --work-size 1024 \
  --final-size 1600 \
  --bg-color "#F2F2F2" \
  --quality 95 \
  --neutralize-cast true \
  --postprocess-segment true \
  --product-scale 0.76 \
  --top-product-scale 0.82 \
  --vertical-center 0.47 \
  --safe-padding 0.08 \
  --retries 3 \
  --sleep-between 30
```

## 8. Check results

Edited images will be saved under:

```text
results/product-001/front.jpg
results/product-001/back.jpg
results/product-001/top.jpg
```

Temporary resized files are stored under `resized_cache/`, and execution details are written to `process_log.json`.

## Quality Fix Mode

Recommended quality-fix command:

```bash
python gemini_batch_process.py \
  --references references \
  --input input \
  --output results \
  --cache resized_cache \
  --model gemini-3.1-flash-image \
  --work-size 1024 \
  --final-size 1600 \
  --bg-color "#F2F2F2" \
  --quality 95 \
  --neutralize-cast true \
  --postprocess-segment true \
  --product-scale 0.76 \
  --top-product-scale 0.82 \
  --vertical-center 0.47 \
  --safe-padding 0.08 \
  --retries 3 \
  --sleep-between 30
```

High-quality test command:

```bash
python gemini_batch_process.py \
  --model gemini-3-pro-image \
  --neutralize-cast true \
  --postprocess-segment true \
  --product-scale 0.76 \
  --top-product-scale 0.82
```

`gemini-3.1-flash-image` remains the default model. For harder lighting and alignment cases, test `gemini-3-pro-image`.
