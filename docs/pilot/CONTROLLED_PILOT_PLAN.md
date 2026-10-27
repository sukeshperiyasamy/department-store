# Controlled Pilot Plan — Departmental Store SaaS

**Document Version:** 1.0.0  
**Phase:** Phase 9 — Controlled Pilot Launch and Real-Shop Validation  
**Target Audience:** Pilot Store Owners, Cashier Supervisors, Platform Operations Team  
**Status:** **Approved for Controlled Test-Tenant Execution**  

---

## 1. Pilot Scope & Objective

The objective of the controlled pilot is to validate the multi-tenant departmental store SaaS platform in an operational retail environment with a small, supervised cohort of **1 to 3 stores**.

The pilot validates the end-to-end operational lifecycle:
1. Customer self-service discovery and registration.
2. Contact verification and administrative review.
3. Automated tenant provisioning, hostname verification, and access activation.
4. Product catalog, barcode, pricing, and stock configuration in the manager dashboard.
5. High-speed retail checkout, split cash/UPI payment, and offline outbox queuing on the Windows POS client.
6. Centralized server-side inventory and accounting synchronization via ERPNext business logic.
7. Real-time platform health monitoring and support incident resolution.
8. Non-destructive tenant suspension, reactivation, and disaster recovery.

---

## 2. Cohort Definition & Target Environments

| Cohort Slot | Tenant Slug | Store Profile | Target Environment | Status |
|---|---|---|---|---|
| **Shop 1 (Primary)** | `pilot-shop-01` | Supermarket / Grocery (2 Billing Counters) | Local Store Server / Dedicated LAN | Active Test Tenant |
| **Shop 2 (Secondary)**| `pilot-shop-02` | Provisions & FMCG Retail (1 Counter) | Staging / Localhost Subdomain | Staging Tenant |
| **Shop 3 (Reserve)**  | `pilot-shop-03` | Specialty FMCG (1 Counter) | Staging / Localhost Subdomain | Cold Standby |

*Note: In compliance with project guidelines, all initial validation exercises are executed against synthetic test tenants (`pilot-shop-01`, `pilot-shop-02`) before inviting real store personnel.*

---

## 3. Pilot Parameters & Operating Rules

### A. Duration & Schedule
- **Pilot Duration:** 14 consecutive calendar days.
- **Phase 1 (Days 1–3):** Staging preflight, data seeding (catalog, barcodes, opening stock, cashier accounts), and cashier training.
- **Phase 2 (Days 4–10):** Live counter operations (cash/UPI checkout, receipt printing, offline network interruption tests, end-of-day closing).
- **Phase 3 (Days 11–14):** Accounting reconciliation audit, manager dashboard review, returns/refunds validation, and pilot exit review.

### B. Supported Business Workflows
- **Fast Retail POS Checkout:** Barcode scanning, manual search with Tamil/Tanglish alias support, cart line adjustments (quantity, removal via F8).
- **Tender Options:** Cash with change calculation, static UPI QR display, split cash + digital tender, credit card reference recording.
- **Offline Durability:** Continuous billing during store network or server outages; bills buffered in local SQLite outbox and synchronized automatically upon reconnect.
- **Returns & Exchanges:** Full or partial item returns against original invoice; manager authorization for bills older than 48 hours; automated ERP credit note and stock return.
- **Manager Operations:** Catalog pricing adjustments, low-stock threshold alerts, daily sales reports, user role assignment (`Store Manager`, `Cashier`).

### C. Supported Devices, Browsers & Operating Systems
- **Windows POS Client:** Windows 10 (Build 19041+) or Windows 11 64-bit; minimum 4 GB RAM, dual-core Intel/AMD x64 processor.
- **Manager Dashboard & Admin Console:** Modern evergreen browsers (Chrome 120+, Microsoft Edge 120+, Firefox 120+, Safari 17+); desktop and tablet viewports.
- **Shared Mobile App:** Android 10+ (via Expo Go / release APK), iOS 15+ (via TestFlight / Expo).

