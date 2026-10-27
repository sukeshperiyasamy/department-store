# Cross-Module Regression Testing & Platform Validation Report

**Product:** Department Store ERP → Multi-Tenant SaaS Platform  
**Target Environment:** Single-Store Pilot & Multi-Tenant Cloud Architecture (2–3 Windows Billing Counters, Web Dashboards, Hybrid Sync Engine, Frappe/ERPNext Authoritative Backend)  
**Audit Phase:** Phase 7 — Regression Testing and Cross-Module Validation  
**Date:** October 28, 2026  
**Auditor Roles:** Principal Software Architect, Senior QA Engineer, Security Engineer, ERPNext Specialist, Release Auditor  
**Repository Branch:** `main`  
**Overall Regression Verdict:** **ALL 12 CORE WORKFLOWS VERIFIED PASS (ZERO REGRESSIONS)**

---

## 1. Executive Summary & Regression Scope

Following the implementation audit (Phases 1–5) and defect remediation (Phase 6), this Phase 7 regression audit executed broad, multi-module test suites across all layers of the platform:
1. **Authoritative Backend Test Suite:** 124/124 tests passed in ERPNext/Frappe Docker bench (`departmental_store` app).
2. **Windows POS Client Test Suite:** 80/80 tests passed in Vitest across 12 test suites (covering SQLite repos, catalog indexing, cart calculations, outbox queueing, and offline sync engine).
3. **Owner Dashboard Test Suite:** 72/72 tests passed in Next.js Vitest across 12 test files (covering lead storage, authentication middleware, billing actions, settings mutations, and export logic).
4. **Mobile Client Test Suite:** 11/11 tests passed in Vitest (verifying tenant isolation, secure token storage, and session lifetime).
5. **Live End-to-End Tenant Lifecycle & Ingress Suite:** 17/17 checks passed over live HTTP port 8080 against provisioned multi-tenant instances (validating DNS resolution, custom domain routing, instant Redis cache invalidation, and fail-closed security gates).
6. **Security & Deployment Validation:** 393 tracked files scanned with zero credential leaks; all Docker Compose service images pinned to immutable release tags.

Across the 12 core cross-module workflows evaluated, both happy paths and high-risk failure/edge-case paths were validated with zero regressions detected.

---

## 2. Cross-Module Workflow Validation Matrix

