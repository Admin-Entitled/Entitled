# Navigation Ownership Boundary

**Task:** `FE-002` — Extract navigation ownership  
**Date:** 2026-07-31  
**Status:** `APPROVED`  
**Scope:** All navigation components, module switching, and route state in `client/src/App.jsx`

---

## 1. Document Control & Overview

| Field | Value |
| --- | --- |
| Task ID | `FE-002` |
| Title | Extract navigation ownership |
| Primary Owner | Frontend / Shell Owner |
| Scope | `client/src/App.jsx` navigation section (lines 6–30, 1212–1230) |
| Creation Date | 2026-07-31 |
| Status | `APPROVED` |

---

## 2. Executive Summary

This document defines the authoritative ownership boundary for application navigation. Navigation has one owner. Disabled labels cannot render nonexistent code. Active state is derived from explicit route/module state.

---

## 3. Navigation Registry

### 3.1 Module Definitions

| Module ID | Label | Enabled | Owner | Component |
| --- | --- | --- | --- | --- |
| `sorter` | Shopify Collection Manager | Yes | Shell / Product Sorter | Inline in `App.jsx` |
| `order-mapping` | Order Mapping | Yes | Shell / Order Mapping | `OrderMapping.jsx` |
| `sku-image-manager` | SKU Image Manager | Yes | Shell / SKU Image Manager | `SkuImageManager.jsx` |
| `meta-ads` | Meta Ads Dashboard | No | None | None (placeholder) |
| `analytics` | Product Analytics | No | None | None (placeholder) |
| `inventory` | Inventory | No | None | None (placeholder) |
| `reports` | Reports | No | None | None (placeholder) |
| `settings` | Settings | No | None | None (placeholder) |

### 3.2 Navigation Ownership Rules

| Rule | Description |
| --- | --- |
| **Single Owner** | The Shell (`App.jsx`) is the single owner of navigation state and rendering |
| **No Render Without Code** | Disabled modules (`enabled: false`) must not render any component or make API calls |
| **Explicit Active State** | `activeModule` state variable is the sole source of truth for which module is displayed |
| **Module Cannot Self-Navigate** | Individual modules cannot change `activeModule`; only the Shell can |

---

## 4. Active State Derivation

| State Variable | Type | Owner | Derivation |
| --- | --- | --- | --- |
| `activeModule` | `useState("sorter")` | Shell | Explicitly set by sidebar click handler |
| `sidebarModules` | `const` array | Shell | Static module registry; never mutated |
| `item.enabled` | `boolean` | Shell | Controls whether module is clickable |

### 4.1 Navigation Flow

```
User clicks sidebar item
    ↓
Shell checks item.enabled
    ↓ (if true)
Shell calls setActiveModule(item.id)
    ↓
Shell renders active component based on activeModule
```

---

## 5. Disabled Label Safety

| Disabled Module | Current Behavior | Required Behavior |
| --- | --- | --- |
| `meta-ads` | Not rendered (no component) | No component, no API call, no state |
| `analytics` | Not rendered | No component, no API call, no state |
| `inventory` | Not rendered | No component, no API call, no state |
| `reports` | Not rendered | No component, no API call, no state |
| `settings` | Not rendered | No component, no API call, no state |

Disabled modules are **never** rendered, never make API calls, and never initialize state. They exist only as navigation placeholders.

---

## 6. Acceptance Criteria Verification

- [x] **Navigation has one owner.** (Shell owns all navigation state and rendering).
- [x] **Disabled labels cannot render nonexistent code.** (Section 5: disabled modules never render components or make API calls).
- [x] **Active state is derived from explicit route/module state.** (Section 4: `activeModule` is the sole source of truth).
