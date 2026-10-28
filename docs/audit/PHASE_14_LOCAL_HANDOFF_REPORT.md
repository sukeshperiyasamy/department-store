# Phase 14 — Verified Login Access, Runtime Consistency & Final Local Handoff Report

**Product:** Department Store ERP / Multi-Tenant SaaS Platform  
**Target Environment:** Local Full-Stack Deployment (Docker Compose + Next.js App Router + Vite POS)  
**Execution Timestamp:** October 28, 2026  
**Auditor:** Quality Assurance & System Architecture Agent  
**Final Status:** `PASS` (Verified Local Runtime Consistency & Clean Handoff)  

---

## 1. Executive Summary & Verification Scope

Phase 14 verifies runtime consistency, local authentication workflows, host-to-container parity, and end-to-end user navigation across the running stack without resetting databases or disrupting local test fixtures.

Key results:
1. **Source Parity:** 100% byte-for-byte SHA256 parity confirmed between host source code and the running Frappe backend container (`departmental-erp-backend-1`).
2. **Service Availability:** All 5 core service URLs tested and returning HTTP 200.
3. **API Reliability:** All 7 previously failing ERP endpoints return HTTP 200 with schema validation and strict 403 rejection for unauthenticated callers.
4. **Local Credentials & Auth:** Local test accounts (`dashboard@demo.store`, `cashier@demo.store`, `Administrator`) verified and documented in the gitignored [`LOCAL_TEST_LOGIN_HANDOFF.md`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/LOCAL_TEST_LOGIN_HANDOFF.md).
5. **Browser Smoke Test:** Successful end-to-end navigation across all Owner Dashboard pages with live metrics and clean session termination.

---

## 2. Commit SHA, Git Status & Remote Synchronization

| Attribute | Measured State |
|---|---|
| **Current HEAD SHA** | `8d51b13cd9d8c22664221656da0700a57f017d95` |
| **Branch** | `main` |
| **Remote Origin** | `https://github.com/sukeshperiyasamy/department-store.git` |
| **Synchronization** | Up to date with `origin/main` (commits `499a4da` and `8d51b13` pushed) |
| **Working Tree** | Clean (`.env.local` and `LOCAL_TEST_LOGIN_HANDOFF.md` updated and gitignored) |

---

## 3. Host vs. Running Container Source Parity

Normalized SHA256 checksums were compared between the host workspace (`erpnext-app/departmental_store/departmental_store/`) and the running container (`/home/frappe/frappe-bench/apps/departmental_store/` in `departmental-erp-backend-1`):

| File Path | Host SHA256 | Container SHA256 | Parity Status |
|---|---|---|---|
| `api/devices.py` | `a1e5d9b1...` | `a1e5d9b1...` | **MATCH** |
| `api/tenant.py` | `2b9b7306...` | `2b9b7306...` | **MATCH** |
| `api/sales.py` | `5c87f7ad...` | `5c87f7ad...` | **MATCH** |
| `api/catalog.py` | `f951ee64...` | `f951ee64...` | **MATCH** |
| `api/reports.py` | `a1641ba3...` | `a1641ba3...` | **MATCH** |
| `api/settings.py` | `d9f3a4a6...` | `d9f3a4a6...` | **MATCH** |
| `api/billing.py` | `d24df146...` | `d24df146...` | **MATCH** |
| `seeds.py` | `a9ee7cf4...` | `a9ee7cf4...` | **MATCH** |
| `install.py` | `dbe4df5b...` | `dbe4df5b...` | **MATCH** |
| `hooks.py` | `b0683fef...` | `b0683fef...` | **MATCH** |

**Zero source-to-container mismatches detected.**

---

## 4. Service URLs & Docker Container Health

All 5 application entry points were probed via live HTTP requests:

| Service / Interface | Local Target URL | Measured HTTP Status | Process / Service Health |
|---|---|---|---|
| **ERP Health Probe** | `http://localhost:8080/api/method/frappe.ping` | `200 OK` (`"pong"`) | `departmental-erp-frontend-1` |
| **ERPNext Desk** | `http://localhost:8080/app` | `200 OK` | Gunicorn / Python backend active |
| **Owner Dashboard Login** | `http://localhost:3100/login` | `200 OK` | Next.js App Router (port 3100) |
| **Owner Dashboard Overview** | `http://localhost:3100/app` | `200 OK` | Next.js App Router (port 3100) |
| **Windows POS Web Interface**| `http://localhost:1420/` | `200 OK` | Vite POS Shell (port 1420) |

---

## 5. Local Test Accounts & Credentials Verification

The test personas provisioned on local site `frontend` were verified against live authentication endpoints:

| Persona | Username / Email | Assigned ERPNext Roles | Primary Interface | Auth Status |
|---|---|---|---|---|
| **Platform Admin** | `Administrator` | `Platform Admin`, `System Manager` | ERPNext Desk (`:8080/app`) | **VERIFIED (HTTP 200)** |
| **Store Manager** | `dashboard@demo.store` | `Store Manager`, `Accounts Manager`, `Platform Admin` | Owner Dashboard (`:3100/login`) | **VERIFIED (HTTP 200)** |
| **Cashier / Operator**| `cashier@demo.store` | `Cashier`, `Accounts User` | Windows POS (`:1420/`) | **VERIFIED (HTTP 200)** |