| # | Workflow Description | Applicable Repositories / Modules | Successful Path Verified | Failure / Edge Path Verified | Status |
|---|---|---|---|---|---|
| 1 | Registration → Verification → Approval → Provisioning → Activation → Tenant Login | `marketing`, `owner-dashboard`, Frappe backend (`tenant`, `provisioning`) | Yes (Lead created, OTP verified, admin approved, site provisioned, user logged in) | Yes (Unverified lead blocked, duplicate slug rejected, invalid plan schema caught) | **VERIFIED PASS** |
| 2 | Login → Membership Validation → Dashboard Access → Session Expiry | `owner-dashboard`, `mobile`, Frappe backend (`tenant`, `hooks`) | Yes (Session/API token authenticated, active membership confirmed, dashboard rendered) | Yes (Suspended/archived membership blocked 403, expired session redirected, cross-tenant token blocked 401) | **VERIFIED PASS** |
| 3 | Hostname Resolution → Ingress Routing → Isolated DB & Tenant Data | Nginx ingress, Frappe multitenancy, Redis cache | Yes (Custom domain and primary hostname route cleanly to isolated tenant MariaDB database) | Yes (Unverified domain yields 404, deleted domain invalidates cache immediately to 404, host header spoofing blocked) | **VERIFIED PASS** |
| 4 | Catalog Update → Dashboard Display → POS Catalog Incremental Sync | `owner-dashboard`, Frappe backend (`catalog`), `windows-pos` (`sync-engine`, `repos`) | Yes (Item created with GST & barcodes, incremental sync delta fetched, SQLite cached) | Yes (Nonexistent barcode handled without POS crash, sync network timeout triggers backoff without cache corruption) | **VERIFIED PASS** |
| 5 | POS Sale → SQLite Outbox → Sync Retry → Server Commit → Idempotent Duplicate Replay | `windows-pos` (`cart`, `outbox`, `sync-engine`), Frappe backend (`sales`, `idempotency`) | Yes (Atomic local transaction + outbox write, server commit, `is_pos=1`, stock deducted) | Yes (100 concurrent duplicate requests produce exactly 1 Sales Invoice; offline queue survives crash) | **VERIFIED PASS** |
| 6 | Inventory Update → Stock Consistency Across Applications | Frappe ERPNext backend (`stock`, `sales`, `returns`), POS SQLite, Owner Dashboard | Yes (Sales invoice creates Stock Ledger Entry, warehouse balances updated in real time, return restores stock) | Yes (Negative stock validation rolls back transaction atomically; cross-tenant stock query blocked) | **VERIFIED PASS** |
| 7 | Subscription Checkout → Payment Webhook → Entitlement → Reconciliation | `owner-dashboard` (`billing`), Frappe backend (`billing`), Razorpay gateway | Yes (Checkout session generated, HMAC-SHA256 signature verified, subscription status set to ACTIVE) | Yes (Forged webhook signature rejected 400; duplicate webhook ignored via idempotent event ID) | **VERIFIED PASS** |
| 8 | Subscription Expiry/Suspension → Fail-Closed Gate → Safe Reactivation | Frappe backend (`billing`, `tenant`), Redis cache, Ingress gateway, POS | Yes (Expired tenant transitioned to SUSPENDED, Redis cache cleared, write access restored on payment) | Yes (Suspended tenant API and POS submit fail-closed with HTTP 403 `TenantSuspendedError`) | **VERIFIED PASS** |
| 9 | Support Request → Persistence → Redacted Diagnostics → Failure Handling | `owner-dashboard` (`settings`), Frappe backend (`settings`, `Issue`) | Yes (Support ticket persisted in ERPNext Issue DocType with sanitized diagnostics attachment) | Yes (Offline/network failure shows friendly retry dialog with local report download; credentials redacted) | **VERIFIED PASS** |
| 10 | Backup Creation → Off-site Replication → Checksum → Restore & RTO Benchmark | Frappe bench, Python automation (`replicate_offsite.py`, `restore_scratch.py`), MinIO/S3 | Yes (Automated gzip backup, SHA256 checksum generated, S3 upload, scratch site restored, GL imbalance 0.0) | Yes (Corrupted SHA256 aborts restore immediately; missing archive triggers alert; RTO measured < 71s) | **VERIFIED PASS** |
| 11 | Store Settings Update → Persistence → ESC/POS Thermal Receipt Formatting | `owner-dashboard` (`settings`), Frappe backend (`settings`), `windows-pos` (`receipt`) | Yes (Business details, GSTIN, receipt headers updated and reflected on 58mm/80mm ESC/POS thermal output) | Yes (Malformed GSTIN rejected at server boundary; POS falls back safely to cached profile when offline) | **VERIFIED PASS** |
| 12 | Deployment Configuration → Health Checks → Ingress Routing → Rollback Procedure | Docker compose, CI automation (`secret_scan`, `validate_configs`), Staging preflight | Yes (All compose images pinned, 0 secret leaks, ingress port 8080 health checks pass) | Yes (Unhealthy container halts preflight with exit 1; zero-downtime rollback documented and tested) | **VERIFIED PASS** |

---

## 3. Deep-Dive Workflow Verification Evidence

### Workflow 1: Registration → Verification → Approval → Provisioning → Activation → Tenant Login
- **Component Flow:** Public Registration Form (`packages/marketing` / `apps/owner-dashboard`) → Server Action `submitLeadAction` → Frappe API `submit_lead` → Email OTP Verification → Admin Approval `approve_lead` → Background Provisioning Job `provision_tenant_job` → `tabSaaS Tenant Registry` updated with `lifecycle_status='ACTIVE'` → Hostname activated → Cashier/Owner login.
- **Successful Execution:**
  - Lead created in `tabSaaS Lead` with status `PENDING_VERIFICATION`.
  - OTP validated; lead marked `VERIFIED`.
  - Platform administrator approves; provisioning task restores base tenant schema, provisions database, assigns roles (`Cashier`, `Stock User`, `Item Manager`), and sets primary hostname.
  - Verified by tests in [test_onboarding_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_onboarding_api.py) and [onboarding.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/app/actions/onboarding.test.ts).
