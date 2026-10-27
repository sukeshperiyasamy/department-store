# Commercial Feature Evaluation & Prioritization Matrix

## 1. Prioritization Methodology: RICE + Risk Score
To avoid building speculative SaaS features that lack real customer value, candidates are evaluated across seven objective dimensions:

$$\text{Priority Score} = \frac{\text{Reach} \times \text{Impact} \times \text{Evidence Confidence}}{\text{Effort} + \text{Operational Risk}}$$

- **Reach (1–10):** Proportion of pilot stores and cashiers affected daily.
- **Impact (1–5):** 1 = Minimal convenience; 3 = Reduces operational friction; 5 = Eliminates billing stoppage or critical revenue loss.
- **Evidence Confidence (20%–100%):**
  - $100\%$ = Confirmed by direct pilot store friction or documented statutory requirement.
  - $70\%$ = Observed during end-to-end user testing or support simulation.
  - $30\%$ = Unverified feedback or speculative feature idea.
- **Effort (Person-Days 1–10):** Engineering, testing, and migration cost.
- **Operational Risk (1–5):** Potential to disrupt authoritative accounting, stock ledgers, or offline durability.

---

## 2. Feature Candidate Evaluation Table

| Rank | Feature Candidate | Reach | Impact | Confidence | Effort | Risk | Score | Decision & Justification |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1** | **Actionable Low-Stock Reorder CSV Export** | 10 | 5 | 100% | 2 | 1 | **16.67** | **IMPLEMENTED (Phase 12).** Verified daily need: shop owners replenish groceries weekly by sending order lists directly to local FMCG distributors. Zero risk to accounting. |
| **2** | **Tenant Store Profile & Thermal Receipt Customization** | 10 | 4 | 100% | 2 | 1 | **13.33** | **IMPLEMENTED (Phase 12).** Store branding, GSTIN printing, and phone contact on customer receipts are basic customer expectations for retail credibility. |
| **3** | **In-App Customer Support & Redacted Diagnostics** | 9 | 4 | 90% | 3 | 1 | **8.10** | **IMPLEMENTED (Phase 12).** Reduces time-to-resolution for counter sync anomalies and MariaDB deadlock investigations without exposing customer data. |
| **4** | **Barcode Whitespace & Scanner Normalization** | 8 | 4 | 90% | 2 | 2 | **7.20** | **SCHEDULED (Sprint 1).** Physical USB scanners often inject leading/trailing whitespace or alternate enter keys (`\r\n` vs `\n`), causing intermittent `ITEM_NOT_FOUND` on quick checkout. |
| **5** | **Multi-Counter Live Status & Queue Telemetry** | 7 | 4 | 80% | 4 | 2 | **3.73** | **SCHEDULED (Sprint 1).** Allows store managers to detect when Counter 2 or Counter 3 has uncommitted bills queued in SQLite without physically walking to the counter. |
| **6** | **Purchase Order & Supplier Receiving Workflow** | 6 | 4 | 70% | 7 | 3 | **1.68** | **SCHEDULED (Q1 2027).** High commercial value, but ERPNext's native Purchase Order & Purchase Receipt workflow requires thorough testing against batch numbering and vendor ledger accounts. |
| **7** | **Customer Account Data Export & Portability** | 4 | 3 | 70% | 4 | 1 | **1.68** | **BACKLOG (Q2 2027).** Important for tenant trust and compliance, but rarely exercised during initial 3-month pilot operations. |
| **8** | **Cashier Shift Handover & Drawer Cash Reconciliation** | 6 | 3 | 60% | 5 | 3 | **1.35** | **BACKLOG (Q2 2027).** Useful for stores with rotating shifts, but existing pilot stores operate with permanent owner-supervised cashiers. |
| **9** | **Customer Loyalty Points & Phone Lookup** | 5 | 2 | 40% | 6 | 2 | **0.50** | **DEFERRED.** High privacy sensitivity. Must not collect customer phone numbers without explicit consent or duplicate ERPNext customer doctypes. |
| **10** | **Tamil Voice Assistant Checkout** | 3 | 2 | 30% | 8 | 4 | **0.15** | **DEFERRED (Spec Only).** Background ambient supermarket noise (refrigerators, chatter) makes acoustic reliability poor without specialized noise-cancelling directional hardware. |
| **11** | **Camera OCR / Webcam Barcode Capture** | 2 | 2 | 30% | 8 | 4 | **0.10** | **DEFERRED (Spec Only).** USB laser barcode scanners ($15–$25) are 10x faster, more reliable, and already ubiquitous across pilot retail counters. |

---

## 3. High-Value Implementations: Why 1–3 Outranked Others

1. **Reorder CSV Export Outranked Purchase Orders:**
   - Small departmental stores rarely create formal Purchase Orders in ERPNext; instead, they generate a daily/weekly list of low items and message or call local distributors (HUL, ITC, local mills).
   - Providing instant CSV download solves the immediate operational problem with 2 person-days of work and 0% risk of accounting corruption, whereas full PO automation requires 7+ days of vendor ledger setup.

2. **Tenant Store Profile Outranked Loyalty Systems:**
   - A store cannot legally hand out invoices without their own GSTIN, store address, and phone number printed on the receipt.
   - Loyalty systems require customer phone number collection, which creates privacy concerns and adds checkout latency during busy evening rushes.

3. **In-App Support & Redacted Diagnostics Outranked Multi-Tenant Billing Self-Service:**
   - Pilot store retention is governed by whether technical interruptions (e.g. counter offline sync hang) can be diagnosed and fixed in under 30 minutes.
   - Subscription credit card self-service is unnecessary for initial pilot stores operating on direct onboarding agreements.
