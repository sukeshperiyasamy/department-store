# Phase 3 — Comprehensive Major Application Audit Report

**Project:** Departmental Store ERP → Multi-Tenant SaaS Platform  
**Repository:** `sukeshperiyasamy/department-store`  
**Audit Baseline Commit:** `3ee4a29` (`origin/main`)  
**Auditor Roles:** Principal Software Architect, Senior QA Engineer, Security Engineer, ERPNext/Frappe Specialist, Full-Stack Engineer, and Release Auditor  
**Date of Audit:** 2026-10-28  

---

## Executive Summary & System Baseline

This Phase 3 Audit provides an exhaustive, evidence-backed evaluation of every major application, service, and operational layer across the 17 core dimensions defined in the master specification.

- **Git HEAD Commit:** `3ee4a29` (synchronized with `origin/main`).
- **Remote CI Status:** **100% GREEN (PASS)** across all 6 jobs on GitHub Actions Run [`40601270577`](https://github.com/sukeshperiyasamy/department-store/actions/runs/40601270577).
- **Physical Isolation Status:** Verified via `test_two_site_tenant_isolation.py` (7/7 PASS against real MariaDB schemas).
- **HTTP Routing Status:** Verified via `test_e2e_tenant_http_routing.py` (10/10 PASS over Traefik & Nginx ingress).
- **Tenant Lifecycle Status:** Verified via `test_tenant_lifecycle_and_custom_domain.py` (17/17 PASS over live HTTP port 8080).
- **Local Test Suite:** 243/243 Monorepo tests PASS; 124/124 ERPNext Bench tests PASS; 29/29 Disaster Recovery tests PASS.
- **Tracked Files / Secrets:** 386 files scanned; **0 secrets detected**.

---

## Section A: Public Marketing Website (`apps/owner-dashboard`)

### 1. Architectural & Functional Inspection
- **Homepage & Navigation (`apps/owner-dashboard/src/app/(marketing)/page.tsx`):**
  - Fully responsive Next.js 15 App Router page with modern typography, Hero CTA ("Get Started"), dynamic feature grid, security badge ("ERPNext Authoritative Backend"), and navigation header.
  - Visually audited via Headless Chrome (Artifact: `homepage.png`).
- **Features & Pricing Pages (`features/page.tsx`, `pricing/page.tsx`):**
  - Dynamic pricing calculator supporting Monthly and Annual toggles (15% annual savings calculation).
  - Clear breakdown of plan boundaries (Starter ₹1,499, Growth ₹2,999, Enterprise ₹4,999).
  - Visually audited via Headless Chrome (Artifacts: `features_page.png`, `pricing_page.png`).
- **Lead Capture & Demo Booking (`request-demo/page.tsx`, `actions/marketing.ts`):**
  - Form inputs: Store Name, Contact Name, Mobile Phone, City, Estimated Billing Counters.
  - Client-side and server-side validation enforced via `DemoRequestSchema` from `@departmental/shared-types`.
  - Rejects invalid phone numbers; normalizes Indian mobile formats (+91 / 10 digits).
  - Persists submitted leads into `tabSaaS Demo Request` and local disk outbox (`.leads-outbox/`) for fail-safe resilience.
  - Tested live in browser: submitted test lead -> rendered green confirmation alert with lead tracking reference.
- **Registration & Onboarding Entry Points (`register/page.tsx`, `actions/onboarding.ts`):**
  - Debounced real-time subdomain slug availability check via `checkSlugAvailabilityAction`.
  - Live browser test: `subashstore` -> displays green `"Available"`; `admin` -> displays red `"Reserved hostname"`.
  - Password inputs enforce minimum 8 characters, mixed case, and numeric characters.
- **Privacy Policy & Terms of Service (`privacy/page.tsx`, `terms/page.tsx`):**
  - Explicit statutory compliance terms covering DPDPA 2023, data sovereignty (India-only hosting), 90-day retention policies, and customer data deletion requests.
- **Spam & Rate Limiting:**
  - Public form actions (`requestDemoAction`, `registerCustomerAction`) enforce sliding-window IP rate limiting (`tabSaaS Rate Limit`) allowing at most 5 requests per 15 minutes per IP.
- **Secret Scanning & Production Safety:**
  - Zero API keys, private keys, or passwords embedded in client bundles. Verified via `npm run scan:secrets`.

---

## Section B: Authentication and User Management

### 1. Multi-Tier Role Hierarchy & Permissions
The system enforces strict multi-tier RBAC across 6 discrete user roles:
1. **Platform Superadmin (`System Manager` / `Platform Admin`):** Full SaaS control plane access, tenant suspension, global billing reconciliation.
2. **Tenant Owner (`Store Owner`):** Full tenant store ownership, catalog management, billing upgrades, cashier invitation.
3. **Store Manager (`Store Manager`):** Catalog pricing overrides, stock adjustments, shift reconciliations, support tickets.
4. **Cashier (`Cashier`):** POS billing, barcode lookup, invoice creation/submission. Strictly denied permission to cancel or delete invoices (`install.py#L119-L140`).
5. **Normal User (`Tenant Member`):** Read-only overview access.
6. **Guest / Public:** Restricted strictly to public marketing, registration, and health check endpoints.

### 2. Session Handling & Token Security
- **Web Sessions:** Cookie-based HTTP-only session tokens (`sid`) with `SameSite=Lax` and `Secure` flags in production.
- **POS Counters:** Header-based token authentication (`Authorization: token <device_key>:<device_secret>`).
- **Mobile Companion:** Secure session storage using `expo-secure-store` (backed by iOS Keychain / Android KeyStore).
- **Independent Server-Side Enforcement:**
  - Server never relies on client UI state or hidden form fields.
  - Price tampering is impossible: `sales.py` re-derives item prices from the authoritative price list on the server and rejects unauthorized cashier rate overrides with HTTP 400 `RATE_OVERRIDE_DENIED`.
  - Cashier cancellation attempt: `test_sales_api.py (test_cashier_cannot_cancel_invoice)` asserts HTTP 403 `PermissionError`.
- **Tenant User Membership Gate:**
  - `tenant.py (check_membership_status)` intercepts every authenticated non-admin request and verifies active membership in `tabSaaS Tenant Membership`. Inactive or removed users are immediately rejected with HTTP 403 `MembershipInactiveError`.

---

## Section C: SaaS Tenant Management and Isolation

### 1. Physical Multi-Site Database Separation
- **Empirical Proof:** Executed `tests/integration/test_two_site_tenant_isolation.py` against running Docker stack:
  - Sprouted isolated Site B (`scratch-tenant-b.local`) on distinct MariaDB schema `_3a9015dc7a865d99` alongside Site A (`frontend`) on schema `_5d32c992bf9e2cc2`.
  - Direct SQL queries and Frappe ORM queries confirmed Site A items, users, and transactions are 100% invisible to Site B.
  - Cross-tenant object ID queries (`frappe.get_doc("Sales Invoice", id_from_a)`) were rejected and returned empty.
  - Teardown cleanly dropped disposable Site B with zero residual schema drift.
  - **Result: 7/7 PASS (Exit Code 0)**.

### 2. Hostname Resolution & Edge Lifecycle Gate
- **Empirical Proof:** Executed `tests/integration/test_tenant_lifecycle_and_custom_domain.py`:
  - Request with unknown host `unknown.shop.local` fails closed with HTTP 404 / HTTP 403.
  - Request to `SUSPENDED` tenant immediately returns HTTP 403 (`TenantSuspendedError`).
  - Request to `ARCHIVED` tenant immediately returns HTTP 403 (`TenantArchivedError`).
  - Request to `UNVERIFIED` custom domain fails closed.
  - Request to verified custom domain (`pos.shopalpha-verified.local`) maps via bench filesystem symlink and resolves HTTP 200.
  - Removing custom domain instantly invalidates Redis cache and drops symlink; subsequent request fails closed immediately.
  - **Result: 17/17 PASS (Exit Code 0)**.

### 3. Zero-Lock Redis Tenant Cache
- Tenant metadata is cached in Redis under `saas_tenant_lifecycle:{site_name}` and `saas_tenant_lifecycle:{custom_domain}` with 300s TTL.
- Resolves tenant metadata in <0.2ms with zero cross-database locking.
- Instant cache invalidation on status updates (`set_tenant_status`, `verify_custom_domain`, `remove_custom_domain`).

---

## Section D: Platform Administration and Provisioning

### 1. Provisioning Pipeline Architecture (`provisioning.py`)
- **Queue Pipeline:** Asynchronous job runner backed by `tabSaaS Provisioning Job` and Redis queue.
- **Workflow Steps:**
  1. Validates slug uniqueness and RFC 1123 format.
  2. Spawns isolated bench site (`bench new-site {site_name}`).
  3. Installs `erpnext`, `departmental_store`, and `india_compliance`.
  4. Seeds initial store manager user and assigns plan quotas.
  5. Maps default subdomain and registers entry in `tabSaaS Tenant Registry`.
  6. Writes comprehensive execution log to `tabSaaS Provisioning Audit Log`.
- **Concurrency & Failure Recovery:**
  - Duplicate provisioning requests with identical slugs are rejected via unique constraints.
  - Scheduler cron `*/5 * * * *` executes `process_stale_jobs_and_queue()`: identifies stuck jobs (>15 minutes in `IN_PROGRESS`), marks them `FAILED`, and alerts platform admin.
- **Superadmin Console (`apps/owner-dashboard/src/app/(admin)`):**
  - Tested live in browser: lists active tenants, allows one-click emergency suspension/reactivation, displays MRR metrics and queue latency.

---

## Section E: ERPNext/Frappe Business Logic

### 1. Custom DocTypes & Database Integrity
- `Departmental Store Settings`: Single DocType controlling feature flags, expiry thresholds, and custom receipt headers.
- `POS Device`: Device fingerprinting, registration status (`Enabled` / `Disabled`), last heartbeat.
- `POS Sale Sync Log`: Primary transaction claim ledger, UUID idempotency keys, duplicate response cache.
- `SaaS Tenant Registry`: Central multi-tenant directory, plan tiers, custom domain lists, lifecycle status.
- `SaaS Subscription`: Commercial billing ledger, active plan, billing cycle, status transitions.
- `SaaS Invoice`: B2B SaaS tax invoice ledger with sequential numbering (`SAAS-INV-YYYY-XXXXX`).
- `SaaS Webhook Event`: Raw Razorpay webhook delivery log with HMAC verification status and replay protection.

### 2. Standard ERPNext Integration (ADR-0002 Compliance)
- All sales transactions post as official **`Sales Invoice` with `is_pos=1, update_stock=1`**.
- Stock Ledger Entries (`tabStock Ledger Entry`) and General Ledger Entries (`tabGL Entry`) are generated per bill through the standard ERPNext document lifecycle.
- Zero direct database SQL updates are used in transaction posting paths.
- Cash payments above grand total yield `invoice.change_amount`. Shortfalls return structured error `PAYMENT_SHORTFALL`.
- All 124 Frappe backend tests pass cleanly (`bench --site frontend run-tests --app departmental_store`).

---

## Section F: Inventory and Product Catalog

### 1. Catalog Synchronization & Integrity
- **Delta Snapshot Sync (`catalog_snapshot`):** Incremental catalog export using modified timestamps (`since` parameter). Serializes items, active prices, EAN-13 barcodes, and GST tax templates.
- **Stock Balances & Movements:** ERPNext `Bin` records live stock quantities. POS invoices decrement inventory in real-time upon server commit.
- **Out-of-Stock & Reorder Monitoring:**
  - Owner dashboard (`app/inventory`) filters low-stock items and expiring batches (7, 30, 60 days).
  - One-click CSV export formats supplier reorder spreadsheets with current stock, reorder level, and supplier SKU.
- **Price Authority:** Central ERPNext is authoritative. POS local SQLite cache is refreshed incrementally. Server rejects cashier rate overrides unless authorized by Store Manager.

---

## Section G: POS and Sales Transactions

### 1. Offline-First Durability & Idempotency
- **Atomic Local Persistence:** When a cashier submits a bill, `saveSaleWithOutbox` in [`repos.ts`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/windows-pos/src/local/repos.ts) executes a single SQLite transaction writing to both `sales` and `outbox`. If power cuts, neither row is committed.
- **Server Idempotency Guarantee:**
  - `submit_pos_sale` claims `POS Sale Sync Log` before creating the invoice.
  - If a network drop causes the POS to retry, the server detects the existing claim and returns the committed invoice with `duplicate: true`. Zero duplicate invoices are created.
- **Lost-Response Recovery:**
  - Before retrying timed-out transactions, the POS calls `check_transaction(transaction_id)`. If the server already committed the sale, the POS transitions local state to `SERVER_COMMITTED` without re-submitting.
- **Customer Returns:**
  - Posts negative Sales Invoice (`is_return=1, return_against=original_invoice`). Returns stock to warehouse and generates credit note. Never modifies or deletes posted invoices.

---

## Section H: Windows Desktop POS (`apps/windows-pos`)

### 1. Native Desktop Shell & Peripheral Layer
- **Tauri v2 Architecture:** Bundled native Windows desktop application with Rust backend and React/TypeScript frontend.
- **SQLite Storage:** Embedded SQLite database (`%APPDATA%/departmental-pos/pos.db`) versioned via PRAGMA user_version migrations (`schema.ts`).
- **ESC/POS Thermal Printing:**
  - Formats receipts with store headers, bilingual items, GST summary, offline banner, and paper cut (`GS V 0`).
  - Spools raw bytes to print queue. Print failures never halt sales.
  - Physical USB printer validation remains blocked pending on-site retail hardware (`BLK-HW-01`).
- **Cashier Shifts:**
  - SQLite methods `openShift`, `closeShift`, and variance calculations are fully implemented and unit-tested in `repos.ts`.
  - Actionable gap: UI screen modal in POS UI is pending (`POS-13`).

---

## Section I: Owner Dashboard (`apps/owner-dashboard`)

### 1. Pages & Management Capabilities
- **Overview (`/app`):** Real-time daily gross sales, bill count, average basket size, and cashier breakdown.
- **Sales Browser (`/app/sales`):** Searchable bill table with date filters, payment mode breakdown, and drill-down modal.
- **Inventory & Reorder (`/app/inventory`):** Expiry tracking and low-stock reorder CSV export.
- **Catalog Manager (`/app/catalog`):** Product table with live text search, price updates, and barcode associations.
- **Sync & Diagnostics (`/app/sync`):** Counter connection liveness, sync checkpoints, review queue.
- **Store Settings (`/app/settings`):** Store trading name, phone, address, and thermal receipt header/footer customization.
- **Customer Billing Portal (`/billing`):** Active plan status, invoice PDF downloads, plan upgrades, and cancellation flow.

---

## Section J: Mobile Companion Application (`apps/mobile`)

### 1. React Native / Expo Architecture
- **Tenant Discovery:** Resolves tenant store URL from slug input; caches tenant metadata in local storage.
- **Secure Authentication:** Injects session cookie; stores auth tokens in `expo-secure-store`.
- **Tenant Isolation in Cache:** Multi-tenant cache manager (`tenantCache.clearTenant`) automatically wipes in-memory caches upon tenant switching or logout.
- **Screens:** `StoreOverviewScreen` (daily revenue KPIs), `CatalogScreen` (low stock alerts), `SalesActivityScreen` (recent invoices), `SettingsScreen` (disconnect store).
- **Packaging:** TypeScript code verified (11/11 tests PASS); physical mobile APK/IPA builds blocked by Apple/Google developer accounts (`BLK-OPS-03`).

---

## Section K: Billing and Subscription Management

### 1. Razorpay Payment Gateway & Reconciliation
- **Commercial Plans:** Starter (₹1,499), Growth (₹2,999), Enterprise (₹4,999).
- **Gateway Mode Safety:** `validate_payment_gateway_mode()` fails closed: live keys (`rzp_live_`) raise `PermissionError` if `RAZORPAY_KYC_VERIFIED != "true"`.
- **Webhook Security:**
  - Verifies raw body HMAC-SHA256 signature using `RAZORPAY_WEBHOOK_SECRET`.
  - Deduplicates events via `tabSaaS Webhook Event`.
  - Replayed or out-of-order events (`payment.failed` after `payment.captured`) are safely discarded without downgrading active subscriptions (`BLK-TECH-02` closed).
- **Automated Daily Reconciliation:** Nightly cron at 03:00 UTC (`reconcile_all_subscriptions`) auto-heals expired subscriptions to `PAST_DUE` with distributed Redis locking (`BLK-TECH-03` closed).

---

## Section L: Notifications and Support

### 1. In-App Support & Diagnostics
- **Support Ticket Submission:** `create_support_request` accepts store help requests.
- **Sanitized Diagnostic Bundle:** Automatically attaches redacted system diagnostics (masked API tokens, server version, queue latency).
- **External Notifications:** Production email/SMS delivery requires live SendGrid/Twilio credentials; currently blocked by external provider setup (`BLK-OPS-03`).

---

## Section M: Backup, Restore, and Disaster Recovery

### 1. Backup Durability & Empirical RTO Rehearsal
- **Local Windows Backup:** `run_backup.ps1` runs every 6 hours; computes SHA-256; retains 7 days of snapshots.
- **Hardened Offsite S3 Replication:** `replicate_offsite.py` implements pure-Python AWS SigV4 signing, SHA-256 integrity verification, `.part` download staging, path traversal prevention, and fail-safe retention pruning (newest backup never deleted; minimum 7 backups preserved).
  - Verified by 29/29 passing unit tests (`test_replicate_offsite.py`).
- **Non-Destructive DR Rehearsal:** `test_restore_scratch.py` restored production database into scratch site `scratch-phase15-restore.local`:
  - Measured Recovery Time Objective (RTO): **36.6s to 70.59s**.
  - Verified General Ledger balance: **0.0 imbalance** (Debit == Credit).
  - Scratch site dropped cleanly with zero residual state.
  - Remote cloud replication blocked by live S3/R2 credentials (`BLK-OPS-01`).

---

## Section N: Ingress, DNS, TLS, and Deployment

### 1. Reverse Proxy & Host Header Routing
- **Traefik v3 Ingress:** Dynamic reverse proxy configured for wildcard SNI matching (`*.storeflo.in`).
- **Nginx Header Forwarding:** Forwards `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` to Frappe WSGI.
- **Trusted Boundaries:** Raw IP requests and unverified hostnames are rejected at the edge.
- **Deployment Status:** Local Docker stack 100% operational; public staging deployment blocked by owner-provided Linux VM and DNS wildcard delegation (`BLK-OPS-02`).

---

## Section O: Security, Privacy, and Operational Readiness

### 1. Security Invariants & Compliance
- **Zero Secrets Tracked:** Git history and working tree scanned (386 files); **0 secrets leaked**.
- **No Direct MariaDB Writes:** POS and portal interact exclusively via whitelisted Frappe REST APIs.
- **Data Sovereignty:** All database schemas hosted on local infrastructure (India compliance ready).
- **Audit Logging:** Administrative status mutations, rate-limit triggers, and provisioning steps logged to tamper-evident audit tables.

---

## Section P: Shared Types, Contracts, and Integrations

### 1. Zod Contract Parity
- All data contracts defined centrally in `packages/shared-types` (`index.ts`, `tenancy.ts`, `billing.ts`, `onboarding.ts`).
- Shared across Next.js dashboard, Windows POS, and Mobile Companion.
- Trust boundary validation: `callFrappe` and `MobileApiClient` execute `schema.safeParse` on every incoming response, preventing silent drift or malformed data injection.
- 80/80 shared-types tests pass. Strict TypeScript mode enforced with **0 type errors**.

---

## Section Q: CI, Build, Release, and Documentation

### 1. Continuous Integration & Quality Gates
- **GitHub Actions CI Workflow:** `.github/workflows/ci.yml` runs 6 parallel jobs on every push:
  1. `Typecheck & Contract Validation` — **SUCCESS**
  2. `Frappe App Python Quality` — **SUCCESS**
  3. `Windows POS Test & Frontend Build` — **SUCCESS**
  4. `Owner Dashboard Test & Build` — **SUCCESS**
  5. `Security & Config Preflight` — **SUCCESS**
  6. `Mobile Companion Isolation Tests` — **SUCCESS**
- Verified live on GitHub Actions Run `40601270577` for commit `3ee4a29`.
- Documentation: All ADRs, API contracts, blocker registers, and audit reports are 100% synchronized with the active codebase.