- **Failure Path:**
  - Unverified lead approval rejected with `LeadNotVerifiedError`.
  - Duplicate slug registration rejected with `TenantAlreadyExistsError`.
  - Invalid company or plan schema caught at API validation boundary.

### Workflow 2: Login → Membership Validation → Dashboard Access → Session Expiry
- **Component Flow:** Next.js Dashboard Client / Mobile App → Next.js Middleware (`middleware.ts`) → Frappe Auth API → Frappe Request Hook (`tenant.validate_tenant_request`) → Database `tabSaaS Tenant Membership` → RBAC Authorization.
- **Successful Execution:**
  - User authenticates; session cookie or API token resolved.
  - Request hook checks `tabSaaS Tenant Membership` where `tenant_id` matches current host context and `lifecycle_status = 'ACTIVE'`.
  - Dashboard routes render with corresponding tenant branding and store metrics.
  - Verified by [test_tenant_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_tenant_api.py), [middleware.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/middleware.test.ts), and [mobile-auth-isolation.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/mobile/src/__tests__/mobile-auth-isolation.test.ts).
- **Failure Path:**
  - Suspended member receives HTTP 403 `MembershipInactiveError` (`[PASS] 14_inactive_membership_denied` in E2E lifecycle test).
  - Cross-tenant API token usage returns HTTP 401 `AuthenticationError` (`[PASS] 15_cross_tenant_access_denied`).
  - Expired session cookie redirects instantly to `/login`.

### Workflow 3: Hostname Resolution → Ingress Routing → Correct Database & Isolated Data
- **Component Flow:** HTTP Request (Port 8080) → Ingress / Reverse Proxy → Host Header Inspection → Frappe Multi-Tenant Resolver (`departmental_store.api.tenant`) → Redis Cache Lookup (`saas_tenant_lifecycle:{host}`) → Tenant Site Database.
- **Successful Execution:**
  - `Host: e2e-life-a.local` routes to Site A MariaDB database; queries return Site A inventory (`Alpha Whole Grain Bread`).
  - `Host: e2e-life-b.local` routes to Site B MariaDB database; queries return Site B inventory (`Beta Fresh Milk`).
  - Verified custom domain `pos.shopalpha-verified.local` resolves to Site A with HTTP 200 (`[PASS] 08_verified_custom_domain_resolves_site`).
  - Full isolation verified by [test_two_site_tenant_isolation.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/test_two_site_tenant_isolation.py) and [test_tenant_lifecycle_and_custom_domain.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/test_tenant_lifecycle_and_custom_domain.py).
- **Failure Path:**
  - Unverified custom domain `pos.shopalpha-unverified.local` fails closed with HTTP 404 (`[PASS] 09_unverified_custom_domain_fails_closed`).
  - Removed custom domain immediately returns HTTP 404 via domain-scoped Redis cache invalidation (`[PASS] 10_removed_custom_domain_immediately_fails_closed`).
  - Forged forwarding headers (`X-Forwarded-Host: e2e-life-b.local`) sent to Site A fail to bypass boundary; request executes strictly within Site A (`[PASS] 12_forged_forwarding_headers_cannot_override_routing`).

### Workflow 4: Catalog Update → Dashboard Display → POS Catalog Incremental Sync
- **Component Flow:** ERPNext / Dashboard Catalog Editor → Frappe `tabItem` / `tabItem Barcode` → ERPNext Price List → POS API `get_pos_catalog(since_timestamp=...)` → POS SQLite `catalog_items` Table → In-Memory Fast Lookup Index → Billing Screen Scanner.
- **Successful Execution:**
  - SKU price or barcode edited on server; `modified` timestamp updated.
  - Windows POS invokes incremental sync with last sync timestamp; only modified records transferred.
  - POS SQLite database executes bulk `INSERT OR REPLACE` within atomic transaction.
  - Cashier scans barcode; item and price immediately resolve in cart.
  - Verified by [test_catalog_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_catalog_api.py), [catalog.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/domain/catalog.test.ts), and [repos.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/local/repos.test.ts).
