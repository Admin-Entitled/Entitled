# Shiprocket Dimensions Automation

## What this tool does

- Takes the latest Shiprocket Channel Products CSV.
- Updates every product row with the configured universal weight and dimensions.
- Preserves all other columns.
- Creates a canary CSV for testing one SKU.
- Creates a full CSV for all products.
- Does not create products.
- Does not edit Shopify.
- Does not automatically upload to Shiprocket unless a future uploader is added.

## When to use this

Use this whenever:

- New SKUs/products are synced into Shiprocket.
- Weight changes.
- Dimensions change.
- Shiprocket rejects orders because product dimensions are missing or wrong.

## One-time .env setup

Set these values in `.env`:

```env
SHIPROCKET_UPLOAD_CHANNEL_NAME=Shopify
FORCE_CHANNEL_NAME=true

UNIVERSAL_WEIGHT_KG=0.1
UNIVERSAL_LENGTH_CM=30
UNIVERSAL_BREADTH_CM=20
UNIVERSAL_HEIGHT_CM=1

TEST_SKU=your-real-test-sku
```

- `SHIPROCKET_UPLOAD_CHANNEL_NAME` must remain `Shopify` because Shiprocket rejected `Entitled Club (Shopify)`.
- Weight is in kg.
- Dimensions are in cm.
- Dimensions output format will be `30x20x1`.

## Normal workflow

### Step 1

Download latest CSV from Shiprocket:

Setup & Manage -> Catalogue -> Channel Products -> Upload icon -> Download product file

### Step 2

Run:

```bash
npm run import-latest-csv
```

### Step 3

Inspect:

```bash
npm run inspect-input
```

### Step 4

Prepare updated CSV:

```bash
npm run prepare-csv
```

### Step 5

Verify:

```bash
npm run verify-csv
```

### Step 6

Upload canary first:

```text
output/shiprocket-channel-products-canary.csv
```

### Step 7

If canary is accepted, upload the full generated CSV shown by the terminal.

## Fast command block

```bash
npm run import-latest-csv
npm run inspect-input
npm run prepare-csv
npm run verify-csv
```

## Output files explained

`output/shiprocket-channel-products-canary.csv`

- Small test file with one SKU.
- Upload this first.

`output/shiprocket-channel-products-updated-YYYY-MM-DD-HHmmss.csv`

- Full file with all product rows updated.
- Upload only after canary succeeds.

`output/latest-success.json`

- Points to the latest verified full output file.
- `verify-csv` uses this manifest.
- Do not delete it unless regenerating.

## What not to upload

- Do not upload old output files.
- Do not upload error files downloaded from Shiprocket.
- Do not upload files from `backups/`.
- Do not upload any file unless `npm run verify-csv` passes.

## Troubleshooting

Problem:

`Channel with given name does not exist`

Fix:

```env
SHIPROCKET_UPLOAD_CHANNEL_NAME=Shopify
FORCE_CHANNEL_NAME=true
```

Then rerun:

```bash
npm run prepare-csv
npm run verify-csv
```

Problem:

`Input CSV file not found`

Fix:

```bash
npm run import-latest-csv
```

Or manually copy latest Shiprocket CSV to:

```text
input/shiprocket-channel-products.csv
```

Problem:

`TEST_SKU not found`

Fix:

This should not stop full CSV generation. The tool should choose the first valid SKU as canary. Update `TEST_SKU` later if needed.

Problem:

`verify-csv says no successful manifest`

Fix:

```bash
npm run prepare-csv
npm run verify-csv
```

Problem:

`All Shopify SKUs appear missing from CSV`

Fix:

```bash
npm run inspect-input
```

Check that the correct latest Shiprocket file is imported and SKU column is detected correctly.

## Important notes

- Shiprocket does not automatically import SKU dimensions.
- Shiprocket expects product dimensions to be updated through Channel Products CSV upload.
- Upload canary first every time.
- Full upload only after canary passes.

## Final checklist

Before uploading full CSV:

- [ ] Latest CSV imported
- [ ] `inspect-input` looks correct
- [ ] `prepare-csv` completed
- [ ] `verify-csv` passed
- [ ] Canary uploaded successfully
- [ ] Full file uploaded after canary success
