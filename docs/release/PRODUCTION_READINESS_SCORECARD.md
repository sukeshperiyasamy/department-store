# Production Readiness Scorecard & Release Matrix

**Milestone:** Phase 8 — Production Hardening, Observability, Disaster Recovery, and Security Readiness  
**Target Repository:** `https://github.com/sukeshperiyasamy/department-store`  
**Assessment Date:** 2026-10-27  
**Auditor:** Antigravity Production Readiness Agent  
**Release Verdict:** **CONDITIONAL GO — Supervised Pilot**  

---

## 1. Readiness Matrix & Evidence Categories

| Category | Evaluation Area | Status | Evidence & Verification Details |
|---|---|---|---|
| **Security & Auth** | Platform-Admin & Tenant Authorization | **PASS** | Verified via `test_platform_admin_authorization_boundaries`, `test_cross_tenant_query_denied_server_side`, and Next.js middleware tests. Server-side `frappe.only_for` strictly enforces role boundaries. |
| **Security & Auth** | Public Registration & Token Security | **PASS** | Registration rate limiting enforced via `tabSaaS Rate Limit`. Verification tokens generated via `secrets.token_urlsafe(32)`, hashed via SHA-256 with 24h expiration and single-use enforcement. |
| **Security & Auth** | Port Exposure & Network Isolation | **PASS** | Verified via `docker ps` in `security_and_hardening_check.mjs`: MariaDB (3306) and Redis (6379) are unexposed to the host or internet. Only port 8080 is published. |
| **Security & Auth** | Secret Hygiene & Fail-Closed Env | **PASS** | Centralized validator `apps/owner-dashboard/src/lib/env.ts` fails closed in production when URLs or critical configurations are missing. `.gitignore` strictly ignores `.env*` and tokens. Placeholder-only templates maintained. |
| **Multi-Tenancy** | Hostname Resolution & Isolation | **PASS** | Verified via `test_resolve_tenant_by_host_*`. Foreign/unregistered hostnames are rejected (`matched: false`, `tenant: null`). Suspended and archived tenants are blocked. |
| **Observability** | Health & Readiness Probes | **PASS** | Implemented `get_liveness` (public probe) and `get_system_health` (role/token protected). Monitors DB latency, Redis queue depths (`default`, `short`, `long`), disk space, and POS sync metrics. |
| **Disaster Recovery** | Backup Execution & Checksums | **PASS** | Verified via `deployment/backup/run_backup.ps1`: Nightly dump `20261027_102247-frontend-database.sql.gz` + files tar + site config generated with valid SHA-256 hashes in `SHA256SUMS.txt`. Windows Task Scheduler task is active. |
| **Disaster Recovery** | Live Scratch Site Restore | **PASS** | Restored dump into isolated scratch site `scratch-phase8-restore.local` in **21 seconds**. Verified 1:1 data parity: 254 Sales Invoices, 545 Items, 353 POS Sync Logs, 19 Onboarding Requests, 2 Subscriptions. Cleanly dropped scratch site with 0 impact to production `frontend`. |
| **Reliability** | Database Connection & Locking | **PASS** | MariaDB 11.8 connection limits configured; row-level locking (`SELECT ... FOR UPDATE`) prevents provisioning race conditions. Dedicated background queue workers isolate heavy jobs. |
| **Reliability** | POS Offline Outbox Durability | **PASS** | Verified in `windows-pos` vitest suite (80/80 passed). Bills persist atomically in SQLite outbox queue across restarts; network retries use stable transaction UUIDs and are handled idempotently by ERP. |
| **SaaS Billing** | Subscription Lifecycle & Webhooks | **PASS** | Verified via `billing_lifecycle_check.mjs` (9/9 passed). Webhook signatures verified via HMAC-SHA256; duplicate webhooks handled idempotently without double-charging; B2B sequential invoicing enforced. |
| **Infrastructure** | Pinned Container Images | **PASS** | Verified in `deployment/erpnext/pwd.yml`: All services pinned (`frappe/erpnext:v16.52.1`, `mariadb:11.8`, `redis:6.2-alpine`, `traefik:v3.2`). Apps.txt merge guard prevents custom app loss on container restarts. |
| **Infrastructure** | Public Wildcard DNS & TLS | **BLOCKED** | Public domain acquisition, DNS delegation to Cloudflare/Route53, and live Let's Encrypt production certificates require owner domain registration and account authorization. (Ingress templates and staging configs fully validated). |
| **Integrations** | Live Payment Gateway Settlement | **BLOCKED** | Razorpay live merchant account KYC, bank account verification, and production secret keys must be supplied by the legal store owner. (Mock/test webhooks and signatures pass 100%). |
| **Integrations** | Production SMTP Mail Delivery | **BLOCKED** | Transactional email delivery (SES/Postmark) requires verified sending domain and API credentials. Fallback token logging active for local verification. |
| **Hardware** | Physical Thermal Printers & Scanners | **NOT TESTED** | Physical USB ESC/POS receipt printers and hardware 2D barcode scanners cannot be physically operated in this containerized headless environment. Virtual preview rendering and label generator pass 100%. |