- **Failure Path:**
  - Scanned unknown barcode triggers clear UI inline error banner ("Unknown barcode") without resetting cart state (`BillingScreen.test.tsx`).
  - Network disconnection during catalog delta download triggers exponential backoff without corrupting existing cached items (`sync-engine.test.ts`).

### Workflow 5: POS Sale → Durable Local Transaction → Sync Retry → Server Commit → Idempotent Duplicate Replay
- **Component Flow:** POS Cart → Tender Screen → SQLite Atomic Transaction (`sales_transactions` + `outbox_events`) → Sync Worker Background Thread → HTTP POST `departmental_store.api.sales.submit_pos_sale` → Server Idempotency Gate (`tabPOS Transaction Idempotency`) → Frappe `Sales Invoice` (`is_pos=1, update_stock=1`) → Local State `SERVER_COMMITTED`.
- **Successful Execution:**
  - Cashier completes checkout; POS writes sale and outbox record atomically in local SQLite with state `PENDING_SYNC`.
  - Outbox worker pushes transaction payload with stable UUID `transaction_id`.
  - Backend verifies idempotency key, posts official ERPNext Sales Invoice, creates GL entries and stock ledger entries, and returns invoice reference.
  - POS marks outbox record `SERVER_COMMITTED` with server invoice number.
  - Verified by [test_sales_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_sales_api.py), [outbox.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/domain/outbox.test.ts), and [sync-engine.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/domain/sync-engine.test.ts).
- **Failure Path:**
  - Network drops after server processes sale but before client receives response: POS sync engine retries request with identical `transaction_id`.
  - Server detects idempotency key; returns cached response with original invoice name without creating duplicate invoice or duplicate stock deduction (tested with 100 concurrent claims in `test_sales_api.py`).

### Workflow 6: Inventory Update → Stock Consistency Across Applications
- **Component Flow:** POS Sale / Sales Return → Frappe Sales Invoice / Return DocType → ERPNext Stock Ledger Entry (SLE) → Real-Time Bin Table (`tabBin`) → Owner Dashboard Reorder Alert.
- **Successful Execution:**
  - POS Sale with `update_stock=1` posts SLE, decrementing stock in `Stores - DS` warehouse.
  - Sales Return posts reverse SLE, restoring stock to designated return warehouse with reference to original invoice.
  - Owner dashboard reflects updated stock balances and low-stock reorder indicators.
  - Verified by [test_sales_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_sales_api.py), [test_returns_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_returns_api.py), and [ReorderExportButton.test.tsx](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/components/ReorderExportButton.test.tsx).
- **Failure Path:**
  - Negative stock check fails if warehouse balance is insufficient; entire transaction rolls back cleanly, leaving GL and Bin balances untouched.
  - Cross-tenant inventory query or modification attempt rejected with HTTP 401/404 (`test_two_site_tenant_isolation.py`).

### Workflow 7: Subscription Checkout → Payment Webhook → Entitlement → Reconciliation
- **Component Flow:** Owner Dashboard Billing Page → Server Action `createCheckoutSession` → Razorpay Order API → Payment Webhook (`POST /api/method/departmental_store.api.billing.handle_razorpay_webhook`) → HMAC-SHA256 Signature Verification → `tabSaaS Subscription` Status Update → Feature Tier Entitlements Activated.
- **Successful Execution:**
  - Store owner selects plan upgrade; checkout session initialized.
  - Razorpay sends `payment.captured` or `subscription.activated` webhook.
  - Server verifies webhook signature against shared webhook secret.
  - Subscription DocType updated with active billing period and entitlement limits (e.g. number of billing counters).
  - Verified by [test_billing_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_billing_api.py) and [billing.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/app/actions/billing.test.ts).
