# KNOWN_ISSUES_AND_TODO

Last updated: 2026-10-27 (fresh-stack validation pass). Full defect register: `docs/testing/BUG_REPORT.md`.

## Resolved issues (evidence in docs/testing/)

### ISSUE-05 — dev-container DB contention — RESOLVED 2026-10-27 by full environment reset
- Backup `20261027_035610` verified (gzip -t + SHA256SUMS) before `docker compose down -v`.
- Fresh stack: MariaDB 11.8 + ERPNext v16.52.1/Frappe v16.53.0 site `frontend`, both custom apps
  reinstalled (`departmental_store` 0.1.0, `india_compliance` 16.11.0 version-16), reseeded
  (demo users, QA POS profile, 160-item regional catalog idempotent, GST templates, 300 PERF items).
- **Zero deadlocks after the full validation pass**: `Innodb_deadlocks = 0` (queried via
  `mariadb` in the db container), 0 "deadlock" matches in backend + queue-worker logs across
  api_suite (concurrent RACE-01), multi_counter (two-counter races, concurrent refunds) and
  reliability_check. The prior contention did not reproduce on the fresh volumes.
- The MC-D1 single-retry safety net stays in `submit_pos_sale` as defense in depth.
- Production sizing/indexing review remains a TODO before go-live.

### Payment Reconciliation Security & Webhook Integrity — HARDENED & VERIFIED 2026-10-27 (Phase 14)
- **Payment Gateway Mode Guard**: Hardened `validate_payment_gateway_mode()`: key must be non-empty and start with `rzp_test_` or `rzp_live_`; live key without `RAZORPAY_LIVE_MODE=true` fails closed; test key with `RAZORPAY_LIVE_MODE=true` fails closed; live key without `RAZORPAY_KYC_VERIFIED=true` raises `PermissionError` citing formal commercial clearance block.
- **Reconciliation Authorization RBAC**: Multi-tier security on `reconcile_subscription_payments()`: Guests and Cashiers rejected with `PermissionError`; Store Managers can only reconcile their own shop (`require_tenant_billing_access`); platform-wide reconciliation and `auto_heal=True` strictly restricted to `Platform Admin`.
- **Distributed Concurrency Lock**: Distributed cache lock `reconcile_payments_{tenant_id or 'global'}` prevents race conditions; concurrent attempts return `status: "LOCKED"`.
- **Webhook Order Match & Fail-Closed Guard**: Removed dangerous subscription fallback; unknown `order_id` in webhook raises `ValidationError` and rolls back database transaction; mismatched tenant ID in payload raises `PermissionError`.
- **Duplicate Capture & Refund/Dispute State Transitions**:
  * Duplicate captures (`payment.captured` + `order.paid`) deduplicated: exactly 1 invoice generated, period end not double-extended.
  * Partial refund: marks transaction and invoice `PARTIALLY_REFUNDED`; subscription and tenant remain active.
  * Full refund: marks transaction and invoice `REFUNDED`; subscription cancelled; tenant suspended.
  * Dispute: marks transaction `DISPUTED`; subscription placed `PAST_DUE`.
- **Daily Scheduled Runner**: Added cron `0 3 * * *` in `hooks.py` invoking `scheduled_subscription_reconciliation()` under `Administrator` context.
- **Test Evidence**: 21 passing automated tests in `test_billing_api.py`; 350 automated tests pass cleanly across all repository workspaces.

### ISSUE-01 / STOCK-01 — RESOLVED as QA-0005 (real product defect, not environment)
- True root cause found during the fresh-stack run: `_posting_date` converted tz-aware
  `occurred_at` with Python `datetime.astimezone()`, which follows the **container TZ (UTC)**,
  while Frappe posts stock entries in the **site timezone (Asia/Kolkata fallback — the fresh site
  shipped with an empty `time_zone`)**. The posting date landed on the previous calendar day, so
  any receipt posted minutes earlier sat "in the future" of the sale and stock validation failed
  with NegativeStockError ("2.0 units of RACE-ITEM-… needed…") even though the bin had the stock.
  Non-stock PERF items masked the bug (no stock validation), which is why suites mostly passed.
- Fix: `_posting_date` now converts via `frappe.utils.convert_utc_to_timezone(occurred,
  get_system_timezone())`; new `ensure_site_timezone` pins `System Settings.time_zone = Asia/Kolkata`
  on install. Regression tests: `test_posting_date_converts_to_site_timezone_not_process_tz`
  (deterministic) and `test_utc_aware_timestamp_uses_site_timezone_date` (end-to-end).
- Post-fix evidence: api_suite STOCK-01 PASS (`full=SERVER_COMMITTED`, oversell blocked),
  RACE-01 PASS with correct semantics (`committed=1 review=2` for 1 unit).

### ISSUE-02 — RESOLVED 2026-10-27 at the infrastructure layer (second root cause found)
- New mechanism discovered: the one-shot `configurator` service (`ls -1 apps > sites/apps.txt`)
  **re-runs on every `docker compose start backend`** (compose re-runs exited
  `service_completed_successfully` dependencies), and the configurator container only has
  frappe/erpnext baked in — so every backend restart wiped the custom apps from apps.txt.
  Warm gunicorn/redis module caches masked it; fresh bench processes (e.g. `bench run-tests`)
  then failed with "Module GST India not found".