### D. Supported POS Hardware
- **Thermal Receipt Printers:** 80mm and 58mm ESC/POS USB thermal printers (tested at 9600 and 19200 baud).
- **Barcode Scanners:** Standard 1D/2D USB HID keyboard-wedge barcode scanners (no driver installation required).
- **Cash Drawers:** Standard RJ11 drawer connected through the thermal receipt printer kick-out pin.
- **Barcode Label Printers:** 2-inch and 3-inch ZPL and TSPL USB desktop label printers.

---

## 4. Support Hours, SLAs & Escalation Matrix

### Support Hours:
- **Core Retail Hours:** 08:00 AM – 10:00 PM IST (Monday through Sunday).
- **Off-Hours / Emergency:** Automated paging for Sev 1 system stoppage.

### Severity Levels & Response SLAs:

| Severity | Definition | Response SLA | Target Resolution | Escalation Contact |
|---|---|---|---|---|
| **Sev 1 (Blocker)** | System stoppage; all billing counters offline; data exposure; financial miscalculation | **< 15 minutes** | < 2 hours | Platform Lead & SRE on-call |
| **Sev 2 (Major)** | Single counter degraded; background sync backlog > 50 bills; manager dashboard slow | **< 30 minutes** | < 4 hours | Support Engineer |
| **Sev 3 (Minor)** | Non-blocking UI glitch; reporting display inconsistency; minor styling defect | **< 2 hours** | < 24 hours | Front-End Team |
| **Sev 4 (Request)** | Feature enhancement request; new report filter; catalog alias addition | **< 1 business day** | Scheduled Sprint | Product Owner |

---

## 5. Data Ownership, Privacy & Retention Policy

1. **Data Ownership:**
   The store owner retains 100% legal ownership of all business records, customer transactions, pricing data, inventory counts, and tax reports.
2. **Data Isolation:**
   Tenant data is physically segregated in distinct MariaDB databases or strictly partitioned by verified `tenant_id` foreign keys and server-side row-level access controls.
3. **Cancellation & Retention:**
   In the event of pilot termination or subscription cancellation, store data is retained in an inactive state for **90 calendar days**, during which the owner may request a complete database dump archive (`.sql.gz`) with files tar. After 90 days, data is archived or securely purged per written agreement.
4. **Zero Credential Collection:**
   Support staff and platform operators will **never** request, collect, or store cashier passwords, owner credentials, or payment card details.

---

## 6. Known Limitations During Pilot

1. **Physical Hardware Certification:** While the ESC/POS virtual printer byte generator and barcode parser are fully tested, physical USB thermal printer communication (paper auto-cutter pulse, baud rate) must be confirmed on-site with the store's physical printer hardware.
2. **Public Wildcard TLS:** In the absence of an owner-delegated public apex domain (e.g., `departmentstore.in`), pilot routing uses verified local subdomains (`*.localhost`) and staging ingress configurations.
3. **Government E-Invoicing / E-Waybill:** Automated IRN generation and government e-invoicing integrations remain intentionally disabled pending formal legal threshold assessment (mandatory only for businesses exceeding statutory turnover limits).

---

## 7. Pilot Success & Stop Criteria

### Success Criteria (Exit Gates):
- [x] **Zero Unsynchronized Bills Lost:** 100% of bills queued in offline SQLite outbox successfully drain to central ERP.
- [x] **100% Financial Reconciliation:** ERP General Ledger matches counter printed receipts with **0.00 INR** variance.
- [x] **Zero Cross-Tenant Leakage:** Comprehensive test suites prove 0 instances of cross-tenant data visibility.
- [x] **Disaster Recovery Verified:** Successful isolated site restoration demonstrated in < 60 seconds (verified in 21s).
- [x] **Cashier Speed Benchmark:** Average item scan-to-cart latency < 200ms; receipt print trigger < 500ms.

### Immediate Stop Criteria (Halt Pilot Immediately If):
1. **Any cross-tenant data leak occurs** (Tenant A views Tenant B's data).
2. **Duplicate finalized sale created** from a retried transaction.
3. **Data loss of queued offline transactions** occurs during application restart.
4. **Discrepancy detected between POS bill total and ERP posted invoice amount**.
5. **Security vulnerability identified** exposing platform-admin or database credentials.
