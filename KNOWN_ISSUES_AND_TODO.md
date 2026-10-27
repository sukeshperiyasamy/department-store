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
3. **Live Payment Gateway Activation (Blocker for Live Billing)**: Production Razorpay Merchant account KYC, production webhook secret configuration.
4. **Legal & Tax Sign-Off (Blocker for Live Billing)**: Commercial approval of pricing tiers (Starter ₹1,499 / Growth ₹3,499 / Enterprise ₹9,999); legal counsel review of Terms of Service & refund policy; CA sign-off on SAC 998315 and operator GSTIN.
5. **Staging Domain Live Deployment**: Execute `docs/operations/STAGING_ACCEPTANCE_RUNBOOK.md` once owner supplies staging domain and DNS credentials.
6. **Mobile Physical Device Builds**: Generate Android APK via EAS / local Gradle, and configure iOS TestFlight build on macOS CI runner.

### Core Store Operations
3. **Accountant GST sign-off** → real GSTIN/HSN data; then evaluate e-invoicing/e-waybill.
5. **Physical printer + camera validation** when hardware arrives.
6. **Tamil voice assistant**: deterministic parser + transcript fixtures → Ctrl+Space + speech provider decision.
7. **Camera/OCR batch capture** per spec.
8. **Off-site backup replication** (rclone / external cold storage mirror).
9. **k6 load test** + 20k-item catalog performance pass.


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
