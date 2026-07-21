# Shopify-Shiprocket Dimension Synchronizer

This automation tool synchronizes Shopify product variant SKUs to Shiprocket and applies universal outer package dimensions and weights across all matching items. It pulls active product variants from Shopify Admin GraphQL API, triggers synchronization in Shiprocket, downloads the official Channel Products CSV from Shiprocket using Playwright, transforms the CSV using dynamic header detection, uploads the CSV back to Shiprocket, and verifies the final dimensions using REST APIs.

---

## Architecture and Design

- **GQL Pagination**: Automatically paginates and combines all Shopify product variants.
- **Safety Checks**: Rejects blank SKUs and aborts execution if duplicate SKUs are detected in Shopify. Ignores draft and archived products by default.
- **Browser Automation Profile**: Saves state and cookies under `browser-profile/` on first-time manual login. Playwright then uses this persistent context to download and upload product CSVs.
- **API Polling & Timeout**: Automatically polls Shiprocket product catalog API for newly added Shopify variants, waiting up to `SHIPROCKET_SYNC_WAIT_MINUTES`.
- **Dynamic Header Mapping**: Maps CSV column headers case-insensitively using standard aliases (e.g. `SKU Code`, `Width`, `Weight KG`), preserving unrelated columns and rows.
- **Safety & Verification**: Takes backups of every downloaded CSV before editing, skips products that already have matching universal dimensions (idempotent runs), and checks final API outputs post-upload to confirm updates actually persisted.

---

## Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in the parameters:
   - **Shopify**: Provide your `myshopify.com` domain, GraphQL admin access token, and version.
   - **Shiprocket**: Provide your dedicated Shiprocket API-User email and password.
   - **Universal Dimensions**: Select packaging length, width, height, and weight to be applied to all products:
     ```env
     UNIVERSAL_LENGTH_CM=28
     UNIVERSAL_BREADTH_CM=24
     UNIVERSAL_HEIGHT_CM=4
     UNIVERSAL_WEIGHT_KG=0.5
     ```
   - **Headless Mode**: Leave `HEADLESS=false` on first run to authenticate the browser.

---

## Commands & Usage

### 1. Persistent Browser Setup
Launch the browser visually to manually log into your Shiprocket merchant dashboard and complete any OTP challenges. This creates a persistent profile in `browser-profile/`:
```bash
npm run setup
```
*Note: Run this command, enter your email/password/OTP on the browser window, let it navigate to the dashboard, and then press Enter in the terminal to save session state.*

### 2. Run Dry Run (Simulation)
Pulls all Shopify variants, fetches the current Shiprocket REST catalog, matches SKUs, and prints a simulation report showing what dimensions require updates without opening any browser or changing data:
```bash
npm run dry-run
```

### 3. Run Synchronizer
To download the CSV, update dimensions, upload it back to Shiprocket, and run verification:
- **Preparation Mode** (CSV created in `output/` but not uploaded):
  ```bash
  npm run sync
  ```
- **Real Synchronization** (uploads file and verifies updates):
  ```bash
  npm run sync -- --apply
  ```

### 4. Run Verification Only
Runs verification checks against the Shiprocket REST catalog to verify all Shopify variants match the universal dimensions without downloading or uploading CSV files:
```bash
npm run verify
```

### 5. Run Unit Tests
Run the Jest test suite:
```bash
npm test
```

---

## CSV Column Aliases

The CSV transformer dynamically searches headers case-insensitively using the following aliases. If any critical column is missing, the tool stops execution and displays the available headers:
- **SKU**: `sku`, `sku code`, `channel sku`, `product sku`, `seller sku`
- **Weight**: `weight`, `weight kg`, `weight_kg`, `product weight`
- **Length**: `length`, `length_cm`, `length cm`
- **Breadth/Width**: `breadth`, `width`, `breadth_cm`, `width_cm`, `breadth cm`, `width cm`
- **Height**: `height`, `height_cm`, `height cm`