- Permanent fix: the configurator command in `deployment/erpnext/pwd.yml` now MERGES its baked
  app list into sites/apps.txt (`sort -u` union) instead of overwriting. Proven: `stop backend`
  + `start backend` re-ran the configurator (StartedAt 23:07:33Z) and apps.txt retained all 4
  apps. `ensure_app_registered` (union self-heal) and `tests/integration/apps_txt_guard.mjs`
  remain as defense in depth; multi_counter/reliability restart steps now self-heal explicitly.
- Test-layer fixes in the same pass: `check_module_map`/`ensure_app_registered` reported a
  never-true assertion (probed app names as module keys — frappe has no module "frappe",
  erpnext none "erpnext", india_compliance none "india_compliance"); diagnostics now probe real
  module keys (`departmental_store`, `income_tax_india`, `gst_india`, `accounts`).

### Seed/QA fixes bundled with the fresh stack (2026-10-27)
- **HSN on all seed/test items**: india_compliance enforces HSN on sales items (length-validated
  against GST Settings) and links Item Tax rows via the GST HSN Code master. Demo items now carry
  plausible HSN codes (toothpaste 330610, rice 100600, milk 040110, biscuit 190531, shampoo 330510);
  race/PERF/test items use synthetic `999999`; all reference records are created by
  `seeds._ensure_demo_hsn`. Keep `validate_hsn_code` ON — the GST validation suite needs it.
- `regional_catalog.seed` and `check_module_map` now return dicts (bench `execute` prints dicts as
  clean JSON; json.dumps strings get repr-escaped and break script parsing).
- `multi_counter.ts` `record(id, name, status, detail)` signature fixed — verdicts previously
  landed in `detail`, so the summary could never count PASS/FAIL and the script always exited 0.
- Old aware-occurred_at test fixture sent site-local wall time mislabeled as UTC; it now sends
  true UTC (what a real counter sends) — under the QA-0005 contract the old fixture is
  legitimately 5.5h ahead and goes to review.

### ISSUE-03 — server error messages contain raw HTML (Low, cosmetic, OPEN)
- ERPNext validation messages (e.g. stock shortfall) include `<strong>/<a>` markup which the
  POS result dialog renders as literal text. Strip HTML in `departmental_store.api.*`
  responses or render as rich text client-side.

### ISSUE-04 — remaining `bench` console quirks (Low, environment, OPEN)
- IPython heredocs swallow multiline output; bench kwargs break through Git Bash quoting.
- `bench --site X pip install` is invalid (pip is bench-level: `bench pip install -e ./apps/app`).
- `bench execute` falls back to `eval` of the method string when the call raises, masking the
  real exception with a confusing NameError — debug via `bench console` when a seed "fails".
- Mitigation in place: no-arg seed wrappers (`demo_run`, `seed_run`, `setup_run`, …); prefer
  `bench execute` return values.

### Manager Console Settings Page & Audit — RESOLVED 2026-10-27
- Responsive Settings interface at `/settings` on Manager Console matching light theme (white cards, soft grey background, teal accents).
- 9 categorized sections: Store Profile, Regional Preferences (Tamil Nadu), GST Configuration, POS Counters & Devices, Feature Flags, Printers, Inventory & Expiry, Voice & AI Integration, and System Health.
- Live persistence via Next.js Server Action invoking `set_flag(flag, value)`; server authorization enforced (System Manager required; Store Manager, Cashier, and unauthenticated sessions rejected with clear error feedback and state rollback).
- Honest status indicators for unavailable/pending hardware features (e-invoicing exempt, speech engine unconfigured, physical printer validation pending).
- Post-implementation audit fixes:
  - Fixed duplicate HTML IDs across domain and central sections via `idPrefix` (`toggle-${idPrefix}-${meta.key}`).
  - WCAG switch accessibility: added `role="switch"` and `aria-checked={enabled}`.
  - Live operational metrics: wired `SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'` and `SELECT VERSION()` to `server_status()`, rendering genuine engine stats (0 deadlocks verified).
  - GST safety: added prominent demo warning callout highlighting mock GSTIN `33AAAAA0000A1Z5` and requiring certified accountant sign-off before production.
  - Replaced single doctype setter with `frappe.db.set_single_value` to eliminate deprecation warning.
### Backup Automation, Host Scheduling & Restore Rehearsal — RESOLVED 2026-10-27
- Native Windows PowerShell runner `deployment/backup/run_backup.ps1` and Git Bash runner `deployment/backup/run_backup.sh` verified.
- Windows Task Scheduler registration script `deployment/backup/schedule_backup.ps1` executed; task `DepartmentalStore-ERP-Backup` is `Ready` (daily at 02:00 AM IST).
- Isolated scratch site restore rehearsal verified: dump restored into `scratch-restore.local`; verified 4 apps, 95 sales invoices, 501 catalog items, 134 sync logs, all 10 feature flags; scratch site cleanly dropped with zero impact on production `frontend`.

