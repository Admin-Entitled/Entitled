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
