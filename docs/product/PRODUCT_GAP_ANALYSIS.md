# Product Gap Analysis and Baseline Evaluation

## 1. Executive Summary & Assessment Baseline

This analysis establishes the functional, usability, and technical maturity baseline of the **Departmental Store Multi-Tenant SaaS Platform** following Phase 11. The evaluation is grounded strictly in demonstrated codebase capabilities, pilot cohort requirements, and verified operational evidence from local ERPNext/Frappe v16, Windows POS (Tauri 2), Next.js 15 Owner Dashboard, and Expo Mobile Companion.

### System Baseline
- **Git Commit Baseline**: `cce5ba7` (`feat(release): continuous delivery, release governance, and long-term operations (Phase 11)`)
- **Verified Working Workflows**:
  * Windows POS offline-first billing, SQLite outbox, idempotent server sales submission, and receipt printing.
  * ERPNext central accounting, inventory valuation, and GST tax ledger.
  * Multi-dimensional tenant onboarding, domain routing, and platform admin operations cockpit.
  * SaaS subscription billing, customer self-service billing portal, and server-enforced counter limits.
  * Automated CI quality gates, tenant canary migration runner, and release simulation suite.

---

## 2. Inventory of Existing Features & Gaps by Surface

### 2.1 Owner Dashboard (`apps/owner-dashboard`)
| Workflow / Screen | Current Implementation | Identified Friction / Gaps | Classification |
| :--- | :--- | :--- | :--- |
| **Store Profile & Settings** | Static display in `SettingsClient.tsx` ("Departmental Store", "Southern Tamil Nadu") with feature flag toggles. | Shop owner cannot update store trading name, address, phone, or custom receipt header/footer from the dashboard. | **Confirmed customer problem** |
| **Catalog Management** | Server-paginated product table with text search (`item_code`, `item_name`, barcodes). | Lacks quick stock status filter (In Stock vs Out of Stock) and column sorting. | **Observed usability issue** |
| **Inventory & Stock Alerts** | Days-to-expiry filter, out-of-stock, below reorder level, and expiring batches. | Lacks an actionable CSV/PDF export of low-stock items for supplier reordering. | **Confirmed customer problem** |
| **Sales & Daily Bills** | Recent invoices list, Gross/Returns totals for current slice. | Terminology discrepancy ("Invoices" vs "Bills"); pagination calculation only reflects current page slice rather than full day aggregates. | **Observed usability issue** |
| **Sync & Counter Health** | List of registered counters, last sync timestamp, review queue. | Lacks in-app counter diagnostic trigger and manual sync backlog ping. | **Technical reliability gap** |
| **Customer Support & Help** | Absence of dedicated in-app support request intake or self-service troubleshooting. | Owners must contact engineers via external channels; no sanitized diagnostic export for field support. | **Confirmed customer problem** |

### 2.2 Windows POS Billing Counter (`apps/windows-pos`)
| Workflow / Screen | Current Implementation | Identified Friction / Gaps | Classification |
| :--- | :--- | :--- | :--- |
| **Checkout & Barcode Scan** | Fast barcode input, F2-F9 keyboard shortcuts, minor-unit money arithmetic. | High-speed barcode scanners occasionally prefix trailing whitespace or newlines. | **Technical reliability gap** |
| **Returns & Exchanges** | `ReturnsScreen.tsx` with original invoice lookup and item quantity return. | Requires manager role for bills older than shift window; clear manager override dialog present. | **Observed usability issue** |
| **Offline Durability & Sync**| SQLite durable outbox, atomic sale+outbox transaction, sync engine. | Fully functional; resubmission tested in Phase 11 release simulation. | **Verified robust** |
| **Hardware Printers** | ESC/POS receipt builder and ZPL/TSPL label builder. | Software generation verified; physical USB printer paper cut verification blocked pending on-site hardware. | **Technical reliability gap** |

### 2.3 Custom Frappe Backend (`erpnext-app/departmental_store`)
| Module / API | Current Implementation | Identified Friction / Gaps | Classification |
| :--- | :--- | :--- | :--- |
| **Store Profile API** | Single DocType `Departmental Store Settings` stores feature flags. | Lacks dedicated tenant store profile fields (store name, phone, address, receipt headers) editable by Store Manager. | **Confirmed customer problem** |
| **Audit Logging** | Structured logging in `departmental_store.log` and `tabActivity Log`. | Comprehensive; covers flags, migrations, and tenant lifecycle. | **Verified robust** |
| **Telemetry & Health** | Public `get_liveness`, protected `get_system_health`, `get_pilot_status`. | Operational metrics tracked; product usage metrics (feature adoption, onboarding funnel) unaggregated. | **Business opportunity requiring validation** |

---

## 3. Prioritized Classification of Identified Gaps

```
+----------------------------------------------------------------------------------------------------+
| 1. Confirmed Customer Problems (Top Priority — Implement in Phase 12)                              |
| - Editable Store Profile & Custom Receipt Headers/Footers in Owner Dashboard                      |
| - In-App Customer Support Intake with Sanitized Diagnostic Attachment                             |
| - Actionable Low-Stock & Reorder Export for Supplier Replenishment                                |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 2. Observed Usability Issues (High Priority — Implement in Phase 12)                               |
| - Unified retail terminology across POS and Dashboard ("Bills", "Counters", "Cashier")            |
| - Responsive catalog filtering by stock status (All, In Stock, Low Stock, Out of Stock)           |
| - Full-day sales aggregation vs. single-page slice clarity                                         |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 3. Technical Reliability Gaps (Medium Priority — Address & Document)                               |
| - Counter sync diagnostic self-test and connection latency verification                           |
| - Barcode scanner whitespace normalization at trust boundaries                                     |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 4. Business Opportunities Requiring Validation (Roadmap Candidates)                                |
| - Purchase Order & Supplier Invoicing integration directly in Owner Console                       |
| - Customer Loyalty & Phone-number lookup at POS checkout                                          |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 5. Speculative Feature Ideas (Deferred — Do Not Implement Without Customer Evidence)              |
| - Tamil Voice Recognition Assistant (spec only; speech providers costly and untested in noise)    |
| - Camera OCR shelf-capture (browser WebRTC latency and accuracy unproven in grocery lighting)     |
| - AI Natural Language inventory querying                                                          |
+----------------------------------------------------------------------------------------------------+
```