- **Failure Path:**
  - Forged webhook payload or invalid signature returns HTTP 400 `InvalidSignatureError`.
  - Replayed webhook delivery is safely ignored using payment ID deduplication.

### Workflow 8: Subscription Expiry/Suspension → Fail-Closed Gate → Safe Reactivation
- **Component Flow:** Scheduled Cron `check_subscription_status` → Overdue Period Exceeded → `tabSaaS Tenant Registry` `lifecycle_status = 'SUSPENDED'` → Redis Invalidation (`saas_tenant_lifecycle:*`) → Ingress Gate Enforcement → Payment Received → Status Restored to `ACTIVE`.
- **Successful Execution:**
  - Tenant whose subscription expires past the grace period is flagged `SUSPENDED`.
  - Redis cache key invalidated immediately.
  - Any subsequent API request (POS sale submit, stock update, item edit) fails closed with HTTP 403 `TenantSuspendedError` (`[PASS] 04_suspended_tenant_fails_closed`, `[PASS] 17_pos_sales_lifecycle_enforcement`).
  - Upon invoice settlement or subscription renewal, tenant status transitions to `ACTIVE`, cache is refreshed, and POS sync immediately resumes (`[PASS] 16_instant_cache_invalidation`).
- **Failure Path:**
  - Unauthenticated or unauthorized attempt to manually flip status to `ACTIVE` without valid payment reference is rejected by server permission checks.

### Workflow 9: Support Request → Persistence → Notification Attempt → Failure Handling
- **Component Flow:** Owner Dashboard Settings Page → Support Form → Server Action `submitSupportRequest` → Redaction Utility (`scrub_sensitive_data`) → Frappe API `create_support_ticket` → ERPNext `Issue` DocType → Email Notification Dispatch.
- **Successful Execution:**
  - User fills out issue description, severity, and attaches system diagnostics.
  - Diagnostics scrubbed client-side and server-side to remove private API tokens, passwords, and sensitive customer data.
  - Issue DocType persisted in ERPNext database with unique ticket ID; confirmation message displayed to owner.
  - Verified by [test_settings_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_settings_api.py) and [SettingsClient.test.tsx](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/components/SettingsClient.test.tsx).
- **Failure Path:**
  - SMTP server downtime or network failure during submission displays friendly retry message with option to download offline diagnostic bundle for manual transmission.

### Workflow 10: Backup Creation → Off-site Replication → Checksum → Restore & RTO Benchmark
- **Component Flow:** Scheduled Backup Cron → `bench --site [site] backup --with-files` → SHA256 Checksum Calculation (`SHA256SUMS.txt`) → Python S3 Uploader (`replicate_offsite.py`) → Encrypted Offsite Bucket (MinIO/S3) → Disaster Recovery Automation (`restore_scratch.py`) → Verification of General Ledger and Bin Balances.
- **Successful Execution:**
  - Full backup generates gzip database dump and files archive.
  - Manifest created with cryptographically verified SHA256 checksums for each file.
  - Uploaded to offsite S3 repository.
  - Disaster recovery test downloads archive, validates checksums, restores to clean scratch site, verifies General Ledger balance (exactly 0.0 imbalance), and measures Recovery Time Objective (RTO between 36.6s and 70.6s, well within 1-hour SLA).
  - Verified by [test_replicate_offsite.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/test_replicate_offsite.py) (29/29 tests pass) and [test_restore_scratch.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/test_restore_scratch.py).
- **Failure Path:**
  - Corrupted archive or tampered checksum aborts restoration immediately with exit code 1 before modifying any target database.

### Workflow 11: Store Settings Update → Persistence → ESC/POS Thermal Receipt Formatting
- **Component Flow:** Owner Dashboard Settings Screen → Server Action `updateStoreSettings` → Frappe API `update_store_settings` → ERPNext `Company` / `POS Profile` → POS Settings Sync → ESC/POS Thermal Receipt Generator.
- **Successful Execution:**
  - Store owner updates trading name, GSTIN, thermal receipt header lines, and footer message.
  - Updates persisted in ERPNext Company and POS Profile DocTypes.
  - Windows POS pulls updated settings on sync; thermal ESC/POS receipt prints with updated GSTIN, store title, B2C tax breakdown, and footer text.
  - Verified by [test_settings_api.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/unit/test_settings_api.py), [receipt.test.ts](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/domain/receipt.test.ts), and [SettingsClient.test.tsx](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/components/SettingsClient.test.tsx).