### Windows NSIS Packaging Workflow — CONFIGURED 2026-10-27
- GitHub Actions CI workflow created at `.github/workflows/windows-release.yml` using `windows-latest` MSVC runner.
- Configured Tauri NSIS packaging, Authenticode code-signing step, silent install (`/S`) and silent uninstall tests, SHA256 checksumming, and GitHub Release drafting.
- Documented in `docs/release/WINDOWS_NSIS_AND_PACKAGING_GUIDE.md`.

### Production Deployment Checklist — RESOLVED 2026-10-27
- Comprehensive checklist documented in `docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md` defining requirements for store legal entity, certified GSTIN, HSN tax templates, cashier/manager least-privilege accounts, device UUID registration, network security, and backup replication.

### Multi-Tenant SaaS Platform Phase 0 & 1 — IMPLEMENTED 2026-10-27
- **Architecture decision**: `ADR-0008` accepted (Central SaaS Control Plane with physical database isolation via dedicated Frappe tenant sites).
- **Contracts and resolution engine**: `packages/shared-types/src/tenancy.ts` defines tenant lifecycle, RFC 1123 hostname normalization, validation, resolution, and server-side authorization boundaries (38 unit tests PASS).
- **Backend Frappe API**: `departmental_store.api.tenant` (`resolve_tenant_by_host`, `get_tenant_info`, `list_user_tenants`) with 12 bench tests PASS.
- **Zero single-store regressions**: all 52 backend tests, 103 TypeScript tests, and Next.js production build pass cleanly.

### Multi-Tenant SaaS Platform Phase 2 (Marketing & Onboarding) — IMPLEMENTED 2026-10-27
- **Public Marketing Website**: Separated from authenticated dashboard via Next.js route groups `(marketing)` and `(app)`. Public routes: `/` (10-section homepage), `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms`. Authenticated dashboard accessible under `/app` and existing modules (`/catalog`, `/sales`, `/inventory`, `/sync`, `/settings`).
- **Lead Capture & Demo Requests**: Validated `DemoRequestSchema` with server/client Zod checking, rate limiting, and durable storage in both MariaDB `tabSaaS Demo Request` and local `.leads-outbox/`.
- **Shop Onboarding & Slug Reservation**: Registration entry point at `/register` with live slug availability check (`checkSlugAction`) rejecting reserved keywords (RFC 1123). Truthful status feedback: "Request submitted; activation pending review." No unverified live provisioning claimed.
- **Verification Evidence**: 145 vitest tests pass, 55 backend Frappe tests pass, Next.js production build passes with all 11 routes optimized, browser subagent verified visual rendering and interactivity.

