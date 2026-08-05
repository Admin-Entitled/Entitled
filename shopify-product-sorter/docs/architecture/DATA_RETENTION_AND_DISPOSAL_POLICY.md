# Data Retention and Disposal Policy

## 1. Overview and Scope

This document establishes the canonical retention, archiving, and disposal specification for all data stores, temporary caches, audit logs, test outputs, and generated tool artifacts across the application ecosystem.

All data classification, retention thresholds, and disposal rules strictly enforce data containment, security safeguards, legal/incident hold overrides, and non-destructive defaults.

---

## 2. Retention Matrix

| Retention Class | Owner | Path / Scope | Sensitivity | Data Type | Min Retention | Max Retention | Deletion Trigger | Legal/Hold Behavior | Backup Included | Disposal Method | Cleanup Owner | Owning Task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1. Runtime Databases (SQLite)** | Product Sorter / Order Mapping | `server/data/app.db` | High | Authoritative | Indefinite (Active Service) | Indefinite | Manual decommissioning | Preserved on hold | Yes | Secure wipe on decommission | Database Administrator | DATA-001 |
| **2. Runtime Databases (PostgreSQL)** | Order Mapping | `order_mapping` schema | High | Authoritative | Indefinite (Active Service) | Indefinite | Manual decommissioning | Preserved on hold | Yes | Cascading drop / schema drop | Database Administrator | DATA-006 |
| **3. Database Backups** | Repository / Ops | `server/data/backups/` | High | Authoritative Copy | 30 days | 365 days | Expiration of backup window | Preserved on hold | External backup | Encrypted file removal | Backup Service / Ops | DATA-012 |
| **4. Migration Journals** | Migration Tooling | `server/data/migration-journal.json` / DB table | Medium | Authoritative Record | 90 days | Indefinite | Post-migration audit signoff | Preserved on hold | Yes | Truncated upon archived record | Ops Engineer | DATA-008 |
| **5. Application Audit Records** | Product Sorter | `server/data/sku-audit/` | Medium | Authoritative Audit | 180 days | 730 days | Expiration of audit lifecycle | Preserved on hold | Yes | File deletion with log | Sorter Service | DATA-004 |
| **6. Security Logs** | Security Boundary | `server/data/logs/security.log` | High | Diagnostic / Audit | 90 days | 365 days | Log rotation threshold | Preserved on hold | Yes | Log rotation truncation | Security Engineer | SEC-006 |
| **7. General Application Logs** | Server Runtime | `server/data/logs/app.log` | Low | Diagnostic | 14 days | 90 days | Log rotation threshold | Preserved on hold | No | Rotated & purged | Log Rotator | SEC-006 |
| **8. Diagnostics & Dumps** | Health / Debug | `server/data/diagnostics/` | Medium | Diagnostic | 7 days | 30 days | Expiration of debug ticket | Preserved on hold | No | File deletion | Ops Engineer | SEC-006 |
| **9. Product Sorter Snapshots** | Product Sorter | `server/data/snapshots/` | Low | Recreatable | 30 days | 180 days | Superseded snapshot limit | Preserved on hold | Yes | Atomic unlink | Sorter Service | DATA-003 |
| **10. Order Backups** | Product Sorter | `server/data/order-backups/` | Medium | Authoritative Copy | 60 days | 365 days | Expiration of order window | Preserved on hold | Yes | File removal | Sorter Service | DATA-003 |
| **11. SKU Audit Records** | SKU Image Manager | `server/data/sku-audit/records.json` | Low | Authoritative Audit | 90 days | 365 days | Audit log compaction | Preserved on hold | Yes | Log compaction | SKU Manager | DATA-004 |
| **12. SKU Upload Staging** | SKU Image Manager | `server/data/sku-uploads/` | Medium | Transient Staging | 1 hour | 24 hours | Upload completion / failure | Expiry deferred during hold | No | Atomic unlink after processing | SKU Manager | DATA-004 |
| **13. Sales Intelligence Caches** | Sales Intelligence | `server/data/sales-cache/` | Low | Recreatable Cache | 1 day | 7 days | Cache invalidation / TTL | Eviction allowed | No | Cache clear / purge | Sales Service | DATA-005 |
| **14. Sales Intelligence Exports** | Sales Intelligence | `server/data/sales-cache/exports/` | High (Customer) | Generated Export | 1 hour | 7 days | Download completion / TTL | Preserved on hold | No | Secure file unlink | Sales Service | DATA-005 |
| **15. CSV Imports** | Order Mapping | `server/data/csv-imports/` | High (Customer) | Transient Input | 1 day | 14 days | Import ingestion completion | Preserved on hold | No | File deletion | Order Mapping | DATA-006 |
| **16. Generated Reports** | Reporting | `server/data/reports/` | Medium | Recreatable | 30 days | 90 days | Report expiration | Preserved on hold | No | File deletion | Report Generator | DATA-011 |
| **17. Graphify Output** | Graphify Tooling | `graphify-out/` | Low | Recreatable Tooling | 0 days | 30 days | Re-indexing / Clean command | Eviction allowed | No | Directory clean | Tooling Maintainer | OPS-005 |
| **18. Playwright Artifacts** | E2E Testing | `test-results/playwright/` | Low | Recreatable Test | 0 days | 7 days | Test suite rerun / Clean | Eviction allowed | No | Directory clean | Test Runner | OPS-007 |
| **19. Test Results** | Architecture / CI | `test-results/` | Low | Recreatable Test | 0 days | 14 days | CI job completion / Clean | Eviction allowed | No | Directory clean | Test Runner | OPS-008 |
| **20. Coverage Reports** | CI Tooling | `coverage/` | Low | Recreatable Test | 0 days | 14 days | CI job completion / Clean | Eviction allowed | No | Directory clean | Test Runner | OPS-008 |
| **21. Temporary Fixtures** | Test Suite | `tests/fixtures/tmp/` | Low | Recreatable Test | 0 days | 1 day | Test process exit | Eviction allowed | No | Teardown hook unlink | Test Suite | OPS-008 |
| **22. TokenSave State** | External Indexer | `.tokensave/` | Low | External / Recreatable | 0 days | Indefinite | External tool reset | Eviction allowed | No | External tool clean | External Tool | OPS-006 |
| **23. Customer Exports** | Compliance | `server/data/exports/customer/` | Critical (PII) | Customer Data | 1 hour | 48 hours | Export download / expiry | Preserved on hold | No | Secure wipe | Compliance Officer | DATA-011 |
| **24. Failed-Import Quarantine**| Order Mapping | `server/data/quarantine/` | High | Quarantined Input | 7 days | 30 days | Operator review signoff | Preserved on hold | Yes | File deletion | Support / Ops | DATA-011 |
| **25. Reconciliation Exceptions**| Reconciliation | `server/data/reconciliation-exceptions/` | High | Diagnostic Audit | 30 days | 180 days | Exception resolution | Preserved on hold | Yes | File deletion | Reconciliation Tool | DATA-011 |

---

## 3. General Retention Principles

1. **No Statutory Period Invention:** All legal, contractual, and regulatory retention windows must be explicitly set by organizational policy or legal counsel; defaults defined herein are operational defaults.
2. **Customer Data Non-Retention:** Customer exports and CSV import files contain PII and MUST NOT be retained indefinitely. Expiry must occur automatically within 48 hours of download or 14 days of import.
3. **Safe Recreatability:** Caches (`sales-cache/`, `graphify-out/`, `test-results/`) are strictly recreatable and may be evicted on disk pressure without affecting production system behavior or data integrity.
4. **Independent Backup Retention:** Production database backups have independent retention policies and are not destroyed when runtime caches or temporary staging files are cleared.
5. **Legal / Incident Hold Override:** Any active legal hold, security incident investigation, or compliance audit overrides normal automated disposal triggers.
