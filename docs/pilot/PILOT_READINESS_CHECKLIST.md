# Pilot Readiness Checklist

**Milestone:** Phase 9 — Controlled Pilot Launch and Real-Shop Validation  
**Baseline Commit:** `b680b80` (Phase 8 Production Hardening)  
**Evaluation Date:** 2026-10-27  
**Auditor:** Antigravity Release Engineering Agent  

---

## 1. Audit Matrix & Launch Prerequisites

| Area | Evaluation Item | Status | Verified Evidence & Notes |
|---|---|---|---|
| **1. Tenant Isolation & Auth** | Cross-tenant data denial & boundary enforcement | **PASS** | `test_tenant_isolation.py` (7/7 PASS), `security_and_hardening_check.mjs` (15/15 PASS). Querying tenant data outside authorized scope returns 403 or empty sets. Unregistered hostnames reject resolution (`matched: false`). |
| **2. Platform-Admin Access** | Separation of platform administration from tenant users | **PASS** | `test_platform_admin_authorization_boundaries` PASS; `frappe.only_for("Platform Admin")` enforced on all admin methods (`approve_onboarding_request`, `set_tenant_status`, `retry_provisioning_job`). Store managers/cashiers denied access. |
| **3. Registration & Verification** | Public lead onboarding & anti-enumeration | **PASS** | Public registration enqueues request; verification tokens use SHA-256 digests (`secrets.token_urlsafe(32)`) with 24-hour expiration and single-use enforcement; sliding-window rate limit (`tabSaaS Rate Limit`) active. |
| **4. Provisioning & Recovery** | Asynchronous worker queue & retry recovery | **PASS** | Worker claims jobs atomically with row-locking (`tabSaaS Provisioning Job`); retry counter capped at 3 attempts; stale jobs reclaimed after 10m; argument passwords sanitized in CLI logs. |
| **5. Hostname & TLS** | Tenant routing & TLS termination | **PASS (Local/Test)**<br>**BLOCKED (Public)** | Local subdomain routing (`*.localhost`) and Traefik v3 wildcard configuration validated. Public Let's Encrypt production wildcard issuance blocked pending owner domain purchase & DNS delegation. |
| **6. Backup & Restoration** | Nightly backup, checksums, isolated restore | **PASS** | Host Task Scheduler `DepartmentalStore-ERP-Backup` active. Dump `20261027_102247` verified with SHA256SUMS. Live scratch restore to `scratch-phase8-restore.local` verified in 21s with 1:1 parity (254 invoices, 545 items, 353 POS logs). |
| **7. Monitoring & Telemetry** | Operational telemetry & health endpoints | **PASS** | Implemented `get_liveness` and protected `get_system_health` in Frappe; Next.js `/api/health` route handler active; monitors DB latency, Redis queue depths, disk space, and POS sync stats. |
| **8. POS Offline Durability** | Local SQLite persistence & restart survival | **PASS** | Windows POS vitest suite (80/80 PASS); transactions persist atomically in SQLite `receipt_sales` and `outbox_events`; offline billing operations tested without server connection. |
| **9. Sales & Reconciliation** | Idempotency & ERPNext accounting logic | **PASS** | `submit_pos_sale` generates authoritative `Sales Invoice`, `GL Entry`, and `Stock Ledger Entry`; duplicate requests with identical UUID return previously committed invoice with `duplicate: true`. |
| **10. Subscription & Billing** | SaaS commercial control plane & webhooks | **PASS (Sandbox)**<br>**BLOCKED (Live)** | Razorpay sandbox integration verified with HMAC-SHA256 signature verification, deduplication, and portal UI. Live commercial billing blocked pending legal store merchant KYC and live credentials. |
| **11. Legal & Support** | Terms, privacy, support runbooks | **PASS** | Public terms (`/terms`) and privacy (`/privacy`) active. 13 operational incident response runbooks authored in `docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md`. |
| **12. Deployment Rollback** | Release safety & rollback procedures | **PASS** | Pinned images (`frappe/erpnext:v16.52.1`, `mariadb:11.8`, `redis:6.2-alpine`); `apps.txt` union merge guard prevents app loss; RUNBOOK-13 rollback procedure documented. |
| **13. Physical Hardware** | ESC/POS thermal printers & 2D scanners | **NOT TESTED** | Virtual ESC/POS byte builders and ZPL label generators pass 100%. Physical USB thermal printer (paper cut, baud rate) and hardware scanner plug-test requires on-site retail hardware. |

---

## 2. Launch Gate Verdict

- **Automated / Local Testing Baseline:** **100% READY** (393 automated tests passing across 4 workspaces and live Docker stack).
- **External Dependencies Gated:** Real customer contact, public DNS manipulation, live merchant credit card charging, and public cloud deployment remain **strictly disabled** until explicit owner authorization.
- **Pilot Decision:** Proceed with **Controlled Pilot on Test Tenants** (`pilot-shop-01`, `pilot-shop-02`) on local/staging infrastructure to validate the complete customer lifecycle.