---

## 2. Evidence Summary Statistics

- **Frappe Python Bench Tests:** **102 tests passed, 0 failures, 0 errors** (including `test_health_api`, `test_onboarding_api`, `test_billing_api`, `test_tenant_api`, `test_provisioning_api`, `test_sales_api`, `test_returns_api`, `test_settings_api`, `test_catalog_api`, `test_tenant_isolation`).
- **Owner Dashboard Unit Tests:** **62 tests passed, 0 failures** (including `env.test.ts`, `route.test.ts`, `middleware.test.ts`, `billing.test.ts`, `onboarding.test.ts`, `admin.test.ts`, `marketing.test.ts`).
- **Windows POS Unit & Domain Tests:** **80 tests passed, 0 failures** (including `outbox.test.ts`, `sync-engine.test.ts`, `repos.test.ts`, `BillingScreen.test.tsx`, `cart.test.ts`, `receipt.test.ts`).
- **Shared Types Contract Tests:** **75 tests passed, 0 failures** (`billing.test.ts`, `onboarding.test.ts`, `tenancy.test.ts`, `index.test.ts`).
- **Mobile Shared App Tests:** **11 tests passed, 0 failures** (`mobile-auth-isolation.test.ts`).
- **Automated Integration Checks:**
  * `security_and_hardening_check.mjs`: **15 passed, 0 failed**
  * `onboarding_operations_check.mjs`: **8 passed, 0 failed**
  * `billing_lifecycle_check.mjs`: **9 passed, 0 failed**
  * `ingress_routing_check.mjs`: **26 passed, 0 failed**
- **Disaster Recovery Restore Rehearsal:** Executed live into `scratch-phase8-restore.local` on 2026-10-27; 100% data parity confirmed.

---

## 3. Release Verdict: CONDITIONAL GO — Supervised Pilot

### Justification:
1. **Core Reliability & Local Pilot Readiness:**
   The departmental store ERP system, Next.js owner dashboard, and Windows POS counter clients are **fully production-hardened and ready for a supervised pilot deployment in a physical or local store environment** (e.g., 2–3 Windows billing counters connected over LAN to a store server running the Docker stack). Local transaction durability, offline receipt generation, idempotent backend sync, and nightly automated backups with SHA-256 verification are thoroughly proven.
2. **Conditions Before Full Public Multi-Tenant SaaS Launch:**
   - **Condition 1 (Domain & DNS):** Register apex domain (e.g., `departmentstore.in`) and configure DNS provider API credentials (`CF_DNS_API_TOKEN`) for wildcard ACME certificate issuance.
   - **Condition 2 (Merchant KYC):** Complete Razorpay merchant onboarding, KYC, and activate live webhooks.
   - **Condition 3 (Transactional Email):** Configure production SMTP or transactional email provider (SES / SendGrid) for customer verification emails.
   - **Condition 4 (Hardware Plug-Test):** Perform hands-on physical smoke test with the store's specific USB thermal printer (paper cut, baud rate) and barcode scanner in the retail billing counter lane.