### Multi-Tenant SaaS Platform Phase 3 (Provisioning Pipeline & Platform Admin Console) — IMPLEMENTED 2026-10-27
- **Tenancy Lifecycle State Machine**: Formally defined 10-state lifecycle in `packages/shared-types/src/tenancy.ts` (`PENDING_REVIEW`, `APPROVED`, `REJECTED`, `PROVISIONING`, `PROVISIONED`, `VERIFICATION_PENDING`, `ACTIVE`, `PROVISIONING_FAILED`, `SUSPENDED`, `ARCHIVED`) with server-side transition rejection (`isValidStateTransition`).
- **Dedicated Platform Admin Boundary (ADR-0009)**: Strict role separation; tenant `System Manager` role denied access to global control plane.
- **Durable Provisioning Queue & Worker**: `tabSaaS Provisioning Job` with atomic row claiming (`SELECT ... FOR UPDATE`), step tracking (`INIT` -> `COMPLETED`), timeout recovery, bounded retries (max 3), and sanitized error logs (zero secret/credential leakage).
- **Platform Admin Console**: Full administrative UI at `apps/owner-dashboard/src/app/(admin)/admin/onboarding` with 4 KPI cards, filter tabs, instant search, inspect drawer with job steps and audit history, and approval/rejection/retry/suspension modals.
### Multi-Tenant SaaS Platform Phase 4A (Provisioning Security, Tenant Isolation & Subdomain Routing) — IMPLEMENTED 2026-10-27
- **Privileged Provisioning Security**: Subprocess credential redaction (`--admin-password`, `--db-root-password`) via `sanitize_error()`, dynamic `MARIADB_ROOT_PASSWORD` env lookup, per-tenant 24-character cryptographic password generation (`frappe.generate_hash(24)`), atomic stale-job reclamation (`heartbeat_at < NOW() - INTERVAL 600 SECOND`) with bounded retries, and scheduled worker entry point (`process_stale_jobs_and_queue`).
- **Server-Side Authorization & Canonical Role Reconciled**: Investigated and reconciled canonical role naming (`Cashier` in `install.py`). Verified that store-level `System Manager` and `Cashier` cannot execute platform operations.
- **Local Subdomain Routing Middleware**: Next.js `middleware.ts` enforces RFC 1123 normalization, rejects untrusted client forwarding headers, extracts tenant slug, locks out `/admin` access on tenant subdomains (`403 Forbidden`), and sets cache isolation (`Vary: Host, Cookie`) plus security headers.
- **Tenant Context Server Guard**: `apps/owner-dashboard/src/lib/tenant-context.ts` provides server-side `getTenantContext()` and `verifyTenantAccess()`.
- **Two-Tenant Isolation Test Suite**: End-to-end suite `erpnext-app/departmental_store/departmental_store/tests/test_tenant_isolation.py` proves physical database separation, independent sessions, zero default fallbacks, and cross-tenant rejection between Shop A and Shop B.
### Multi-Tenant SaaS Platform Phase 4B (Production Ingress, Wildcard TLS & Tenant Routing) — IMPLEMENTED 2026-10-27
- **Ingress Controller Selected**: Traefik v3 selected over Caddy v2 due to native Lego ACME DNS-01 provider plugins (Cloudflare, AWS Route53, etc.) built into official image without custom Docker compilation (ADR-0010 accepted).
- **Deployment Templates**: Production and staging ingress configurations deployed in `deployment/ingress/`:
  - Static configuration: `traefik.yml` (Port 80->443 redirect, TLS 1.2+ ciphers, trusted proxy CIDR filtering, internal healthcheck/metrics, Let's Encrypt prod and staging resolvers).
  - Dynamic routing matrix: `dynamic/routing.yml` (Dual-upstream separation: Next.js 15 `owner-dashboard` on port 3100 for marketing, platform admin, and tenant web UI; Frappe Nginx `frontend` on port 8080 with priority 100 for `/api`, `/assets`, `/socket.io`, `/files`).
  - Container compose: `docker-compose.traefik.yml` with persistent `traefik-acme` volume (chmod 600) and no public database/redis exposure.
  - Reference Caddyfile: `caddy/Caddyfile.example` for cross-proxy architecture evaluation.
- **Strict Hostname Verification & Activation Separation**: Implemented `verify_tenant_hostname` and `activate_tenant` in `provisioning.py`; updated `resolve_tenant_by_host` in `tenant.py` to enforce that a site must be `PROVISIONED`, its hostname must be `VERIFIED`, and its status must be `ACTIVE` before any tenant traffic routes. Suspended and archived tenants are rejected immediately with zero database deletion.
- **Runbooks & Recovery Guides**: Created `docs/operations/INGRESS_AND_WILDCARD_TLS_GUIDE.md`, `docs/operations/STAGING_ACCEPTANCE_RUNBOOK.md`, and `docs/operations/INGRESS_ROLLBACK_AND_MONITORING.md`.
### Multi-Tenant SaaS Platform Phase 4C (Staging Deployment & Real-World Acceptance Testing) — STATUS: BLOCKED (Prerequisites)
- **Preflight & Compose Audit**: Automated preflight test `tests/integration/staging_preflight_check.mjs` (13/13 PASS) verified clean compose rendering, restricted port exposure (only 80 & 443; MariaDB 3306, Redis 6379, Frappe 8000 closed publicly), container privilege hardening, and separate ACME staging directory configuration.
- **Missing Prerequisites Documented**: External cloud deployment and live DNS-01 certificate requests held back pending project owner inputs:
  1. Owner-controlled staging domain (e.g. `staging.departmentstore.in`).
  2. Authoritative DNS delegation & CNAME records.
  3. Scoped DNS provider API token (e.g. Cloudflare `Zone:DNS:Edit`).
  4. Public staging Linux VM with ingress firewall.
  5. Explicit project owner deployment authorization.
- **Runbook Updated**: Documented execution records and verification criteria in `docs/operations/STAGING_ACCEPTANCE_RUNBOOK.md`.

## Open issues
- ISSUE-03 (HTML in error messages) and ISSUE-04 (bench quirks) above.

## TODO — prioritized

### SaaS Evolution Status & Next Modules
1. **Shared Multi-Tenant Mobile App (Phase 5) — COMPLETED**: Expo SDK 52 + React Native 0.76 client in `apps/mobile`; multi-tenant discovery, secure storage, tenant-bound session, role-based screens, offline cache; 11 vitest tests PASS, 9 live integration checks PASS.
2. **SaaS Subscription Billing & Customer Portal (Phase 6) — COMPLETED (`SANDBOX READY`)**: Complete commercial control plane in `packages/shared-types/src/billing.ts`, Frappe `billing.py`, Razorpay Sandbox integration, HMAC-SHA256 signature verification, idempotent webhook deduplication, customer self-service portal (`/billing`, `/billing/plans`, `/billing/invoices`, `/billing/usage`, `/billing/cancel`), platform-admin billing console (`/admin/billing`), and server-side counter limits in `devices.py`. 10 Frappe backend tests PASS, 9 integration checks PASS, 44 dashboard vitest tests PASS, Next.js build PASS (19 routes).
3. **SaaS Onboarding Automation & Tenant Lifecycle Operations (Phase 7) — COMPLETED (`CONDITIONAL GO — SUPERVISED PILOT`)**: Multi-dimensional operations layer decoupling 6 distinct dimensions (Contact Verification, Business Review, Site Provisioning, Hostname Verification, Subscription Status, Tenant Access). Single-use SHA-256 hashed verification tokens, 24h expiration, sliding-window rate limiting (`tabSaaS Rate Limit`), anti-enumeration, customer status portal (`/onboarding/status`, `/onboarding/verify`), platform operations cockpit (`/admin/operations`), customer notification deduplication (`tabSaaS Notification Log`), tenant suspension/reactivation with zero data deletion, and runbook `ONBOARDING_AND_TENANT_LIFECYCLE_RUNBOOK.md`. 98 Frappe backend tests PASS, 55 dashboard vitest tests PASS, 75 shared-types tests PASS, 8 integration checks PASS, Next.js build PASS (22 routes).
4. **Production Hardening, Observability, Disaster Recovery & Security Readiness (Phase 8) — COMPLETED (`CONDITIONAL GO — SUPERVISED PILOT`)**:
   - Comprehensive STRIDE threat model covering 12 attack surfaces in `docs/security/THREAT_MODEL_AND_SECURITY_AUDIT.md`.
   - Verified Docker container network isolation (MariaDB 3306 & Redis 6379 unexposed to host or internet; only Nginx 8080 published).
   - Centralized fail-closed environment validator `apps/owner-dashboard/src/lib/env.ts` with strict URL enforcement and zero secret leakage.
   - Production telemetry APIs: `get_liveness` (public probe) and role/token-protected `get_system_health` in Frappe backend; Next.js `/api/health` dependency probe.
   - Live disaster recovery rehearsal: fresh automated backup executed with SHA-256 checksums; restored into isolated scratch site `scratch-phase8-restore.local` in 21 seconds with 1:1 data parity (254 Sales Invoices, 545 Items, 353 POS logs) and clean teardown without touching production. Documented in `BACKUP_AND_DISASTER_RECOVERY.md`.
   - Comprehensive operational runbooks: 13 actionable runbooks covering security breaches, data leaks, outages, disk exhaustion, webhook failures, and deployment rollbacks in `docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md`.
   - Automated security check suite: `tests/integration/security_and_hardening_check.mjs` (15/15 PASS).
   - Production readiness scorecard & release matrix in `docs/release/PRODUCTION_READINESS_SCORECARD.md` with verdict CONDITIONAL GO — Supervised Pilot.
### Multi-Tenant SaaS Platform Phase 11 (Continuous Delivery, Release Governance & Operations) — IMPLEMENTED 2026-10-27
- **Automated PR CI Quality Gates**: `.github/workflows/ci.yml` (8 parallel jobs covering secret scanning, compose validation, TypeScript across 4 workspaces, shared-types Zod schemas, dashboard test/build, POS test/build, mobile tests, and ruff linting).
- **Multi-Component Versioning & Release Provenance**: SemVer policy and immutable Release Manifest schema (`release-manifest.json`) recording commit SHA, build number, dependency locks, and SHA256 checksums in `docs/release/VERSIONING_AND_RELEASE_ARTIFACTS.md`.
- **Database & Migration Governance**: 5-phase expand-and-contract policy, non-destructive SQLite migrations for POS, pre-migration backups, and immutable ERPNext financial workflows in `docs/release/DATABASE_AND_MIGRATION_GOVERNANCE.md`.
- **Automated Tenant Migration Runner**: `scripts/tenant_migration_runner.py` with site discovery, canary cohort execution (`frontend`), migration locking (`/tmp/migration_lock_<site>.lock`), pre/post-migration health checks, and immediate halt on failure.
- **Deployment Orchestration & Rollout**: Staging smoke tests, canary observation window, automated and operator halt flags, and persistent volume protection in `docs/release/DEPLOYMENT_ORCHESTRATION_AND_ROLLOUT.md`.
- **Client-Server Compatibility & Offline Queue Preservation**: N-1 minor client backward compatibility, API v1 contracts, durable offline SQLite outbox queue preservation across upgrades in `docs/release/CLIENT_SERVER_COMPATIBILITY_MATRIX.md`.
- **Feature Flag Governance & Session Guards**: Server-side `require_flag()` enforcement, 9 active flags in `Departmental Store Settings`, audit logging, immediate suspended tenant denial in `docs/release/FEATURE_FLAG_GOVERNANCE.md`.
- **Operations Handbook & Maintenance Calendar**: Parameterized 12 operational roles with runbooks, established maintenance calendar for daily backups, secret rotation, TLS renewal, and DR simulations in `docs/operations/OPERATIONS_HANDBOOK_AND_MAINTENANCE_CALENDAR.md`.
- **Release & Change Audit Trail**: Standardized JSON audit schema for releases, migrations, feature flags, and tenant lifecycle with strict credential redaction and tenant immutability in `docs/operations/AUDIT_TRAIL_SPECIFICATION.md`.
- **Release Simulation Suite**: `tests/integration/release_simulation_suite.mjs` (7/7 PASS) demonstrating canary migration, failure halt, N-1 client compatibility, and offline idempotency under retry; artifacts in `docs/testing/artifacts/release-simulation-results.json`.
- **Release Readiness Scorecard**: Evaluated 12 release gates (12 PASS); issued formal verdict `CONDITIONAL GO — Limited Production Releases with Operator Approval` in `docs/release/RELEASE_READINESS_SCORECARD.md`.

### Multi-Tenant SaaS Platform Phase 12 (Product Maturity, Customer-Driven Roadmap & SaaS Growth) — IMPLEMENTED 2026-10-27
- **Product Gap Analysis & Baseline Audit**: Complete inventory of existing features, usability bottlenecks, and reliability gaps; categorized into 5 tiers in `docs/product/PRODUCT_GAP_ANALYSIS.md`.
- **Customer Feedback & Product Discovery Framework**: 8-dimension structured intake schema, Sev 1-4 triage matrix, anti-surveillance guarantee, and zero-PII/zero-credential guardrails in `docs/product/CUSTOMER_FEEDBACK_AND_DISCOVERY_FRAMEWORK.md`.
- **Tenant Store Profile & Thermal Receipt Customization**: Extended `Departmental Store Settings` single DocType with 10 store profile fields (`store_name`, `store_phone`, `store_address`, `receipt_header`, `receipt_footer`, `business_hours`, `tax_number`, `currency_symbol`, `date_format`), granted `write: 1` to `Store Manager`, added `get_store_profile` and `update_store_profile` APIs, and created an interactive editable card in `SettingsClient.tsx`. 13 Frappe backend tests PASS, 7 dashboard actions tests PASS.
- **Actionable Low-Stock Reorder CSV Export**: Developed `ReorderExportButton` component for `/inventory`; one-click client-side CSV export calculates suggested order quantities (`reorder_qty` or `reorder_level - actual_qty`) for instant supplier replenishment; 2 vitest unit tests PASS.
- **In-App Customer Support & Redacted Diagnostics**: Implemented `submit_support_request` API in Frappe with SLA calculation, interactive ticket submission form in Settings Section 10, and one-click copyable zero-PII system telemetry bundle; 2 Frappe tests PASS, 7 dashboard tests PASS.
- **Product Analytics Specification & Privacy Policy**: Defined operational metrics MET-001 through MET-008, platform vs tenant data access boundaries, zero third-party trackers guarantee, and data retention/deletion rules in `docs/product/PRODUCT_ANALYTICS_SPECIFICATION.md`.
- **Commercial Feature Prioritization Matrix**: RICE + Risk scoring model evaluating 11 candidate features; clear evidence-based justification for implementing store profile, reorder export, and in-app support while deferring speculative voice/camera OCR features in `docs/product/COMMERCIAL_FEATURE_EVALUATION.md`.
- **Product Quality & Accessibility Audit**: WCAG 2.1 AA color contrast verification (7.42:1 on teal accent), keyboard-only checkout walkthrough, semantic ARIA labels, responsive layouts, and zero-PII telemetry in `docs/product/ACCESSIBILITY_AND_QUALITY_AUDIT.md`.
- **Customer Support & Self-Service Diagnostics**: Documented store owner troubleshooting runbooks for offline counter sync, thermal printer baud rates, and barcode scanners, alongside SLA targets in `docs/product/CUSTOMER_SUPPORT_AND_SELF_SERVICE.md`.
- **Repeatable Product Feedback Loop SOP**: 9-stage standard operating procedure from authorized intake to measured operational impact in `docs/product/PRODUCT_FEEDBACK_LOOP_SOP.md`.
- **Product Roadmap & Architecture Decision Record**: Near-term roadmap across Releases 0.2.0, 0.3.0, and 0.4.0, deferred ideas, ADR-012 through ADR-014, and risk register in `docs/product/PRODUCT_ROADMAP_AND_DECISION_RECORD.md`.

### Multi-Tenant SaaS Platform Phase 13 (Launch Blocker Closure & Independent Release Verification) — IMPLEMENTED 2026-10-27
- **Launch Blocker Register**: Comprehensive audit of 12 launch blockers across Technical, Operational, Legal, and Physical categories in `docs/launch/LAUNCH_BLOCKER_REGISTER.md`.
- **Payment Gateway Mode Guard & Fail-Closed Safety**: Added `validate_payment_gateway_mode()` in `billing.py`; prevents accidental configuration of live Razorpay keys, blocks live mode without explicit `RAZORPAY_KYC_VERIFIED=true`, rejects out-of-order `payment.failed` replays after established success, and implements automated subscription payment reconciliation; 15 backend tests PASS.
- **External Legal, Accounting & Tax Review Package**: Prepared review package for Chartered Accountant (SAC 998315 / 997331, Rule 46 invoice formats, 18% GST B2B treatment, Section 34 credit notes) and Legal Counsel (ToS, DPDPA 2023, 90-day retention vs 72-month GST statutory window, 99.9% uptime SLA) in `docs/launch/LEGAL_AND_TAX_REVIEW_PACKAGE.md`.
- **Production Ingress, DNS & Wildcard TLS Audit**: Evaluated Traefik v3 ingress routing, RFC 1123 normalization, trusted proxy CIDR filtering, tenant lifecycle gating, port isolation (zero public DB ports), and ACME DNS-01 Let's Encrypt templates in `docs/launch/PRODUCTION_INGRESS_AND_TLS_AUDIT.md`.
- **Independent Tenant Isolation & Financial Integrity Review**: Comprehensive audit certifying multi-tenant RBAC boundaries, Next.js edge middleware guards, POS offline transaction durability, idempotency claim locks, and strict adherence to ERPNext GL/SLE financial workflows without raw SQL writes in `docs/launch/TENANT_ISOLATION_AND_FINANCIAL_INTEGRITY.md`.
- **Backup & Disaster Recovery Audit**: Verified automated Task Scheduler daily backups, complete GZIP/TAR archives with SHA-256 hashes, and 21s scratch-site restore with 1:1 data parity; documented off-site cloud replication as an outstanding production blocker in `docs/launch/BACKUP_AND_RESTORE_AUDIT.md`.
- **Deployment Capacity Assessment**: Documented empirical performance benchmarks (68 req/s, 1.93ms DB latency, 3.26x sync speedup, 0 collisions) while strictly separating mathematical multi-store cost projections (50 shops at ₹50,400/mo) and untested assumptions in `docs/launch/DEPLOYMENT_CAPACITY_ASSESSMENT.md`.
- **Commercial Release Gates Matrix**: 20 release criteria evaluated across Technical (11 PASS), Operational (4 PASS, 1 BLOCKED, 1 NOT TESTED), Business (2 PASS, 4 BLOCKED), and Physical Validation (4 NOT TESTED) in `docs/launch/COMMERCIAL_RELEASE_GATES.md`.
- **Multi-Tier Release Decision**: Separate decisions issued for Local Technical Validation (GO), Staging Readiness (CONDITIONAL GO), Supervised Real-Shop Pilot (CONDITIONAL GO for 1–3 stores with documented limits), and Public Commercial Launch (NO-GO / BLOCKED pending external approvals) in `docs/launch/FINAL_RELEASE_DECISION.md`.

### Staging Deployment Readiness, Off-Site Backup Design & Operational Runbooks — IMPLEMENTED 2026-10-27 (Phase 15)
- **CI Node 20 Compatibility**: Fixed Windows POS CI test failure where `Promise.withResolvers` (ECMAScript 2024 / Node 22+) crashed in GitHub Actions Node 20 runners. Replaced with universal `new Promise` constructor in `apps/windows-pos/src/domain/sync-engine.test.ts`. All 80 POS tests PASS across Node 18, 20, 22, 24.
- **Provider-Independent Off-Site Backup Replication Tool**: Built `deployment/backup/replicate_offsite.py` with zero heavy SDK dependencies (pure Python + `requests`), supporting any S3-compatible object store (AWS S3, Cloudflare R2, MinIO, Backblaze B2, Ceph). Features AWS SigV4 streaming upload, AES256 server-side encryption header (`x-amz-server-side-encryption: AES256`), SHA-256 pre- and post-upload integrity verification, retry safety, credential masking, and configurable retention pruning. Comprehensive test suite in `tests/integration/test_replicate_offsite.py` (5 unit tests PASS) and verified CLI dry-run and SHA-256 integrity check against 12 local backup archives.
- **Disaster Recovery Scratch Site Restoration Drill**: Implemented non-destructive scratch restore rehearsal script `deployment/backup/test_restore_scratch.py`. Executed against the live container stack: created temporary site `scratch-phase15-restore.local` in 24.7s, restored full gzipped production database dump (`20261027_102247-frontend-database.sql.gz`, 1.7 MB) in **36.6 seconds** (RTO measured: 36.6s, well below the 15-minute SLA target), verified 1:1 database record parity (4 installed apps, 254 sales invoices, 545 catalog items, 353 POS sync logs, 2 subscriptions, 2 invoices), and cleanly dropped scratch site with zero impact on production `frontend` site.
- **Automated Staging Preflight Check Suite**: Updated `tests/integration/staging_preflight_check.mjs` with 25 automated assertion checks covering system prerequisites, Docker Compose topology, strict network isolation (0 public DB/Redis ports), Traefik v3 reverse proxy routing, and app health endpoints. All 25 checks PASS with 6 external cloud dependencies explicitly reported as BLOCKED.
- **Operational & Disaster Recovery Runbooks**: Authored 10 operational incident runbooks in `docs/operations/STAGING_AND_DR_INCIDENT_RUNBOOKS.md` covering full platform outage, routing failure, DB lock contention, Redis memory exhaustion, stuck tenant provisioning, webhook replay storm, off-site backup upload failure, secret exposure, failed migration rollback, and complete site disaster recovery.
- **Comprehensive Documentation**:
  - `docs/launch/STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md` — Host OS, sizing, secret management, Docker Compose validation, migration rollback, health endpoints.
  - `docs/launch/OFFSITE_BACKUP_AND_DR_SPECIFICATION.md` — Multi-cloud S3 architecture, SigV4, AES256, RTO/RPO metrics, and retention lifecycle.
### GitHub Actions Lint Failure, Backup Safety & Release Revalidation — RESOLVED & HARDENED 2026-10-27 (Phase 15A)
- **CI Lint Quality Gate Remediation**: Resolved 54 errors in `erpnext-app/departmental_store` under `ruff check departmental_store`. Cleaned unused imports (`F401`), unused local variables (`F841`), format specifiers (`UP031`), ambiguous variable names (`E741`), and dead code (`F821`). Command exits 0 with zero warnings. All 120 Frappe backend tests (`test_sales_api`, `test_provisioning_api`, `test_health_api`, `test_tenant_isolation`, `test_returns_api`, `test_catalog_api`, `test_settings_api`, `test_onboarding_api`, `test_billing_api`, `test_tenant_api`) PASS.
- **Off-Site S3 Replication Safety Hardening**:
  * Implemented strict validation for S3 bucket names, regions, prefix paths, and object keys in `deployment/backup/replicate_offsite.py`.
  * Path traversal attempts (`..`, `\`, null bytes) and invalid bucket names fail closed immediately.
  * Enforced mandatory HTTPS for all remote S3 endpoints (plain HTTP blocked unless `localhost` / `127.0.0.1`).
  * Distinguishes `UPLOAD_ACKNOWLEDGED` (HTTP 200 on PUT) from `REMOTE_VERIFIED` (post-upload HEAD probe verifies existence, byte count, and SHA-256 metadata).
  * Implemented safe retention pruning `evaluate_retention_pruning()`: guarantees newest backup set and minimum retained backups (at least 1) can NEVER be pruned.
  * Verified: 19 unit tests in `tests/integration/test_replicate_offsite.py` PASS; CLI dry-run and SHA-256 integrity verification verified against 12 local backup archives.
- **Enhanced Disaster Recovery Scratch Site Drill**:
  * Added site collision guard preventing accidental overwrite of existing sites or databases.
  * Validates application ping availability (`frappe.ping` -> `PONG`).
  * Validates financial ledger integrity (`gl_ledger_balanced: True` with 0.0 imbalance).
  * Validates tenant isolation in sync logs and 1:1 record parity.
  * Rehearsal completed in 127.6s with **70.59s RTO benchmark**; scratch site dropped cleanly.

5. **Live Payment Gateway Activation (Blocker for Live Billing)**: Production Razorpay Merchant account KYC, production webhook secret configuration.
6. **Legal & Tax Sign-Off (Blocker for Live Billing)**: Commercial approval of pricing tiers (Starter ₹1,499 / Growth ₹2,999 / Enterprise ₹4,999); legal counsel review of Terms of Service & refund policy; CA sign-off on SAC 998315 and operator GSTIN.
7. **Staging Domain Live Deployment**: Execute `docs/launch/STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md` once owner supplies staging domain and DNS credentials.
8. **Off-site backup cloud storage bucket**: Provide S3/R2 bucket credentials and activate scheduled cron for `deployment/backup/replicate_offsite.py`.
9. **Production SMTP / SMS Provider Configuration**: Configure production SendGrid/AWS SES credentials for live verification emails and SMS notifications.
10. **Mobile Physical Device Builds**: Generate Android APK via EAS / local Gradle, and configure iOS TestFlight build on macOS CI runner.

### Core Store Operations
3. **Accountant GST sign-off** → real GSTIN/HSN data; then evaluate e-invoicing/e-waybill.
5. **Physical printer + camera validation** when hardware arrives.
6. **Tamil voice assistant**: deterministic parser + transcript fixtures → Ctrl+Space + speech provider decision.
7. **Camera/OCR batch capture** per spec.
8. **k6 load test** + 20k-item catalog performance pass.


## Fresh-stack provisioning notes (for reproducibility)

- `bench pip` is bench-level, not site-level. App install order on a fresh stack:
  `bench pip install -e ./apps/departmental_store` → write full `sites/apps.txt` →
  `bench --site frontend install-app departmental_store` → `bench get-app india_compliance …
  --branch version-16` → `bench --site frontend install-app india_compliance` → migrate →
  run all `ensure_*` helpers → seeds. If `bench get-app`'s dir rename races, remove the
  orphaned duplicate dir and fix apps.txt before migrating (done once this session).
- After installing/updating apps inside the backend container, RESTART backend + queue workers +
  scheduler (long-lived processes don't re-read `.pth` files), then restart frontend so its
  nginx re-resolves the backend IP (`stop/start` of backend also re-runs the configurator —
  now safe with the merge fix).
- Seeding is idempotent; the guard (G-03) asserts catalog re-seed is a no-op.

## Rules reminders (from AGENTS.md — still binding)

- No direct DB writes; ERPNext lifecycle only. No force-push. No secrets in git
  (credentials: gitignored `docs/local-demo-credentials.md`). Demo barcodes are
  synthetic in-store range `20…`. Never claim unverified hardware/tax/accuracy results.
