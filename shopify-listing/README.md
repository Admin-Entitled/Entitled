# Shopify Listing Import CLI

This tool imports products into one Shopify store from a local CSV or Excel file.

## What it does
- Reads a CSV (`.csv`) or Excel workbook (`.xlsx`, `.xlsm`) from your computer
- Groups rows by SKU
- Creates new Shopify product listings (no dedupe, no updates)
- Creates size variants (`Size` option)
- Sets inventory by size at one Shopify location
- Writes a CSV run log in `logs/`

## Before you run
1. Go into the project folder:
   ```bash
   cd shopify-listing
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Run commands

### Dry run (no Shopify writes)
```bash
npm run dev -- \
  --csv ./data/products.csv \
  --dryRun
```

### Real import (using location ID)
```bash
npm run dev -- \
  --csv ./data/products.csv \
  --store yourstore.myshopify.com \
  --token shpat_xxx \
  --locationId gid://shopify/Location/1234567890
```

### Real import (using location name)
```bash
npm run dev -- \
  --csv ./data/products.csv \
  --store yourstore.myshopify.com \
  --token shpat_xxx \
  --locationName "Main Warehouse"
```

## Optional flags
- `--concurrency 1` (default range is `1-4`)
- `--logPrefix my-run`

## Build and run compiled JS
```bash
npm run build
npm start -- --csv ./data/products.csv --dryRun
```

## Logs
Each run writes one file:
- `logs/run_log_<YYYYMMDD_HHMMSS>.csv`
- Or `logs/<logPrefix>_run_log_<YYYYMMDD_HHMMSS>.csv` when `--logPrefix` is used

The last row is a `RUN_SUMMARY` row with summary JSON in `summaryJson`.