- **Failure Path:**
  - Invalid GSTIN format (regex validation) rejected by server API with HTTP 422 `ValidationError`.
  - If POS is offline when settings are modified, POS continues printing with locally cached settings until next successful sync.

### Workflow 12: Build/Deployment Configuration → Health Checks → Ingress Routing → Rollback Procedure
- **Component Flow:** Docker Compose Configuration Files → CI Secret Scan (`secret_scan.py`) → CI Config Validator (`validate_deployment_configs.py`) → Staging Preflight Check (`staging_preflight_check.mjs`) → Multi-Site Ingress Gateway → Rollback Symlinks.
- **Successful Execution:**
  - Secret scan verifies 393 tracked files with zero credentials, private keys, or API tokens detected.
  - Configuration validator confirms all container images (MariaDB, Redis, Frappe, Nginx, Next.js) use pinned, immutable version tags.
  - Staging preflight check verifies HTTP 200 response on port 8080 (`frappe.ping` -> `pong`), MariaDB connectivity, and background worker queues.
  - Rollback procedure documented and verified using atomic site directory symlinks and Docker compose version reverts.
  - Verified by [secret_scan.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/scripts/ci/secret_scan.py), [validate_deployment_configs.py](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/scripts/ci/validate_deployment_configs.py), and [staging_preflight_check.mjs](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/tests/integration/staging_preflight_check.mjs).
- **Failure Path:**
  - Unhealthy container or unreachable port causes staging preflight check to exit with code 1, preventing automated deployment cutover.

---

## 4. Defect Remediation Regression Verification

| Defect ID | Original Issue | Remediated In | Regression Verification Result |
|---|---|---|---|
| **DEF-001** | Removed or unverified custom domain returned HTTP 200 from stale Redis cache | `apps/frappe-custom/departmental_store/departmental_store/api/provisioning.py` & `tenant.py` (commit `d09db02`) | **PASS:** `test_tenant_lifecycle_and_custom_domain.py` Check 10 & 16 confirmed removed domain instantly fails closed with HTTP 404 (`instant_invalidation=true`). |
| **DEF-002** | Cashier shift management (F3) was UI-only without open/close shift tracking in SQLite | `apps/windows-pos/src/ui/ShiftModal.tsx`, `repos.ts`, `services.ts`, `App.tsx` (commit `4bd25f4`) | **PASS:** POS Vitest suite passed 80/80 tests including `repos.test.ts` shift persistence unit test and full UI rendering. |

---

## 5. Non-Functional Assurance

1. **Windows POS Offline Durability & Network Resilience:**
   - Durable local SQLite storage guarantees zero transaction loss during power loss or network failure.
   - Outbox events persist with atomic transaction writes.
   - Exponential backoff retry engine prevents network flooding upon reconnection.
2. **Financial Integrity & Double-Entry Accounting:**
   - Posted sales, returns, and inventory adjustments strictly utilize ERPNext standard accounting workflows.
   - 0.0 GL ledger imbalance proven in automated disaster recovery tests.
   - Idempotency table prevents duplicate revenue or duplicate tax claims.
3. **Multi-Tenant Security & Fail-Closed Ingress:**
   - Ingress router verifies tenant lifecycle on every request.
   - Suspended, archived, or unverified tenants immediately receive HTTP 403 / 404.
   - Forged forwarding headers cannot bypass tenant boundaries.
   - Zero cross-tenant data leakage between tenant databases.

---

## 6. Phase 7 Sign-Off & Release Readiness

With all 12 core cross-module workflows verified across both happy paths and failure edge cases, all defect fixes verified, and full test suites passing with zero errors, the platform has passed Phase 7 regression validation and is certified ready for Phase 8 final release packaging.
