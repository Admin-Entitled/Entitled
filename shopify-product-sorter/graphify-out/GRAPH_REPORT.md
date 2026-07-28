# Graph Report - shopify-product-sorter  (2026-07-24)

## Corpus Check
- 64 files · ~91,418 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 586 nodes · 1210 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4939e06a`
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
- OrderMapping.jsx

## God Nodes (most connected - your core abstractions)
1. `reconcileSalesData()` - 18 edges
2. `Neon Serverless Postgres` - 17 edges
3. `shopifyGraphQL()` - 16 edges
4. `applyShipmentUpdate()` - 15 edges
5. `generateOrder()` - 14 edges
6. ``@neon/sdk` — the TypeScript client for the Neon API` - 14 edges
7. `env` - 13 edges
8. `orderMappingQuery()` - 13 edges
9. `logInfo()` - 13 edges
10. `shopifyGraphQL()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `settingsFor()` --calls--> `getStrategySettings()`  [EXTRACTED]
  server/src/routes/api.js → server/src/services/strategySettings.js
- `applyGeneratedOrder()` --calls--> `syncCollectionOrder()`  [EXTRACTED]
  server/src/routes/api.js → server/src/services/shopifyService.js
- `refreshShopifySalesData()` --calls--> `fetchActualSalesOrders()`  [EXTRACTED]
  server/src/services/actualSalesService.js → server/src/services/shopifyService.js
- `refreshShiprocketSalesData()` --calls--> `fetchShiprocketOrders()`  [EXTRACTED]
  server/src/services/actualSalesService.js → server/src/services/shiprocketService.js
- `fetchDeliveryOrders()` --calls--> `shopifyGraphQL()`  [EXTRACTED]
  server/src/services/deliveryShopify.js → server/src/services/shopifyService.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Collection Reorder Validation** — reorder_report_collection_reorder_test_report, reorder_report_shopify_reorder_job, reorder_report_storefront_order_verification, reorder_report_product_position_updates [EXTRACTED 1.00]

## Communities (24 total, 5 thin omitted)

### Community 0 - "Server Startup"
Cohesion: 0.08
Nodes (48): app, clientDistPath, __dirname, __dirname, ensureShopifyEnv(), env, envLoadReport, repoRoot (+40 more)

### Community 1 - "API and User Interface"
Cohesion: 0.10
Nodes (31): api, App(), buildDimensionScores(), buildScoringContext(), calculateScore(), defaultFilters, emptyPreview, extractTypeAndColor() (+23 more)

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
Nodes (78): upload, COLUMN_ALIASES, detectMap(), orderMappingCsvColumns(), parseCsv(), parseOrderMappingCsv(), parseTimestamp(), orderMappingQuery() (+70 more)

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
Cohesion: 0.42
Nodes (10): authenticateShiprocket(), baseUrl(), configured(), fetchOrderMappingShiprocketShipments(), fetchOrderMappingShiprocketTracking(), normalizeShiprocketRow(), shiprocketRequest(), sleep() (+2 more)

### Community 23 - "OrderMapping.jsx"
Cohesion: 0.17
Nodes (17): formatCount(), formatCurrency(), formatDate(), formatText(), getEmail(), getOrderLabel(), getSubtitle(), loadShopifyOrders() (+9 more)

## Knowledge Gaps
- **159 isolated node(s):** `{ test, expect }`, `name`, `version`, `private`, `type` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `env` connect `Server Startup` to `Shopify Media and Orders`, `Delivery Import Workflows`, `Database and Uploads`, `routes/api.js`, `orderMappingShiprocket.js`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `generateOrder()` connect `Product Sorting Logic` to `routes/api.js`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `fetchShiprocketOrders()` connect `Delivery Import Workflows` to `Sales Analytics`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `{ test, expect }`, `name`, `version` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Startup` be split into smaller, more focused modules?**
  _Cohesion score 0.08182349503214495 - nodes in this community are weakly interconnected._
- **Should `API and User Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.0953058321479374 - nodes in this community are weakly interconnected._
- **Should `Sales Analytics` be split into smaller, more focused modules?**
  _Cohesion score 0.08788159111933395 - nodes in this community are weakly interconnected._