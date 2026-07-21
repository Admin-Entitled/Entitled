# Shopify Abandoned Checkout to WATI CSV Cleaner

This local tool reads the latest Shopify abandoned checkout CSV from `input/`, enriches missing recovery links from the Shopify Admin API when possible, and writes a WATI-ready CSV to `output/`.

The script is safe to run repeatedly. Every run creates new timestamped output files and does not overwrite older files.

## Files and Folders

- `process_shopify_abandoned_checkouts.py` - the processor
- `.env` - Shopify Admin API settings
- `input/` - place the raw Shopify CSV export here
- `output/` - generated CSVs and reports are saved here
- `requirements.txt` - no external Python packages are required

## Required `.env` Fields

Create a `.env` file in this folder:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2026-01
```

The access token must have access to abandoned checkout/order data. Shopify's REST abandoned checkout endpoint requires the `orders` access scope and protected customer data access.

If the CSV already contains recovery URLs, the API fallback is not needed. If the CSV is missing recovery URL columns, the script tries to fetch abandoned checkouts from Shopify and match them back to CSV rows using email, phone, created time, order value, and customer details.

If `.env` is missing or the API call fails, the script does not crash. Rows with valid phone numbers are still exported with a blank `recovery_url` and a clear `error_reason`.

## Where to Put the Shopify CSV

Put the Shopify export CSV inside:

```text
input/
```

The script automatically reads the newest `.csv` file in `input/`.

## Command to Run

From this folder:

```bash
python3 process_shopify_abandoned_checkouts.py
```

Optional custom folders:

```bash
python3 process_shopify_abandoned_checkouts.py --input-dir /path/to/input --output-dir /path/to/output --env-file /path/to/.env
```

## WATI Upload CSV

Upload this file to WATI:

```text
output/wati_ready_abandoned_checkouts_YYYYMMDD_HHMMSS.csv
```

It always contains exactly these columns:

```text
phone,first_name,order_value,recovery_url,abandoned_checkout_created_at,customer_email,error_reason
```

Phone numbers are normalized to strict Indian WATI format:

```text
91XXXXXXXXXX
```

Rows with invalid or blank phone numbers are rejected and are not included in the WATI upload CSV.

## Other Generated Files

Each run also creates:

- `output/rejected_rows_YYYYMMDD_HHMMSS.csv` - rows rejected because of invalid/blank phone numbers or older duplicate phone records
- `output/validation_report_YYYYMMDD_HHMMSS.txt` - run summary, detected columns, API fallback status, counts, and final output path

## Recovery URL Priority

When API fallback finds a matching abandoned checkout, URL selection uses this priority:

1. Shopify API `abandoned_checkout_url`
2. Recovery URL already present in the CSV
3. Shopify API `web_url`, `checkout_url`, `recovery_url`, `recover_url`, or another valid checkout/recovery link found in the API response

If no URL is available, the row remains in the WATI output with blank `recovery_url` and `error_reason` explaining the issue.

## Deduplication

The script deduplicates by `phone`. If the same phone appears multiple times, only the latest abandoned checkout is kept based on `abandoned_checkout_created_at`. Older duplicate rows are written to the rejected rows CSV.
