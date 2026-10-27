# Formal Go / No-Go Review for Controlled Pilot

**Milestone:** Phase 9 — Controlled Pilot Launch and Real-Shop Validation  
**Evaluation Date:** 2026-10-27  
**Review Board:** Antigravity Release Engineering, Architecture & Operations  
**Baseline Commit:** `b680b80` (Phase 8 Baseline)  

---

## 1. Tri-Pillar Readiness Assessment

### Pillar 1: Technical Readiness — [ PASS ]
- **Customer Journey Verification:** 100% of acceptance criteria verified via [`tests/integration/pilot_acceptance_suite.mjs`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/pilot_acceptance_suite.mjs) (24/24 PASS).
- **Tenant Isolation:** Rigorously enforced across API endpoints, database queries, and host routing. Unauthorized cross-tenant queries return 403 or empty sets. Unmapped hosts fail resolution.
- **Financial & Stock Integrity:** All sales and returns post via ERPNext v16 native business logic (`Sales Invoice`, `GL Entry`, `Stock Ledger Entry`). Idempotency claims prevent duplicate postings on network retries.
- **POS Resilience:** Windows POS SQLite queues survive abrupt process termination and power outages. Offline transactions queue safely and sync when connectivity returns.
- **Defect Status:** Zero open critical (Sev 1) or high (Sev 2) defects affecting sales or accounting correctness.

### Pillar 2: Operational Readiness — [ PASS ]
- **Disaster Recovery & Backup:** Nightly backups configured with automated Windows Task Scheduler and SHA256 checksums. Verified clean restore to `scratch-phase8-restore.local` with 1:1 database row and document parity in 21 seconds.
- **Monitoring & Telemetry:** Built-in `get_pilot_status` API provides live metrics on active/suspended shops, provisioning jobs, POS sync backlog, requires-review queues, DB latency (0.06ms), and disk usage.
- **Incident Response:** 13 detailed incident runbooks authored in [`docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md), covering failover, split-brain, desync, and data recovery.
- **Rollback Safety:** Release rollback procedure (RUNBOOK-13) verified with immutable database dumps and pinned Docker images.

### Pillar 3: Business & Compliance Readiness — [ CONDITIONAL PASS ]
- **Legal Terms & Privacy:** Public terms of service (`/terms`) and privacy policy (`/privacy`) deployed on marketing frontend.
- **Indian GST Compliance:** Intra-state (CGST + SGST) and inter-state (IGST) tax calculation and reverse-charge logic verified through ERPNext regional engines.
- **Pricing & Subscription Plans:** Starter, Growth, and Enterprise tiers defined with counter limits and feature sets.
- **External Dependencies Gated:**
  1. *Public DNS / Wildcard TLS:* Awaiting domain delegation (`departmentstore.in`) to configure public Let's Encrypt certificates.
  2. *Live Payment Gateway:* Razorpay webhook HMAC verification and UI are implemented and tested in test/sandbox mode. Live merchant KYC and production API keys must be provided by the legal entity before charging real money.
  3. *Customer Consent:* Written pilot agreement and data retention terms must be executed with participating store owners.

---

## 2. Final Verdict & Selection

From the four possible outcomes:
- `NO-GO — critical gaps remain`
- `CONDITIONAL GO — test tenants only`
- **`CONDITIONAL GO — supervised real-shop pilot, with explicit authorization and listed limitations`** *(SELECTED)*
- `GO — expand pilot cohort, supported by actual evidence`

### Formal Review Decision:
> **CONDITIONAL GO — Supervised Real-Shop Pilot**  
> Authorized for a tightly controlled, owner-approved cohort of **1–3 shops**, subject to the explicit prerequisites and operational limitations listed below.

---

## 3. Mandatory Pilot Prerequisites & Operating Limitations

Before connecting the first real physical store counter:
1. **Explicit Owner Authorization:** Written approval from the repository owner acknowledging the pilot terms and limitations.
2. **Designated On-Site Coordinator:** A named store supervisor available during billing hours to oversee counter cashier operations.
3. **Hardware Smoke Test:** Counter physical ESC/POS thermal printer and USB barcode scanner must pass manual plug-and-print test on-site.
4. **Offline Cash Reserve:** Cashiers must maintain a manual paper bill book as an emergency failsafe during the 14-day pilot.
5. **No Public Merchant Settlement:** Real customer cash transactions are settled in-store via standard cash drawers; online SaaS subscription fees remain in test/sandbox billing mode during the pilot.
6. **Nightly Reconciliation Sign-Off:** Daily close-of-business review of the `tabPOS Sale Sync Log` requires-review queue by the store manager.