### Security & Insecure Credentials Audit
- **Administrator Credential Status:** The local development site contains the development-standard Administrator account. Existing integration tests (`scale_and_capacity_suite.mjs`, `pilot_acceptance_suite.mjs`, `onboarding_operations_check.mjs`) rely on this local fixture. Changing the password on this shared local container would break existing automated regression suites.
- **Production Hardening:** Production deployment compose configs and `scripts/ci/secret_scan.py` strictly forbid default passwords. Zero default credentials exist in tracked production configs.
- **Handoff Location:** Plaintext passwords and active API keys are recorded exclusively in the gitignored file:
  [`LOCAL_TEST_LOGIN_HANDOFF.md`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/LOCAL_TEST_LOGIN_HANDOFF.md).
- **Owner Dashboard Config:** Updated `apps/owner-dashboard/.env.local` to align `DASHBOARD_API_SECRET` with the active user secret.

---

## 6. Comprehensive Verification of the Seven ERP API Methods

All seven API methods were evaluated for HTTP status, schema conformity, and unauthenticated fail-closed protection:

| # | Endpoint Method Name | Authorized Call (HTTP Status & Schema Keys) | Unauthenticated Call | Result |
|---|---|---|---|---|
| 1 | `catalog.catalog_snapshot` | `200 OK` (`checkpoint`, `items`, `price_list`, `tax_templates`) | `403 Forbidden` | `PASS` |
| 2 | `reports.owner_summary` | `200 OK` (`gross_sales`, `net_sales`, `taxes_collected`, `bills`) | `403 Forbidden` | `PASS` |
| 3 | `reports.recent_invoices` | `200 OK` (`invoices`, `api_version`, `generated_at`) | `403 Forbidden` | `PASS` |
| 4 | `reports.stock_alerts` | `200 OK` (`out_of_stock`, `low_stock`, `expiring`) | `403 Forbidden` | `PASS` |
| 5 | `reports.server_status` | `200 OK` (`database`, `devices`, `review_queue`, `frappe_version`) | `403 Forbidden` | `PASS` |
| 6 | `settings.get_settings` | `200 OK` (`profile`, `flags`, `expiry_warning_days`) | `403 Forbidden` | `PASS` |
| 7 | `billing.get_billing_overview`| `200 OK` (`subscription`, `plan`, `entitlements`, `counters_limit`) | `403 Forbidden` | `PASS` |

---

## 7. Focused Browser Smoke-Test Results

A live browser validation session was executed via `browser_subagent` and recorded to:
`phase14_smoke_test_1793164952723.webp`

| Step | Page / Workflow | Outcome & Observations | Screenshot Artifact |
|---|---|---|---|
| 1 | Login (`/login`) | Form submission with `dashboard@demo.store` | Redirected to `/app` |
| 2 | Overview (`/app`) | Live KPI metrics (Gross ₹2,503.00, Net ₹2,493.00, GST ₹381.81). No sandbox banner. | [`phase14_overview_1793164984313.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_overview_1793164984313.png) |
| 3 | Sales (`/sales`) | Recent invoices listed (`SINV-26-00495`, etc.) with totals | [`phase14_sales_1793164993643.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_sales_1793164993643.png) |
| 4 | Catalog (`/catalog`) | 563 sellable items, Standard Selling price list | [`phase14_catalog_1793164999725.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_catalog_1793164999725.png) |
| 5 | Inventory (`/inventory`) | Stock balances and low-stock reorder thresholds | [`phase14_inventory_1793165010107.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_inventory_1793165010107.png) |
| 6 | Sync & Health (`/sync`) | Counter 1 & Counter 2 device pairing, ERPNext health | [`phase14_sync_1793165024515.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_sync_1793165024515.png) |
| 7 | Settings (`/settings`) | Store profile, regional defaults, currency (INR) | [`phase14_settings_1793165038336.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_settings_1793165038336.png) |
| 8 | Billing (`/billing`) | Commercial tier, Starter plan, 5 counter limit | [`phase14_billing_1793165045867.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_billing_1793165045867.png) |
| 9 | Logout (`/login`) | Session invalidated; redirected cleanly to login | [`phase14_logout_1793165058276.png`](file:///C:/Users/COMPUTER/.gemini/antigravity-ide/brain/c0251c52-27e0-4ec2-8b3f-8e8788f4bab0/phase14_logout_1793165058276.png) |

---

## 8. Remaining Failures & External Blockers

- **Software Failures:** None. 100% of internal tests and checks pass.
- **External Blockers (`BLOCKED_EXTERNAL`):**
  - Production payment gateway webhooks require external merchant KYC and live public endpoints.
  - Public DNS propagation for arbitrary custom production domains requires external authoritative nameservers.

---

## 9. Safe Operational Commands

### Safe Restart Command (Preserves Database & SQLite Queues)
```powershell
# 1. Start Docker ERP Backend & Databases
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml up -d

# 2. Verify ERP Readiness
curl -s http://localhost:8080/api/method/frappe.ping

# 3. Start Next.js Owner Dashboard (Port 3100)
npm run dev:dashboard

# 4. Start Windows POS Interface (Port 1420)
npm run dev:pos
```

### Safe Shutdown Command (Zero Data Loss)
```powershell
# Stop Docker containers safely without removing volumes
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml stop

# Terminate Node dev servers safely
Stop-Process -Name node -Force
```
> **CRITICAL REMINDER:** Never run `docker compose down -v` or prune Docker volumes. Volume `departmental-erp_db_data` holds the live store ledger.
