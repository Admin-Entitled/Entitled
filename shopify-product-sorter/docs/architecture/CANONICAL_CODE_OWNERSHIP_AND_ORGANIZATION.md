# Canonical Code Ownership and File Organization

> **Canonical Document**: `DOC-010`  
> **Status**: APPROVED / ACTIVE  
> **Last Updated**: 2026-08-07  

## 1. Directory Tree & Module Boundaries

```
shopify-product-sorter/
├── client/                     # Frontend Vite React SPA
│   └── src/
│       ├── App.js              # Application shell & navigation
│       ├── SorterDashboard.js  # Product Sorter UI feature
│       ├── SkuImageManager.js  # SKU Image Manager UI feature
│       └── OrderMappingDashboard.js # Order Mapping UI feature
├── server/                     # Backend Express App
│   ├── src/
│   │   ├── config/             # Environment validation (env.js)
│   │   ├── db/                 # SQLite setup & Knex PostgreSQL migrations
│   │   ├── middleware/         # Error boundary, validation, capability checks
│   │   ├── mocks/              # Offline synthetic integration mocks
│   │   ├── routes/             # Express API routers (sorter, skuMedia, etc.)
│   │   ├── services/           # Application service logic & provider clients
│   │   ├── utils/              # Sanitization & helper utilities
│   │   ├── app.js              # Express app setup
│   │   └── index.js            # Server entrypoint
├── docs/                       # Architectural documentation & ledger
│   └── architecture/
│       ├── ledger/             # Tasks database & SHA-256 history log
│       └── *.md                # Architectural specifications & runbooks
├── scripts/                    # CLI tools (architecture-ledger.mjs, verify.mjs)
└── tests/                      # Suite-level integration & governance tests
```
