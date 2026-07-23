# Graph Report - shopify-product-sorter  (2026-07-23)

## Corpus Check
- 63 files · ~58,552 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 570 nodes · 1162 edges · 23 communities (18 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `95f9bcc6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Server Startup
- API and User Interface
- Sales Analytics
- Shopify Media and Orders
- Delivery Import Workflows
- Database and Uploads
- Product Sorting Logic
- Server Dependencies
- Client Dependencies
- Development Scripts
- Shiprocket Integration
- Shopify Reorder Tests
- Product Placement Documentation
- Development Process Control
- Project Workflow Rules
- Application Entry Points
- Delivery Repository Tests
- Product Filter E2E Tests
- Neon
- `@neon/sdk` — the TypeScript client for the Neon API
- routes/api.js
- orderMappingShiprocket.js

## God Nodes (most connected - your core abstractions)
1. `reconcileSalesData()` - 18 edges
2. `Neon Serverless Postgres` - 17 edges
3. `shopifyGraphQL()` - 16 edges
4. `applyShipmentUpdate()` - 14 edges
5. `generateOrder()` - 14 edges
6. ``@neon/sdk` — the TypeScript client for the Neon API` - 14 edges
7. `env` - 13 edges
8. `orderMappingQuery()` - 13 edges
9. `logInfo()` - 13 edges
10. `buildAnalytics()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `buildAnalytics()` --indirect_call--> `label()`  [INFERRED]
  server/src/services/actualSalesService.js → client/src/OrderMapping.jsx
- `startServer()` --calls--> `runOrderMappingMigrations()`  [EXTRACTED]
  server/src/index.js → server/src/services/orderMappingMigrations.js
- `settingsFor()` --calls--> `getStrategySettings()`  [EXTRACTED]
  server/src/routes/api.js → server/src/services/strategySettings.js
- `applyGeneratedOrder()` --calls--> `syncCollectionOrder()`  [EXTRACTED]
  server/src/routes/api.js → server/src/services/shopifyService.js
- `refreshShopifySalesData()` --calls--> `fetchActualSalesOrders()`  [EXTRACTED]
  server/src/services/actualSalesService.js → server/src/services/shopifyService.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Collection Reorder Validation** — reorder_report_collection_reorder_test_report, reorder_report_shopify_reorder_job, reorder_report_storefront_order_verification, reorder_report_product_position_updates [EXTRACTED 1.00]

## Communities (23 total, 5 thin omitted)

### Community 0 - "Server Startup"
Cohesion: 0.10
Nodes (41): app, clientDistPath, __dirname, __dirname, ensureShopifyEnv(), env, envLoadReport, repoRoot (+33 more)

### Community 1 - "API and User Interface"
Cohesion: 0.07
Nodes (41): api, App(), buildDimensionScores(), buildScoringContext(), calculateScore(), defaultFilters, emptyPreview, extractTypeAndColor() (+33 more)

### Community 2 - "Sales Analytics"
Cohesion: 0.09
Nodes (46): buildAggregateRow(), buildAnalytics(), buildFormalSummary(), buildMetric(), buildOrderIndexes(), buildRestockSuggestion(), classifyShiprocketStatus(), COLOR_PREFIXES (+38 more)

### Community 3 - "Shopify Media and Orders"
Cohesion: 0.12
Nodes (35): addImageToSkuProduct(), attachImageToProduct(), buildInsertedOrder(), buildSkuQuery(), bulkAddImageToSkuProducts(), computeReorderMoves(), confirmBulkDelete(), dedupeByProduct() (+27 more)

### Community 4 - "Delivery Import Workflows"
Cohesion: 0.11
Nodes (34): automatic(), getImport(), getOrdersForLegacy(), listOrders(), logUnknownStatus(), now(), resetManualResolution(), saveAutomaticResolution() (+26 more)

### Community 5 - "Database and Uploads"
Cohesion: 0.06
Nodes (79): upload, COLUMN_ALIASES, detectMap(), orderMappingCsvColumns(), parseCsv(), parseOrderMappingCsv(), parseTimestamp(), closeOrderMappingPool() (+71 more)

### Community 6 - "Product Sorting Logic"
Cohesion: 0.17
Nodes (23): ageInDays(), clamp(), compareScored(), dayKey(), deterministicSeed(), distributeSlots(), diversify(), generateOrder() (+15 more)

### Community 7 - "Server Dependencies"
Cohesion: 0.08
Nodes (25): better-sqlite3, cors, dotenv, express, multer, @neondatabase/serverless, pg, dependencies (+17 more)

### Community 8 - "Client Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, devDependencies, vite, @vitejs/plugin-react, name, private (+10 more)

### Community 9 - "Development Scripts"
Cohesion: 0.11
Nodes (18): concurrently, devDependencies, concurrently, name, private, scripts, build, client (+10 more)

### Community 10 - "Shiprocket Integration"
Cohesion: 0.06
Nodes (31): Autoscaling, Branching, Check Status Quo, Connection Methods & Drivers, Connection Pooling, Developer Tools, Fetching Docs as Markdown, Finding the Right Page (+23 more)

### Community 11 - "Shopify Reorder Tests"
Cohesion: 0.83
Nodes (4): Collection Reorder Test Report, Product Position Updates, Shopify Reorder Job, Storefront Order Verification

### Community 12 - "Product Placement Documentation"
Cohesion: 0.67
Nodes (3): Entitled Club Collection Placement Manager, Local Order Backup, Shopify Admin GraphQL API

### Community 19 - "Neon"
Cohesion: 0.07
Nodes (26): Architecture: how Neon fits, Branch configuration, Branch-First Dev Flow, Check Status Quo, Choosing the Right Skill, Fetching Docs as Markdown, Finding the Right Page, Getting Started with Neon (+18 more)

### Community 20 - "`@neon/sdk` — the TypeScript client for the Neon API"
Cohesion: 0.10
Nodes (20): API surface (ergonomic client), Beta services, Client configuration, Drop down to the raw client, Errors, Further reading, Install, Migrating from `@neondatabase/api-client` (+12 more)

### Community 21 - "routes/api.js"
Cohesion: 0.09
Nodes (38): db, resolvedPath, applyGeneratedOrder(), mergeSnapshotWithPreferences(), reorderSnapshot(), saveSnapshot(), settingsFor(), upload (+30 more)

### Community 22 - "orderMappingShiprocket.js"
Cohesion: 0.44
Nodes (8): authenticateShiprocket(), baseUrl(), configured(), fetchOrderMappingShiprocketShipments(), normalizeShiprocketRow(), shiprocketRequest(), sleep(), timeoutMs

## Knowledge Gaps
- **160 isolated node(s):** `{ test, expect }`, `name`, `version`, `private`, `type` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildAnalytics()` connect `Sales Analytics` to `API and User Interface`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `label()` connect `API and User Interface` to `Sales Analytics`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `env` connect `Server Startup` to `Shopify Media and Orders`, `Delivery Import Workflows`, `Database and Uploads`, `routes/api.js`, `orderMappingShiprocket.js`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `{ test, expect }`, `name`, `version` to the rest of the system?**
  _160 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Startup` be split into smaller, more focused modules?**
  _Cohesion score 0.10017730496453901 - nodes in this community are weakly interconnected._
- **Should `API and User Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.06531986531986532 - nodes in this community are weakly interconnected._
- **Should `Sales Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.08788159111933395 - nodes in this community are weakly interconnected._