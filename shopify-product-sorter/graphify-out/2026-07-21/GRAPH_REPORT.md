# Graph Report - .  (2026-07-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 354 nodes · 737 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.77)
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

## God Nodes (most connected - your core abstractions)
1. `reconcileSalesData()` - 18 edges
2. `shopifyGraphQL()` - 14 edges
3. `generateOrder()` - 14 edges
4. `logInfo()` - 13 edges
5. `buildAnalytics()` - 12 edges
6. `shopifyGraphQL()` - 12 edges
7. `syncCollectionOrder()` - 11 edges
8. `syncDeliveryOrders()` - 10 edges
9. `importLegacyCsv()` - 10 edges
10. `addImageToSkuProduct()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `buildDimensionScores()` --indirect_call--> `product()`  [INFERRED]
  client/src/App.jsx → server/src/services/sorter.test.js
- `buildScoringContext()` --indirect_call--> `product()`  [INFERRED]
  client/src/App.jsx → server/src/services/sorter.test.js
- `App()` --indirect_call--> `product()`  [INFERRED]
  client/src/App.jsx → server/src/services/sorter.test.js
- `buildAnalytics()` --indirect_call--> `label()`  [INFERRED]
  server/src/services/actualSalesService.js → client/src/DeliveryResolution.jsx
- `reorderSnapshot()` --indirect_call--> `product()`  [INFERRED]
  server/src/routes/api.js → server/src/services/sorter.test.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Collection Reorder Validation** — reorder_report_collection_reorder_test_report, reorder_report_shopify_reorder_job, reorder_report_storefront_order_verification, reorder_report_product_position_updates [EXTRACTED 1.00]

## Communities (19 total, 5 thin omitted)

### Community 0 - "Server Startup"
Cohesion: 0.09
Nodes (43): app, clientDistPath, __dirname, __dirname, ensureShopifyEnv(), env, envLoadReport, repoRoot (+35 more)

### Community 1 - "API and User Interface"
Cohesion: 0.07
Nodes (37): api, App(), buildDimensionScores(), buildScoringContext(), calculateScore(), defaultFilters, emptyPreview, extractTypeAndColor() (+29 more)

### Community 2 - "Sales Analytics"
Cohesion: 0.09
Nodes (46): buildAggregateRow(), buildAnalytics(), buildFormalSummary(), buildMetric(), buildOrderIndexes(), buildRestockSuggestion(), classifyShiprocketStatus(), COLOR_PREFIXES (+38 more)

### Community 3 - "Shopify Media and Orders"
Cohesion: 0.12
Nodes (35): addImageToSkuProduct(), attachImageToProduct(), buildInsertedOrder(), buildSkuQuery(), bulkAddImageToSkuProducts(), computeReorderMoves(), confirmBulkDelete(), dedupeByProduct() (+27 more)

### Community 4 - "Delivery Import Workflows"
Cohesion: 0.15
Nodes (26): upload, automatic(), getImport(), getOrdersForLegacy(), listOrders(), logUnknownStatus(), now(), resetManualResolution() (+18 more)

### Community 5 - "Database and Uploads"
Cohesion: 0.15
Nodes (19): db, resolvedPath, applyGeneratedOrder(), mergeSnapshotWithPreferences(), reorderSnapshot(), saveSnapshot(), settingsFor(), upload (+11 more)

### Community 6 - "Product Sorting Logic"
Cohesion: 0.19
Nodes (19): byId(), clamp(), compare(), day(), diversify(), generateOrder(), inventory(), newness() (+11 more)

### Community 7 - "Server Dependencies"
Cohesion: 0.11
Nodes (18): better-sqlite3, cors, dotenv, express, multer, dependencies, better-sqlite3, cors (+10 more)

### Community 8 - "Client Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, devDependencies, vite, @vitejs/plugin-react, name, private (+10 more)

### Community 9 - "Development Scripts"
Cohesion: 0.11
Nodes (18): concurrently, devDependencies, concurrently, name, private, scripts, build, client (+10 more)

### Community 10 - "Shiprocket Integration"
Cohesion: 0.50
Nodes (7): authenticate(), base(), configured(), delay(), fetchShiprocketOrders(), request(), timeoutMs

### Community 11 - "Shopify Reorder Tests"
Cohesion: 0.83
Nodes (4): Collection Reorder Test Report, Product Position Updates, Shopify Reorder Job, Storefront Order Verification

### Community 12 - "Product Placement Documentation"
Cohesion: 0.67
Nodes (3): Entitled Club Collection Placement Manager, Local Order Backup, Shopify Admin GraphQL API

## Knowledge Gaps
- **78 isolated node(s):** `{ test, expect }`, `name`, `version`, `private`, `type` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `product()` connect `Product Sorting Logic` to `API and User Interface`, `Database and Uploads`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `buildAnalytics()` connect `Sales Analytics` to `API and User Interface`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `label()` connect `API and User Interface` to `Sales Analytics`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `generateOrder()` (e.g. with `compare()` and `product()`) actually correct?**
  _`generateOrder()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ test, expect }`, `name`, `version` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Startup` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._
- **Should `API and User Interface` be split into smaller, more focused modules?**
  _Cohesion score 0.07265306122448979 - nodes in this community are weakly interconnected._