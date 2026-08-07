# Entitled Club Collection Placement Manager

Local Shopify collection placement dashboard for Entitled Club.

## Stack

- Node.js + Express backend
- React + Vite frontend
- Shopify Admin GraphQL API
- SQLite local storage

## Folder Structure

```text
.
├── client
│   ├── index.html
│   ├── package.json
│   ├── src
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
├── server
│   ├── package.json
│   └── src
│       ├── app.js
│       ├── index.js
│       ├── config
│       │   └── env.js
│       ├── db
│       │   └── database.js
│       ├── routes
│       │   └── api.js
│       ├── services
│       │   ├── collectionStateService.js
│       │   ├── shopifyService.js
│       │   └── sorter.js
│       └── utils
│           └── logger.js
├── .env.example
└── package.json
```

## Setup & Run

### Development Startup

```bash
npm install
npm run dev
```

### Health Check

```bash
npm run verify
```

### Local Shopify Setup

Product Sorter runs without Shopify configured: the app starts normally, the
backend stays healthy, and the UI shows a **Connect Shopify** setup state
instead of an empty dashboard. No Shopify requests are made until Shopify is
configured.

To connect a local store:

1. Copy the template and edit it:

   ```bash
   cp .env.example .env
   ```

2. Choose **one** authentication mode and fill it in.

   **Option 1 — Static Admin API token** (simplest):

   ```
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
   ```

   **Option 2 — Client credentials**:

   ```
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_CLIENT_ID=...
   SHOPIFY_CLIENT_SECRET=...
   ```

   `SHOPIFY_API_VERSION` is optional and defaults to the app's supported
   version.

3. Restart the dev servers, then press **Retry connection** in the Product
   Sorter header. The app loads collections only when Shopify is available;
   it never retries automatically.

> Never commit `.env`. It is git-ignored; only `.env.example` is tracked.
> Secret values are never sent to the browser or written to logs.


## Shopify Admin API Scopes Needed

- `read_products`
- `read_collections`
- `write_products`
- `read_inventory`
- `read_orders` for sold quantity / revenue aggregation

## Notes

- The backend fetches active products from the selected collection and aggregates sales metrics from orders within `SHOPIFY_ANALYTICS_DAYS`.
- Collection order updates only modify product placement inside the selected collection.
- Every apply action saves a local backup so the last order can be rolled back.
- Shopify authentication now prefers a cached refreshable token and falls back to `SHOPIFY_ADMIN_ACCESS_TOKEN` if you still have one.
