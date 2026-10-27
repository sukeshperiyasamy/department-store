# Product Roadmap & Architecture Decision Record (ADR)

## 1. Product Baseline & Real Evidence Summary
As established in Phase 0 and Phase 1:
- **Active Pilot Stores:** 1 real shop onboarding candidate (Sri Murugan Departmental Store, Erode, Tamil Nadu) in supervised pilot preparation.
- **Billing Terminals:** 2–3 Windows billing counters running local SQLite WAL + Outbox sync.
- **Authoritative Backend:** Central Dockerized Frappe v16 / ERPNext v16 stack on MariaDB 11.8.
- **Measured Metrics Baseline:**
  - Automated tests pass rate: 100% (239 unit tests + 13 Frappe backend tests + 9 integration tests).
  - Provisioning pipeline time: ~4.2 minutes per isolated tenant site.
  - Zero raw customer data or revenue metrics invented.

---

## 2. Near-Term Product Roadmap (Next 3 Releases)

### Release 0.2.0 — Pilot Hardening & Hardware Validation (Q4 2026)
*Target: 1 Live Store Pilot in Erode, TN*

| Item ID | Feature / Improvement | Owner | Estimate (Uncertainty) | Dependencies | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ROAD-01** | Physical Thermal Printer (ESC/POS) Hardware Certification | POS Eng | 3 days (±1 day) | ESC/POS byte builder | Receipt prints accurately on TVS RP3200 & EPSON TM-T82 without clipping; automatic paper cut works. |
| **ROAD-02** | Barcode Scanner Whitespace & Carriage-Return Filter | POS Eng | 1 day (±0.5 day) | POS BillingScreen | Scans with `\r\n` or trailing spaces resolve item code without throwing `ITEM_NOT_FOUND`. |
| **ROAD-03** | Counter Sync Health Diagnostic Screen in POS | Desktop | 2 days (±1 day) | SQLite Outbox Repo | Cashier can view outbox bill count, last sync latency, and manual retry button with `F5`. |
| **ROAD-04** | Pilot Store In-Person Onboarding & Catalog Seeding | Ops/Product | 2 days (±1 day) | Store Profile Settings | Store profile, GSTIN, and 160+ FMCG catalog items configured and verified on live counter hardware. |

---

### Release 0.3.0 — Multi-Counter Store Management (Q1 2027)
*Target: 3 Supervised Pilot Stores*

| Item ID | Feature / Improvement | Owner | Estimate (Uncertainty) | Dependencies | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ROAD-05** | Multi-Counter Live Sync Dashboard | Dashboard | 4 days (±2 days) | ServerStatus API | Dashboard surfaces real-time outbox lag across Counter 1, 2, and 3 simultaneously. |
| **ROAD-06** | Cashier Daily Shift Handover & Drawer Cash Balancing | POS / ERP | 5 days (±2 days) | ERP POS Opening/Closing Entry | Cashier records physical drawer cash at shift end; discrepancy variance reported to store manager. |
| **ROAD-07** | Automated Stock Replenishment Email to Distributors | Backend | 3 days (±1 day) | Stock Alerts API | Low-stock reorder CSV can be dispatched directly to distributor email address upon manager approval. |

---

### Release 0.4.0 — Commercial SaaS Growth & Scale (Q2 2027)
*Target: 10–25 Independent Retail Stores*

| Item ID | Feature / Improvement | Owner | Estimate (Uncertainty) | Dependencies | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ROAD-08** | ERPNext Purchase Order & Goods Receipt Note (GRN) | ERP / DB | 7 days (±3 days) | ERPNext Buying module | Inward supplier shipments automatically increment stock batches without manual adjustments. |
| **ROAD-09** | Tenant Account Data Portability & Complete Export | Backend | 4 days (±1 day) | MariaDB Dump script | Store owner can trigger a one-click download of all customer invoices, inventory balances, and items. |
| **ROAD-10** | Subscription Self-Service & Automated Invoicing | SaaS Ops | 6 days (±2 days) | Razorpay Subscription API | Store owners can upgrade counter seats and receive monthly tax invoices for SaaS platform fees. |

---

## 3. Explicitly Deferred Features & Rationales

| Feature Candidate | Status | Reason for Deferral | Discovery Trigger Required |
| :--- | :--- | :--- | :--- |
| **Tamil Voice Assistant Checkout** | DEFERRED (Spec Only) | High ambient acoustic noise in retail stores makes speech recognition unreliable; laser barcode scanning is 10x faster and requires no speaking. | ≥ 3 pilot store owners explicitly request hands-free bulk weighing integration. |
| **Camera OCR / Webcam Scanning** | DEFERRED (Spec Only) | Physical laser/2D USB scanners ($15–$25) are already present in 100% of candidate stores; webcam OCR is too slow for 30+ items/minute checkout. | Stores express inability to source standard USB barcode scanners. |
| **Customer Phone Loyalty Points** | DEFERRED | High privacy sensitivity and adds 15–30 seconds of friction at checkout. Cashiers in pilot stores prioritize fast checkout queues. | Pilot store requests customer loyalty program to counter large supermarket chain competition. |
| **Cloud-Only Web POS (Non-Tauri)** | REJECTED | Violates the core product guarantee: counter billing must never freeze or drop when store broadband is disrupted. | Never (violates durability architecture). |

---

## 4. Key Architectural Decisions (ADR)

### ADR-012: Store Profile Stored in Authoritative Frappe Singles
- **Context:** Shop owners need to customize their store name, phone, address, and receipt notes without needing platform admin privileges.
- **Decision:** Extended `Departmental Store Settings` single DocType with 10 store profile fields and granted `write: 1` permission to `Store Manager`.
- **Consequences:** Store settings remain 100% tenant-isolated in MariaDB `tabSingles` on a per-site basis (`site_<tenant>`). Zero risk of cross-tenant data contamination.

### ADR-013: Redacted In-App Support Intake
- **Context:** Technical issues during pilot operations need rapid diagnostics without exposing credentials or customer personal records.
- **Decision:** Implemented `submit_support_request` API that logs structured incident records with auto-collected zero-PII telemetry (counter count, MariaDB deadlocks, active review queue length).
- **Consequences:** Platform support engineers receive immediate actionable system context while strictly honoring zero-PII privacy policies.

### ADR-014: Client-Side Reorder Replenishment CSV Export
- **Context:** Store owners need a fast way to turn low-stock alerts into orders for FMCG distributors.
- **Decision:** Implemented `ReorderExportButton` directly on the inventory alerts view, calculating suggested replenishment quantities on the client without modifying ERP stock records.
- **Consequences:** Solves a daily customer problem with zero database write load and zero risk of stock ledger corruption.

---

## 5. Risk Register & Required Business Decisions

| Risk ID | Description | Severity | Probability | Mitigation Strategy | Required Decision |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **RSK-01** | Physical thermal printer hardware variations across pilot stores | High | Med | Validate ESC/POS raster and text modes on 3 common Indian retail printer models (TVS, Epson, NGX). | Choose default supported printer models for pilot recommendations. |
| **RSK-02** | Local store broadband latency or ISP dropouts > 24 hours | Med | High | Durable SQLite outbox holds unlimited pending bills; verified sync resumes on reconnection. | Formulate offline sales policy (e.g. max offline duration before mandatory sync). |
| **RSK-03** | Cashier barcode scanner configuration diversity (tab vs enter suffix) | Med | Med | Added whitespace trimmer and newline normalizer in billing screen input handler. | Provide 1-page scanner programming barcode sheet in onboarding kit. |
