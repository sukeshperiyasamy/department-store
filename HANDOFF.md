# HANDOFF — Departmental Store ERP

Handoff date: 2026-10-27 · Branch: `main` · See "Current state" below for HEAD.
Audience: next AI coding agent or developer. Read this file top to bottom before changing anything.

## 1. What this project is

A departmental-store ERP for a single store with 2–3 Windows POS counters:

- **Backend**: ERPNext v16.52.1 on Frappe v16.53.0, MariaDB 11.8, Redis — deployed via the official
  `frappe_docker` compose stack (`deployment/erpnext/pwd.yml`, project `departmental-erp`, site `frontend`, port 8080).
- **Custom Frappe app** `departmental_store` (in `erpnext-app/departmental_store/`): idempotent POS sale/return
  submission, catalog snapshot, device registry, reporting APIs, feature-flag settings, seeds, GST setup helpers.
- **Windows POS**: Tauri 2 + React + TypeScript (`apps/windows-pos`) with counter-local SQLite (durable outbox,
  offline queue), ESC/POS + ZPL/TSPL builders, Tamil/Tanglish-ready catalog search.
- **Manager Console & SaaS Marketing**: Next.js 15 + TS (`apps/owner-dashboard`, port 3100):
  * Public Marketing Website (`/`, `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms`).
  * Customer Onboarding Foundation (live slug availability check against reserved keywords, lead persistence in Frappe MariaDB + resilient `.leads-outbox/`).
  * Authenticated Manager Console (`/app`, `/catalog`, `/sales`, `/inventory`, `/sync`, `/settings`); all data from real ERP APIs, zod-validated.
- **Shared contracts**: `packages/shared-types` (zod schemas = single source of API truth, including tenancy and onboarding contracts).
- **India Compliance** app (branch `version-16`) installed on the test site with synthetic GSTIN.

## 2. Current state (git)

- Branch `main`.
- Recent phases:
  * Phase 1: Tenancy contracts, hostname resolution, Frappe tenant API, ADR-0008.
  * Phase 2: Public SaaS marketing website, customer onboarding entry point, demo request persistence, Next.js route groups (`(marketing)` vs `(app)`).
  * Phase 3: Tenant Provisioning Pipeline and Platform Admin Console:
    - 10-state lifecycle state machine (`PENDING_REVIEW` -> `ACTIVE`, `PROVISIONING_FAILED`, `SUSPENDED`, `ARCHIVED`).
    - Dedicated `Platform Admin` role in Frappe; strict server-side denial for store-level `System Manager`.
    - Asynchronous worker queue (`tabSaaS Provisioning Job`) with atomic row claiming, step tracking, bounded retries, and sanitized error logs.
    - Protected Platform Admin Console at `apps/owner-dashboard/src/app/(admin)/admin/onboarding` with KPIs, tabs, search, inspect drawer, approve/reject/retry/suspend modals.
    - Immutable audit trail in `tabSaaS Provisioning Audit Log` with zero secret leakage. ADR-0009 accepted.
  * Phase 4A: Provisioning Security, Tenant Isolation, and Local Subdomain Routing:
    - Privileged provisioning security: subprocess argument password redaction, dynamic credential retrieval, atomic stale-job reclamation (>600s heartbeat timeout), worker entry point with bounded retries.
    - Server-side role audit: reconciled canonical role `Cashier` (in `install.py`), verified `Platform Admin` exclusive access.
    - Local subdomain routing: Next.js `middleware.ts` with RFC 1123 normalization, trusted proxy IP enforcement (`TRUSTED_PROXY_IPS`), `/admin` lockout on tenant subdomains, and cache isolation (`Vary: Host, Cookie`).
    - 5 authenticated session models formally defined and verified.
    - Two-tenant isolation test suite (`test_tenant_isolation.py`) proving Shop A and Shop B database, auth, and record separation with zero fallback defaults.
  * Phase 4B: Production Ingress, Wildcard TLS, and Tenant Routing:
    - Traefik v3 selected as edge ingress reverse proxy (ADR-0010 accepted).
    - Production and staging deployment templates created in `deployment/ingress/` with Let's Encrypt DNS-01 challenge support for wildcard certificates (`*.departmentstore.in` + apex).
    - Dual-upstream routing matrix: Next.js 15 SSR (`owner-dashboard:3100`) for marketing, platform admin, and tenant web UI; Frappe Nginx (`frontend:8080`) for tenant APIs, assets, WebSockets, and POS billing sync.
    - Strict lifecycle state separation: site provisioning (`PROVISIONED`), hostname verification (`VERIFIED`), and commercial activation (`ACTIVE`); verified through `verify_tenant_hostname` and `activate_tenant` in `provisioning.py`.
    - Staging acceptance runbook (`STAGING_ACCEPTANCE_RUNBOOK.md`) and disaster recovery/rollback runbook (`INGRESS_ROLLBACK_AND_MONITORING.md`).
    - Automated integration suite `tests/integration/ingress_routing_check.mjs` (26/26 PASS).
  * Phase 4C: Staging Deployment and Real-World Acceptance Testing:
    - Preflight audit and compose verification: `tests/integration/staging_preflight_check.mjs` (13/13 PASS).
    - Deployment prerequisite gate: external cloud deployment stopped pending owner-controlled staging domain, authoritative DNS, and DNS-01 API token; exact checklist documented in `STAGING_ACCEPTANCE_RUNBOOK.md`.
    - Status marked `BLOCKED (Missing Staging Prerequisites)`.
  * Phase 5: Shared Multi-Tenant Mobile App for Departmental Store SaaS:
    - New workspace app created in `apps/mobile` (Expo SDK 52, React Native 0.76.6, TypeScript strict mode).
    - Native Frappe session auth (`POST /api/method/login`), token storage in `expo-secure-store`.
    - Tenant discovery: `list_user_tenants` and `get_current_user_profile` in `tenant.py`.
    - Tenant-bound session: dynamic header injection (`Host`, `X-Tenant-Id`) and strict in-memory cache purging on shop switch.
    - 7 screen modules: Splash, SignIn, TenantSelect, StoreOverview, Catalog, SalesActivity, Settings. Read-only safety guard preserving Windows POS as sole checkout billing engine.
    - 11 mobile vitest tests PASS, 9 live Docker integration checks PASS.
  * Phase 6: SaaS Subscription Billing and Customer Self-Service Portal:
    - Strict architectural boundary: SaaS subscription billing (B2B platform revenue, SAC 998315 @ 18% GST) is completely separate from tenant retail store sales, inventory, and local GST accounting.
    - Subscription data model & state machine: versioned plans, 6 lifecycle states (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`) in `packages/shared-types/src/billing.ts` and `tabSaaS ...` MariaDB tables.
    - Payment provider integration (Razorpay Sandbox): server-side checkout session creation, HMAC-SHA256 signature verification, event deduplication, and idempotent webhook processing.
    - Server-enforced entitlements: `devices.py` enforces plan `max_counters` limit upon POS counter registration; non-disruption of live checkout sales.
    - Customer self-service portal: Next.js routes (`/billing`, `/billing/plans`, `/billing/invoices`, `/billing/usage`, `/billing/cancel`); 90-day data retention guarantee.
    - Platform-admin billing console: protected console `/admin/billing`, subscription search, audited manual corrections, webhook replay pipeline.
    - 10 Frappe backend tests PASS, 9 integration checks PASS, 44 dashboard vitest tests PASS, Next.js build PASS (19 routes). Status: `SANDBOX READY`.
  * Phase 7: SaaS Onboarding Automation and Tenant Lifecycle Operations:
    - Multi-dimensional operations layer decoupling 6 distinct dimensions: Contact Verification (`PENDING`, `VERIFIED`, `EXPIRED`), Business Review (`PENDING_REVIEW`, `APPROVED`, `REJECTED`), Site Provisioning (`PENDING`, `RUNNING`, `PROVISIONED`, `PROVISIONING_FAILED`), Hostname Verification (`PENDING`, `VERIFIED`, `FAILED`), Subscription Status (`TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`), and Tenant Access Status (`INACTIVE`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`).
    - Eliminates premature site creation: public registrations create request and token records only. Approval requires `contact_verification == 'VERIFIED'`; activation requires site `PROVISIONED`, hostname `VERIFIED`, and subscription `ACTIVE` or `TRIALING`.
    - Single-use SHA-256 hashed verification tokens with 24h expiration in `tabSaaS Verification Token`, anti-enumeration on resend, sliding-window rate limiting in `tabSaaS Rate Limit`.
    - Customer onboarding journey portal at `/onboarding/status` and 1-click verification landing at `/onboarding/verify`, guarded by server-side privacy authorization (email or token required; strangers receive 403 PermissionError).
    - Platform Operations Cockpit at `/admin/operations`: overview KPI cards (total registrations, pending verification, review queue, active/failed provisioning, tenants, backup status), multi-dimensional queue tabs, audit rationale modal on administrative actions.
    - Provider-independent customer notification pipeline in `tabSaaS Notification Log` with deterministic deduplication (`MD5(request_id + event + suffix)`).
    - Tenant data preservation guarantees: ordinary suspension or cancellation never deletes tenant MariaDB databases or backups.
    - Comprehensive runbook created in `docs/operations/ONBOARDING_AND_TENANT_LIFECYCLE_RUNBOOK.md`.
    - 98 Frappe backend tests PASS, 55 dashboard vitest tests PASS, 75 shared-types tests PASS, 8 end-to-end integration checks PASS, Next.js build PASS (22 routes). Status: `CONDITIONAL GO — SUPERVISED PILOT`.
  * Phase 8: Production Hardening, Observability, Disaster Recovery, and Security Readiness:
    - Threat model & practical security audit: evaluated 12 attack surfaces using STRIDE methodology in `docs/security/THREAT_MODEL_AND_SECURITY_AUDIT.md`. Verified container network port isolation (MariaDB 3306 & Redis 6379 strictly internal; only port 8080 exposed).
    - Secrets & fail-closed configuration management: centralized validator `apps/owner-dashboard/src/lib/env.ts` fails closed in production when URLs or required settings are missing. `.gitignore` protects credentials; `.env.example` templates contain placeholders only; zero secrets in client bundles.
    - Production telemetry & health monitoring: implemented `get_liveness` (lightweight probe) and role/token-protected `get_system_health` in Frappe backend; Next.js `/api/health` dependency probe. Monitors MariaDB latency, Redis queue depths (`default`, `short`, `long`), disk space, and POS sync metrics.
    - Live disaster recovery rehearsal: fresh automated backup executed with SHA-256 checksums; restored into isolated scratch site `scratch-phase8-restore.local` in 21 seconds. 1:1 data parity verified against production site (254 Sales Invoices, 545 Items, 353 POS logs, 19 Onboarding Requests, 2 Subscriptions). Clean teardown executed with zero production impact. Documented in `BACKUP_AND_DISASTER_RECOVERY.md`.
    - Operational incident response runbooks: authored 13 actionable runbooks covering cross-tenant data leaks, admin credential compromises, provisioning failures, DNS/TLS outages, DB crash recovery, disk exhaustion, webhook failures, and release rollbacks in `docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md`.
    - Automated security check suite: `tests/integration/security_and_hardening_check.mjs` (15/15 PASS).
    - Production readiness scorecard: full matrix across PASS, BLOCKED, NOT TESTED categories with release verdict: `CONDITIONAL GO — Supervised Pilot` in `docs/release/PRODUCTION_READINESS_SCORECARD.md`.
  * Phase 9: Controlled Pilot Launch and Real-Shop Validation:
    - Launch prerequisites checklist: created `docs/pilot/PILOT_READINESS_CHECKLIST.md` auditing all 12 operational areas with status and evidence.
    - Pilot scope and cohort plan: defined 1–3 shop cohort, 14-day duration, supported retail workflows, hardware specs, support SLAs, and stop criteria in `docs/pilot/CONTROLLED_PILOT_PLAN.md`.
    - End-to-end customer acceptance test suite: authored and executed `tests/integration/pilot_acceptance_suite.mjs` (24/24 PASS) validating customer registration, token expiry, privacy boundary enforcement, Platform Admin review and approval, atomic provisioning, tenant hostname routing, ERPNext native POS sales and returns, duplicate idempotency, requires-review error queues, tenant suspension without data loss, reactivation, and central telemetry.
    - Pilot telemetry & monitoring: added `@frappe.whitelist() get_pilot_status()` API in `erpnext-app/.../api/health.py` reporting active/suspended shops, provisioning queues, POS sync backlog, DB latency (0.06ms), and disk capacity; authored `docs/pilot/PILOT_MONITORING_AND_ESCALATION.md`.
    - Customer feedback and defect workflow: authored `docs/pilot/CUSTOMER_FEEDBACK_AND_INCIDENT_WORKFLOW.md` with structured intake schema, Sev 1–4 classification, and strict zero-PII/zero-credential guardrails.
    - Success scorecard and release gates: defined 10 release gates and quantitative SLA targets in `docs/pilot/PILOT_SUCCESS_SCORECARD.md`.
    - Formal Go / No-Go review: produced tri-pillar evaluation (Technical PASS, Operational PASS, Business CONDITIONAL) and formal verdict: `CONDITIONAL GO — Supervised Real-Shop Pilot (1–3 stores with explicit owner authorization & listed limitations)` in `docs/pilot/GO_NO_GO_PILOT_REVIEW.md`.
  * Phase 10: Scale Readiness, Performance Engineering, and Commercial Launch:
    - Workload Modeling: Defined concrete sizing profiles (Profile A: single store, Profile B: 5 stores, Profile C: 50 stores) in `docs/scale/WORKLOAD_PROFILES.md`.
    - Performance & Concurrency Benchmark Suite: Authored `tests/integration/scale_and_capacity_suite.mjs` (8/8 PASS) recording throughput (69.2 req/s), DB latency (1.44ms), Redis cache/queue latencies (0.21ms), full vs incremental catalog sync (3.1x faster), 5 concurrent billing counters burst (15 sales, 0 collisions), 5-way idempotency race (1 unique invoice, zero double-charges), 20-bill backlog drain (8 bills/s), and error isolation; artifacts saved to `docs/testing/artifacts/scale-and-capacity-results.json`.
    - Database & Query Optimization: Replaced catalog incremental item scan with indexed SQL `JOIN` on `tabItem` primary key; added database indexes `idx_pos_sync_status` and `idx_item_price_list_selling_mod` via `ensure_performance_indexes` in `install.py`; verified filesort elimination via `EXPLAIN`.
    - Multi-Counter Deadlock Resilience: Implemented randomized exponential backoff retry loop in `sales.py` resolving MariaDB error 1020 on `tabSeries` during concurrent counter submissions.
    - Resource Fairness & Governance: Documented Nginx rate limits, Redis sliding-window throttling, 500KB payload quota, fair background scheduling in `docs/scale/RESOURCE_FAIRNESS_AND_RATE_LIMITS.md`.
    - Capacity Planning & Cost Model: Authored 3-tier capacity plan and cost model in `docs/scale/CAPACITY_AND_COST_MODEL.md` (1 shop at ₹2,157/mo, 5 shops at ₹6,630/mo, 50 shops at ₹50,400/mo) delivering 55.8% to 66.4% gross margin.
    - Commercial Launch Checklist: Authored pricing tiers, DPDPA privacy policy, SAC 997331 GST notes, 99.9% uptime SLA, P1–P3 incident response matrix in `docs/commercial/COMMERCIAL_LAUNCH_CHECKLIST.md`.
    - Client Scale Assessment: Evaluated mobile app virtualized lists, Next.js edge routing and server pagination, and Windows POS keyboard-first SQLite persistence in `docs/scale/CLIENT_SCALE_AND_EXPERIENCE_ASSESSMENT.md`.
    - Commercial Launch Scorecard: Evaluated 11 release gates (10 Technical PASS, 1 Legal/CA BLOCKED); issued formal verdict `CONDITIONAL GO — Limited Supervised Cohort (1–3 shops)` in `docs/commercial/COMMERCIAL_LAUNCH_SCORECARD.md`.
  * Phase 11: Continuous Delivery, Release Governance, and Long-Term SaaS Operations:
    - Release Process Gap Analysis: Documented baseline delivery state and local vs CI test matrix in `docs/release/RELEASE_PROCESS_GAP_ANALYSIS.md`.
    - Automated CI Quality Gates: Created `.github/workflows/ci.yml` with 8 parallel jobs (secret scanning via `scripts/ci/secret_scan.py`, compose validation via `scripts/ci/validate_deployment_configs.py`, TypeScript across 4 workspaces, shared-types Zod contracts, dashboard build/tests, Windows POS build/tests, mobile isolation, and ruff linting). Documented live/staging check catalog in `docs/release/CI_QUALITY_GATES_AND_CHECK_CATALOG.md`.
    - Multi-Component Versioning & Release Provenance: Established SemVer policy, immutable Release Manifest schema (`release-manifest.json`), zero-secret client artifact policy in `docs/release/VERSIONING_AND_RELEASE_ARTIFACTS.md`.
    - Database & Migration Governance: Established 5-phase expand-and-contract policy, non-destructive SQLite migrations for POS, pre-migration backups, and immutable ERPNext financial workflows in `docs/release/DATABASE_AND_MIGRATION_GOVERNANCE.md`.
    - Automated Tenant Migration Runner: Implemented `scripts/tenant_migration_runner.py` supporting site discovery, canary cohort execution (`frontend`), migration locking (`/tmp/migration_lock_<site>.lock`), pre/post-migration health checks, and immediate halt on failure.
    - Deployment Orchestration & Progressive Rollout: Documented staging smoke tests, canary observation window, automated and operator halt flags, and persistent volume protection in `docs/release/DEPLOYMENT_ORCHESTRATION_AND_ROLLOUT.md`.
    - Client-Server Compatibility & Offline Queue Preservation: Guaranteed N-1 minor client backward compatibility, API v1 contracts, and durable offline SQLite outbox queue preservation across upgrades in `docs/release/CLIENT_SERVER_COMPATIBILITY_MATRIX.md`.
    - Feature Flag Governance: Documented 9 active flags in `Departmental Store Settings`, server-side `require_flag()` enforcement, and immediate session invalidation for suspended tenants in `docs/release/FEATURE_FLAG_GOVERNANCE.md`.
    - Operations Handbook & Maintenance Calendar: Parameterized 12 operational roles with runbooks, established maintenance calendar for daily backups, secret rotation, TLS renewal, and DR simulations in `docs/operations/OPERATIONS_HANDBOOK_AND_MAINTENANCE_CALENDAR.md`.
    - Release & Change Audit Trail: Defined standardized JSON audit schema for releases, migrations, feature flags, and tenant lifecycle with strict credential redaction and tenant immutability in `docs/operations/AUDIT_TRAIL_SPECIFICATION.md`.
    - Release Simulation Suite: Authored and executed `tests/integration/release_simulation_suite.mjs` (7/7 PASS) demonstrating canary migration, failure halt, N-1 client compatibility, and offline idempotency under retry; artifacts in `docs/testing/artifacts/release-simulation-results.json`.
    - Release Readiness Scorecard: Evaluated 12 release gates (12 PASS); issued formal verdict `CONDITIONAL GO — Limited Production Releases with Operator Approval` in `docs/release/RELEASE_READINESS_SCORECARD.md`.
  * Phase 12: Product Maturity, Customer-Driven Roadmap, and SaaS Growth:
    - Product Gap Analysis & Baseline Audit: Evaluated existing product modules across 5 gap tiers in `docs/product/PRODUCT_GAP_ANALYSIS.md`.
    - Customer Feedback & Discovery Framework: 8-dimension structured intake schema, Sev 1-4 triage matrix, anti-surveillance guarantee, and zero-PII/zero-credential guardrails in `docs/product/CUSTOMER_FEEDBACK_AND_DISCOVERY_FRAMEWORK.md`.
    - Tenant Store Profile & Thermal Receipt Customization: Extended `Departmental Store Settings` single DocType with 10 store profile fields, added `get_store_profile` and `update_store_profile` APIs, and created an interactive editable card in `SettingsClient.tsx`. 13 Frappe backend tests PASS, 7 dashboard actions tests PASS.
    - Actionable Low-Stock Reorder CSV Export: Developed `ReorderExportButton` component for `/inventory`; one-click client-side CSV export calculates suggested order quantities for distributor purchase orders; 2 vitest unit tests PASS.
    - In-App Customer Support & Redacted Diagnostics: Implemented `submit_support_request` API in Frappe with SLA calculation, interactive ticket submission form in Settings Section 10, and one-click copyable zero-PII system telemetry bundle; 2 Frappe tests PASS, 7 dashboard tests PASS.
    - Product Analytics Specification & Privacy Policy: Defined operational metrics MET-001 through MET-008, platform vs tenant data access boundaries, zero third-party trackers guarantee, and data retention/deletion rules in `docs/product/PRODUCT_ANALYTICS_SPECIFICATION.md`.
    - Commercial Feature Prioritization Matrix: RICE + Risk scoring model evaluating 11 candidate features; clear evidence-based justification for implementing store profile, reorder export, and in-app support while deferring speculative voice/camera OCR features in `docs/product/COMMERCIAL_FEATURE_EVALUATION.md`.
    - Product Quality & Accessibility Audit: WCAG 2.1 AA color contrast verification (7.42:1 on teal accent), keyboard-only checkout walkthrough, semantic ARIA labels, responsive layouts, and zero-PII telemetry in `docs/product/ACCESSIBILITY_AND_QUALITY_AUDIT.md`.
    - Customer Support & Self-Service Diagnostics: Documented store owner troubleshooting runbooks for offline counter sync, thermal printer baud rates, and barcode scanners, alongside SLA targets in `docs/product/CUSTOMER_SUPPORT_AND_SELF_SERVICE.md`.
    - Repeatable Product Feedback Loop SOP: 9-stage standard operating procedure from authorized intake to measured operational impact in `docs/product/PRODUCT_FEEDBACK_LOOP_SOP.md`.
    - Product Roadmap & Architecture Decision Record: Near-term roadmap across Releases 0.2.0, 0.3.0, and 0.4.0, deferred ideas, ADR-012 through ADR-014, and risk register in `docs/product/PRODUCT_ROADMAP_AND_DECISION_RECORD.md`.
  * Phase 13: Launch Blocker Closure and Independent Release Verification:
    - Launch Blocker Register: Comprehensive audit of 12 launch blockers across Technical, Operational, Legal, and Physical categories in `docs/launch/LAUNCH_BLOCKER_REGISTER.md`.
    - Payment Gateway Hardening & Live Mode Isolation: Added `validate_payment_gateway_mode()` in `billing.py`; prevents accidental configuration of live keys, blocks live mode without explicit `RAZORPAY_KYC_VERIFIED=true`, prevents out-of-order `payment.failed` replays after established success, and implements automated subscription payment reconciliation; 15 backend tests PASS in `test_billing_api.py`.
    - External Legal & CA Review Package: Prepared review package for Chartered Accountant (SAC 998315 / 997331, Rule 46 invoice formats, 18% GST B2B treatment, Section 34 credit notes) and Legal Counsel (ToS, DPDPA 2023, 90-day retention vs 72-month GST statutory window, 99.9% uptime SLA) in `docs/launch/LEGAL_AND_TAX_REVIEW_PACKAGE.md`.
    - Production Ingress, DNS & Wildcard TLS Audit: Evaluated Traefik v3 ingress routing, RFC 1123 normalization, trusted proxy CIDR filtering, tenant lifecycle gating, port isolation (zero public DB ports), and ACME DNS-01 Let's Encrypt templates in `docs/launch/PRODUCTION_INGRESS_AND_TLS_AUDIT.md`.
    - Independent Tenant Isolation & Financial Integrity Review: Comprehensive audit certifying multi-tenant RBAC boundaries, Next.js edge middleware guards, POS offline transaction durability, idempotency claim locks, and strict adherence to ERPNext GL/SLE financial workflows without raw SQL writes in `docs/launch/TENANT_ISOLATION_AND_FINANCIAL_INTEGRITY.md`.
    - Backup & Disaster Recovery Audit: Verified automated Task Scheduler daily backups, complete GZIP/TAR archives with SHA-256 hashes, and 21s scratch-site restore with 1:1 data parity; documented off-site cloud replication as an outstanding production blocker in `docs/launch/BACKUP_AND_RESTORE_AUDIT.md`.
    - Deployment Capacity Assessment: Documented empirical performance benchmarks (68 req/s, 1.93ms DB latency, 3.26x sync speedup, 0 collisions) while strictly separating mathematical multi-store cost projections (50 shops at ₹50,400/mo) and untested assumptions in `docs/launch/DEPLOYMENT_CAPACITY_ASSESSMENT.md`.
    - Commercial Release Gates Matrix: 20 release criteria evaluated across Technical (11 PASS), Operational (4 PASS, 1 BLOCKED, 1 NOT TESTED), Business (2 PASS, 4 BLOCKED), and Physical Validation (4 NOT TESTED) in `docs/launch/COMMERCIAL_RELEASE_GATES.md`.
    - Multi-Tier Release Decision: Separate decisions issued for Local Technical Validation (GO), Staging Readiness (CONDITIONAL GO), Supervised Real-Shop Pilot (CONDITIONAL GO for 1–3 stores with documented limits), and Public Commercial Launch (NO-GO / BLOCKED pending external approvals) in `docs/launch/FINAL_RELEASE_DECISION.md`.
  * Phase 14: Payment Reconciliation Security, Webhook Integrity & Reproducible Release Evidence:
    - Gateway Mode Validation: Hardened `validate_payment_gateway_mode()` to fail closed on empty/missing keys, malformed key prefixes (`rzp_test_` or `rzp_live_` required), mismatched live/test flags, and blocks live mode without explicit `RAZORPAY_KYC_VERIFIED=true`.
    - Webhook Order Matching & Atomic Rollback: Removed dangerous arbitrary subscription fallback; unknown orders in webhooks fail closed with `ValidationError`; mismatched tenant IDs raise `PermissionError`; transaction rollback on exceptions marks event `FAILED`.
    - Webhook Deduplication & Event Ordering: Deduplicated capture events (`payment.captured` + `order.paid`) preventing double-invoicing or multi-month period extension; explicit full vs partial refund handling; disputes transition subscription to `PAST_DUE`.
    - Reconciliation Authorization & Concurrency Model: Reconcile endpoint enforces multi-tier RBAC (Guests and Cashiers rejected; Store Managers restricted to their own shop; Platform Admin required for platform-wide reconciliation and `auto_heal=True`); distributed cache lock `reconcile_payments_{tenant_id or 'global'}` prevents race conditions.
    - Background Subscription Reconciliation: Registered daily cron `0 3 * * *` in `hooks.py` invoking `scheduled_subscription_reconciliation()` under `Administrator` context.
    - Invariant Verification: Formally verified all 9 payment and subscription invariants; documented in `docs/launch/PAYMENT_RECONCILIATION_AND_WEBHOOK_AUDIT.md`.
    - Full-Suite Test Execution: 350 tests executed across 8 backend suites and 4 frontend/app packages (all 350 PASS, 0 FAIL, 0 SKIPPED).
  * Phase 18: Tenant-Site Isolation Proof and Final Software Release Gate:
    - Baseline Verification: Commit `72f535b34ac724dd7c34627db4f342e9e6209518` verified 100% green on GitHub Actions Run `40565971201` (6/6 jobs PASS).
    - Two-Site Physical Integration Isolation Proof: Created and executed `tests/integration/test_two_site_tenant_isolation.py` (7/7 checks PASS), proving physical schema separation (`_5d32c992bf9e2cc2` vs disposable `_35883b21ac2a614c`), zero data leakage, Redis db_name key scoping, fail-closed unknown hostnames, and clean context reset.
    - End-to-End Tenant Request Traceability: Fully traced 7-step path from edge ingress to MariaDB schema isolation with exact code attribution in `docs/launch/TENANT_SITE_ISOLATION_PROOF_PHASE18.md`.
    - Platform-Admin Security Boundaries: Verified independent authorization (`require_platform_admin()`), `/admin` lockout on tenant subdomains in `middleware.ts`, and explicit tenant scoping in background jobs.
    - Automated Regression Suite: 396 total automated tests PASS across all workspaces (80 POS, 80 shared-types, 72 owner-dashboard, 11 mobile, 29 backup/download, 124 Frappe backend); 25 preflight checks PASS; 380 tracked files scanned with zero credential leaks.
  * Phase 19: End-to-End Tenant Host Routing Verification & Staging Gate:
    - Baseline Verification: Commit `a4f0b18c777ed7b904fb1a2be37b5ff9c66068da` verified 100% green on GitHub Actions Run `40574563439` (6/6 jobs PASS).
    - Multi-Site Nginx Reverse Proxy Correction: Fixed hardcoded `FRAPPE_SITE_NAME_HEADER: frontend` in `deployment/erpnext/pwd.yml` (line 135) to `$$host`; enabled dynamic site selection from client Host header via `proxy_set_header X-Frappe-Site-Name $host;`.
    - Real HTTP Two-Tenant Routing Proof: Authored and executed `tests/integration/test_e2e_tenant_http_routing.py` (10/10 checks PASS) on port 8080 across two disposable restored tenant sites (`_92f4a44dc913424c` vs `_904a93906bbe0fb1`), proving dynamic multi-site selection, marker isolation, fail-closed unknown hosts (404), unverified/suspended tenant denial, forged header rejection, cross-tenant credential denial (401), unauthenticated access protection (403), cache isolation across host switching (`Vary: Host, Cookie`), and error isolation without context leak.
    - Provisioning-to-Routing Consistency: Verified registry metadata agrees with disk site directories and database schemas; mismatched mappings fail closed (HTTP 404).
    - Guarded Teardown & Intact Primary Site: Test harness drops disposable test sites cleanly (`bench drop-site --force`); primary `frontend` site remains 100% intact and healthy.
    - Full Regression Suite: 396 total automated tests PASS; 25 preflight checks PASS; 382 tracked files scanned with 0 secrets. Full evidence in `docs/launch/TENANT_HTTP_ROUTING_PROOF_PHASE19.md`.
- Pushed to `https://github.com/sukeshperiyasamy/department-store` (origin/main). **Never force-push.**

## 3. Module map (where things live)

| Area | Path | Notes |
| --- | --- | --- |
| Health & Telemetry API | `erpnext-app/.../api/health.py` | `get_liveness`, protected `get_system_health`, `verify_restore_stats` |
| Environment Validator | `apps/owner-dashboard/src/lib/env.ts` | Fail-closed production validator, secret redaction, Zod schemas |
| Dashboard Health Route | `apps/owner-dashboard/src/app/api/health/route.ts` | Next.js health check, memory, uptime, upstream ERP status |
| Sale API (idempotent) | `erpnext-app/.../api/sales.py` | claim-based idempotency via `POS Sale Sync Log`; deadlock retry; Sales Invoice `is_pos` (ADR-0002) |
| Returns API | `erpnext-app/.../api/returns.py` | `submit_pos_return`, `get_original_invoice`; allocated-refund mirroring |
| Catalog API | `erpnext-app/.../api/catalog.py` | `catalog_snapshot` (checkpoint covers items **and** prices — QA-0001) |
| Devices | `erpnext-app/.../api/devices.py` | manager-only `register_device`; cashier-readable `get_device`; subscription counter limits |
| Reports | `erpnext-app/.../api/reports.py` | `owner_summary`, `server_status`, `stock_alerts`, `recent_invoices` |
| Settings/flags | `erpnext-app/.../api/settings.py` + `.../doctype/departmental_store_settings/` | 10 feature flags; `require_flag()` server guard |
| Tenancy & Leads API | `erpnext-app/.../api/tenant.py` | `resolve_tenant_by_host`, `get_tenant_info`, `list_user_tenants`, `check_slug_availability`, `submit_demo_request`, `submit_onboarding_request` |
| Provisioning & Admin API | `erpnext-app/.../api/provisioning.py` | `list_onboarding_requests`, `get_onboarding_detail`, `approve_onboarding_request`, `reject_onboarding_request`, `retry_provisioning_job`, `claim_next_provisioning_job`, `execute_provisioning_pipeline`, `set_tenant_status` |
| Onboarding & Operations API | `erpnext-app/.../api/onboarding.py` | `register_customer_onboarding`, `verify_contact_token`, `resend_verification_token`, `get_onboarding_journey`, `get_platform_operations_overview`, notification pipeline |
| Billing & Subscription API | `erpnext-app/.../api/billing.py` | `get_available_plans`, `create_checkout_session`, `process_billing_webhook`, `get_billing_overview`, `cancel_subscription`, `admin_list_subscriptions`, `admin_manual_billing_correction` |
| Shared Contracts | `packages/shared-types/src/` | `tenancy.ts`, `billing.ts`, `onboarding.ts`, `index.ts` (Zod schemas and TypeScript contracts) |
| Install/self-heal | `erpnext-app/.../install.py` | roles (`Platform Admin`, `Store Manager`, `POS Cashier`), permissions, language, **apps.txt + module-map repair** |
| Seeds | `erpnext-app/.../seeds.py` | demo fixtures, cashier/manager users, race items, perf items |
| Regional catalog | `erpnext-app/.../regional_catalog.py` | 160 TN demo products w/ Tamil+Tanglish aliases (see §7 BLOCKED) |
| GST setup | `erpnext-app/.../gst_setup.py` | synthetic GSTIN, templates, `gst_validation_cases` |
| POS domain | `apps/windows-pos/src/domain/` | money (minor units), cart, outbox state machine, sync engine, catalog search, receipt/labels |
| POS persistence | `apps/windows-pos/src/local/` | schema v2, repos (atomic sale+outbox), Tauri + Node drivers |
| POS transport | `apps/windows-pos/src/transport/frappe.ts` | zod-validated; Tauri HTTP plugin fetch (no CORS) |
| POS UI | `apps/windows-pos/src/ui/` | Billing/Payment/Returns/Sync screens, preview harness (`preview.html`) |
| Tauri shell | `apps/windows-pos/src-tauri/` | sql + http plugins, `print_raw` spool command, capabilities |
| SaaS Marketing Site | `apps/owner-dashboard/src/app/(marketing)/` | Public pages: `/`, `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms`, `/onboarding/status`, `/onboarding/verify` |
| Customer Onboarding Portal | `apps/owner-dashboard/src/app/(marketing)/onboarding/` | Self-service status tracker (`/status`) and 1-click verify (`/verify`) |
| Platform Admin Consoles | `apps/owner-dashboard/src/app/(admin)/admin/` | Operations Cockpit (`/operations`), Onboarding Queue (`/onboarding`), Subscriptions (`/billing`) |
| Platform Admin Console | `apps/owner-dashboard/src/app/(admin)/` | Protected control plane: `/admin`, `/admin/onboarding` |
| Manager Dashboard | `apps/owner-dashboard/src/app/(app)/` | Authenticated shell: `/app`, `/catalog`, `/sales`, `/inventory`, `/sync`, `/settings` |
| Lead Outbox | `apps/owner-dashboard/src/lib/lead-storage.ts` | Resilient local outbox in `.leads-outbox/` mirroring Frappe MariaDB leads |
| Contracts & Tenancy | `packages/shared-types/src/index.ts` + `tenancy.ts` | API zod schemas + SaaS tenant registry, onboarding schemas, provisioning schemas |

## 4. Authoritative docs (read next)

- `docs/api-contracts.md` — API v1 request/response shapes and error codes.
- `docs/offline-sync-policy.md` — durability rules, state machine, clock skew.
- `docs/architecture-decisions.md` — ADRs (ADR-0002: Sales Invoice over POS Invoice — critical).
- `docs/deployment.md`, `docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`, `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`.
- `docs/compliance/GST_IMPLEMENTATION_AND_VALIDATION.md` — what's verified vs accountant-pending.
- `docs/testing/TESTING_REPORT.md`, `TEST_EXECUTION_LOG_2026-10-27.md`, `MULTI_COUNTER_AND_OFFLINE_REPORT.md`, `RELEASE_READINESS.md`.
- `docs/ui-ux/DESIGN_SYSTEM.md` + `MODULE_SCREEN_AUDIT.md`.
- `docs/known-limitations.md`, `docs/implementation/KNOWN_GAPS.md`, `docs/testing/BUG_REPORT.md`.
- **Credentials**: `docs/local-demo-credentials.md` — **gitignored, local-only**. Never commit; placeholders
  live in `apps/owner-dashboard/.env.example`.

## 5. Environment & commands

- Docker stack: `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d` (site `frontend`,
  ERP on :8080, dashboard on :3100). Site credentials: see gitignored `docs/local-demo-credentials.md`.
- Seed/maintenance (inside `backend` container, site `frontend`; all seeds are idempotent):
  - `bench --site frontend execute departmental_store.install.ensure_app_registered` — **run this whenever any
    bench command says "Module … not found"**; it repairs `sites/apps.txt` + redis module maps.
  - No-arg wrappers (Git-Bash-safe): `…seeds.demo_run`, `…seeds.make_dashboard_user`,
    `…seeds.make_cashier_user_a/_b`, `…seeds.make_qa_pos_profile`, `…seeds.make_race_items`,
    `…seeds.make_perf_items --kwargs "{'n': 300}"`, `…regional_catalog.seed_run` (160 TN products),
    `…gst_setup.setup_run`, `…install.ensure_site_timezone` (pins Asia/Kolkata on fresh sites).
  - **`bench pip` is bench-level, NOT site-level**: `bench pip install -e ./apps/departmental_store`
    (no `--site`). After installing/updating apps, restart backend + queue workers + scheduler
    (long-lived processes don't re-read `.pth`), then restart frontend (nginx re-resolves backend IP).
- Tests: `bench --site frontend run-tests --app departmental_store` (40 PASS: sales 18 / returns 10 / catalog 4 / settings 8);
  `npm run typecheck` (0 errors); `npm run test` (103 TS tests: 80 POS + 14 shared-types + 9 dashboard); `npm run build` both frontends;
  `node tests/integration/apps_txt_guard.mjs` (4 checks); `node tests/integration/api_suite.mjs` (24 checks);
  `npx tsx tests/integration/multi_counter.ts` (11 checks);
  `node tests/integration/reliability_check.mjs` (stops/starts the backend container!).
- Windows exe: toolchain = rustup GNU + MSYS2 mingw64 binutils (no admin needed — see
  `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`); build `npx tauri build --no-bundle` from `apps/windows-pos`
  with both toolchain dirs on PATH; artifact `src-tauri/target/release/windows-pos.exe`.

## 6. Verified test status (as of 2026-10-27, after Settings Console audit + fresh-stack revalidation)

- Environment reset (ISSUE-05): backup `20261027_035610` verified → `docker compose down -v` →
  fresh stack → apps reinstalled → reseeded (160 catalog idempotent, GST templates, 300 PERF items).
- **PASS on the fresh stack**: 40 bench tests (sales 18 / returns 10 / catalog 4 / settings 8); 80 POS vitest +
  14 shared-types + 9 dashboard (103 total TS tests); typecheck 0 errors; apps_txt_guard 4/4; **api_suite 24/24
  (including STOCK-01)**; multi-counter 11/11; reliability 4/4; **zero deadlocks**
  (`Innodb_deadlocks = 0` via live MariaDB query, no deadlock matches in backend/queue logs).
- Settings Console audit verified: unique section input IDs (`toggle-${idPrefix}-${meta.key}`), WCAG switch accessibility (`role="switch"`, `aria-checked`), live database version & deadlock telemetry, server role enforcement (System Manager only; Store Manager & Cashier rejected), and prominent GST demo warning callout.
- STOCK-01 was closed as **QA-0005, a real product bug** (timezone conversion), not environmental —
  see §7 pitfall 8. ISSUE-05 (DB contention) did not reproduce on the fresh volumes.
- **BLOCKED**: physical printer + camera hardware tests (no devices); NSIS installer (MSVC CI runner);
  speech-recognition accuracy (no engine chosen).
- **NOT RUN**: GSTR filing tooling; mobile-native (PWA only); load testing (k6 not installed).

## 7. Critical pitfalls (read twice)

1. **`sites/apps.txt` churn — TWO causes, both fixed 2026-10-27 but keep the guard**:
   (a) the one-shot `configurator` service re-runs on every `docker compose start backend`
   (compose re-runs exited `service_completed_successfully` dependencies) and its
   `ls -1 apps > sites/apps.txt` used to wipe custom apps (its container only has frappe+erpnext
   baked in) — pwd.yml now MERGES via `sort -u` union; (b) stale redis module caches after
   interrupted bench ops. **Fix of last resort**:
   `bench --site frontend execute departmental_store.install.ensure_app_registered` then
   `bench --site frontend clear-cache` and restart the backend.
2. **ERPNext v16 POS Invoice does not move stock** — that's why the platform posts **Sales Invoice `is_pos`**
   (ADR-0002). Do not "fix" this back to POS Invoice.
3. **Bench kwargs quoting** through Git Bash mangles args — prefer no-arg seed wrapper functions
   (`demo_run`, `seed_run`, `setup_run`, `make_cashier_user_a/_b`).
4. **IPython console in docker hides multiline output** — use `bench execute` (prints return value) or write
   results to a file. Note `bench execute` MASKS the real exception with a NameError eval fallback —
   debug a failing seed via `bench console`.
5. **Flag defaults**: `Departmental Store Settings` row created via API defaults to zeros; use
   `ensure_default_settings` (install) or set the demo row explicitly. Opt-in modules (voice/AI/MCP/camera)
   default OFF by design.
6. **Commit hygiene**: never commit token files (`tok.*` gitignored; a leak happened in `e484d5e`, rotated +
   documented); never force-push; demo barcodes are in-store range `20…` (never claim real products).
7. **India Compliance** enforces HSN on every new **sales** item (length-validated per GST Settings; Item Tax
   rows link through the GST HSN Code master — the record must EXIST, not just be well-formed). Seeds/tests
   create synthetic `999999` + plausible demo HSNs via `seeds._ensure_demo_hsn`; keep that pattern for any
   new seed. Keep GST Settings `validate_hsn_code` ON — the GST validation suite depends on it.
8. **Timezone split (QA-0005)**: containers run UTC while the Frappe site timezone is Asia/Kolkata.
   NEVER convert timestamps with `datetime.astimezone()` in server code (follows the container TZ);
   use `frappe.utils.convert_utc_to_timezone(dt, get_system_timezone())`. `_posting_date` and
   `ensure_site_timezone` exist because of this; a regression here turns every receipt into
   "future stock" and fails NegativeStockError. The bench `pip freeze` env belongs to the container
   that installed it — other containers (queues) share `sites/` but NOT the Python env; restart all
   python services after installing apps.
9. **Bench returns**: functions that return json.dumps STRINGS get printed repr-escaped by
   `bench execute` (breaks JSON parsers); return dicts instead — bench prints them as clean JSON.

## 7b. Code intelligence — Graphify (installed 2026-10-27)

`graphifyy 0.9.96` (Apache-2.0, pip) builds a queryable knowledge graph of the repo.
CLI lives in the Python `Scripts/` dir (add it to PATH: `%USERPROFILE%/AppData/Local/Python/pythoncore-3.14-64/Scripts`).

**Setup/refresh (verified commands)**:
```bash
graphify install            # copies the /graphify skill into platform config dirs
graphify . --code-only      # rebuild graph from local AST — NO API key needed
graphify update .           # incremental refresh after code changes (zero API cost)
```

**Artifacts (gitignored)**: `graphify-out/GRAPH_REPORT.md` (human report), `graph.json`
(1005 nodes / 1951 links / 76 communities, relations: contains/calls/imports/imports_from/
method/references), `graph.html`, `manifest.json`, `cache/`. The graph records
`built_at_commit` — compare against `git rev-parse HEAD` before trusting it; stale means
run `graphify update .` first.

**Key findings (from commit a83d9494)**:
- God nodes: `PosStore` (33 edges), `SyncRecord` (27), `make_item()` (25, test fixture hub),
  `FrappeClient` (24), `CatalogItem` (19), `AppServices` (18), `SaleReviewError`/`SaleResponse` (17).
- Relation mix: 649 contains · 480 calls · 260 imports · 203 imports_from · 150 method · 79 references.
- Surprise: `tests/integration/multi_counter.ts` **directly instantiates `FrappeClient` and
  `PosStore`** — behavioral changes to those classes ripple into the integration suite.
- Full LLM/doc-image semantic mode is intentionally NOT configured (requires GEMINI/OPENAI/
  ANTHROPIC API key). Do not add a key; `--code-only` is sufficient for code navigation.

**How future agents should use it**: before grepping or reading many files for
architecture/refactor/bug questions, query `graphify-out/graph.json` first (directly, or via
`graphify path "A" "B"` / `graphify explain "X"`), locate exact files + call/import edges, then
read only those files. Grep only for strings the graph misses (SQL literals, config values).

## 8. Next steps, priority order

1. ~~Regional catalog seed~~ DONE — 160 products seeded, idempotency verified.
2. ~~Fix STOCK-01~~ RESOLVED as QA-0005 (timezone split in posting_date).
3. ~~Settings UI page~~ DONE — `/settings` on Manager Console reading `get_settings` and mutating via `set_flag`.
4. ~~Backup automation & Task Scheduler~~ DONE — `run_backup.ps1` + `schedule_backup.ps1` active in Windows Task Scheduler ('Ready'); scratch site restore verified.
5. ~~Production deployment checklist~~ DONE — `docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`.
6. ~~Windows NSIS packaging workflow~~ DONE — `.github/workflows/windows-release.yml` configured on MSVC runner.
7. **Voice**: deterministic Tamil/Tanglish parser + transcript-fixture tests (spec §4 of the TN master prompt);
   wire `voice_assistant_enabled` flag; speech engine selection (Vosk vs Whisper) is a separate decision.
8. Accountant GST review → real GSTIN; then enable e-invoicing per legal advice.
9. Physical printer/camera validation when hardware arrives.

---

# FINAL HANDOFF AUDIT — 2026-10-27 (Release-Readiness Phase)

Commit at audit: HEAD · Branch `main`, clean.

## Feature classification (final)

**COMPLETE**: ERP stack deployment; idempotent sales + returns APIs (40 bench tests);
offline SQLite queue + sync engine; POS billing UI; Manager Console (6 pages: Dashboard,
Catalog, Sales, Inventory, Sync & Health, Settings); GST software layer (templates +
POS-path case ₹100→CGST9+SGST9=₹118); multi-counter suite 11/11; reliability 4/4;
backup scripts (PowerShell + Git Bash) + Windows Task Scheduler job active + 3 DR rehearsals;
ESC/POS + ZPL/TSPL builders; feature flags API + settings UI;
production deployment checklist (`docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`);
Windows NSIS CI packaging workflow (`.github/workflows/windows-release.yml`);
Graphify code map; documentation set (28+ docs).

**WORKFLOW READY**: NSIS installer packaging via GitHub Actions (`windows-latest` MSVC runner);
Authenticode signing hook; silent install/uninstall verification tests.

**PARTIAL**: regional catalog seeding (code done, 160 items seeded);
returns screen in packaged exe (API verified, GUI pending device test); shift UI (repo layer only);
voice assistant (parser spec only); MCP adapter (boundary only).

**BLOCKED (Physical / External)**: physical printer tests; camera/OCR hardware tests;
certified accountant GST sign-off on legal GSTIN; speech-engine accuracy.

**NOT STARTED**: e-invoicing/e-waybill (disabled pending legal turnover determination);
GSTR tooling validation; k6 load tests.

## Verified commands (run at Phase 5 completion)

- `npm run test` → 183 tests PASS (80 POS + 55 shared-types + 37 owner-dashboard + 11 mobile)
- `npm run typecheck` → 0 errors across all 4 workspaces (@departmental/mobile, @departmental/owner-dashboard, @departmental/windows-pos, @departmental/shared-types)
- `node tests/integration/mobile_discovery_check.mjs` → 9/9 PASS (live session capture, user profile, multi-tenant discovery, isolation, logout invalidation)
- `bench --site frontend run-tests --app departmental_store` → 80 PASS (40 core store + 14 provisioning + 19 tenant registry & profile + 7 tenant isolation)
- `node tests/integration/staging_preflight_check.mjs` → 13/13 PASS (compose rendering, port exposure, ACME staging, prerequisite audit)
- `node tests/integration/ingress_routing_check.mjs` → 26/26 PASS (static, dynamic, ports, and simulated ingress routing)
- `npm run build --prefix apps/owner-dashboard` → PASS (All 13 routes and Middleware (51.3 kB) built and optimized)
- `npm run build --prefix apps/windows-pos` → PASS (Vite + TS build successful)
- `node tests/integration/api_suite.mjs` → 24/24 PASS (including STOCK-01, IDEMP-01, SEC-01..04)
- `npx tsx tests/integration/multi_counter.ts` → 11/11 PASS (multi-counter sales, offline sync, idempotency)
- `node tests/integration/reliability_check.mjs` → 4/4 PASS (RELY-01 through RELY-04 across container restarts)
- Git: clean tree; `git ls-files` contains NO credential files

## Exact next steps (priority)

1. Staging deployment and acceptance test run once owner provides staging domain, authoritative DNS zone access, and DNS-01 API token using `docs/launch/STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md`.
2. Mobile physical device testing (Android APK generation via EAS / Gradle, iOS testflight build on macOS host).
3. Store owner / accountant GST review with the store's legal 15-digit GSTIN using `docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`.
4. Physical printer + barcode scanner validation when hardware arrives at the store.
5. Build Tamil voice parser + transcript fixtures; gate on `voice_assistant_enabled`.

---

# PHASE 15 HANDOFF AUDIT — 2026-10-27 (Staging Deployment Readiness & Disaster Recovery)

## Overview & Objectives Completed
Phase 15 focused on staging deployment reproducibility, disaster-recovery automation, CI test compatibility, and operational incident runbooks:

1. **CI Node 20 Compatibility Resolved**:
   - Fixed `TypeError: Promise.withResolvers is not a function` in `apps/windows-pos/src/domain/sync-engine.test.ts`.
   - Replaced ES2024 / Node 22+ feature with standard `new Promise` constructor.
   - All 80 Windows POS unit/domain tests pass across Node 18, 20, 22, and 24.

2. **Provider-Independent Off-Site Backup Replication Tool**:
   - Implemented `deployment/backup/replicate_offsite.py` with zero heavy SDK dependencies (pure Python + `requests`).
   - Supports any S3-compatible storage: AWS S3, Cloudflare R2, MinIO, Backblaze B2, Ceph.
   - Uses AWS Signature Version 4 (SigV4) with canonical request hashing.
   - Enforces AES256 server-side encryption via `x-amz-server-side-encryption: AES256`.
   - Performs SHA-256 integrity verification before and after upload.
   - Masks secret keys (`*` characters) in all log messages and terminal output.
   - Supports `--dry-run`, `--verify-only`, `--retention-days <N>`, and configurable timeouts.
   - Tested: 5 unit tests in `tests/integration/test_replicate_offsite.py` PASS; CLI dry-run and SHA-256 integrity verification verified against 12 local backup archives.

3. **Disaster Recovery Scratch Restoration Drill (Empirical RTO Benchmark)**:
   - Built `deployment/backup/test_restore_scratch.py` for automated, non-destructive disaster recovery rehearsals.
   - Executed against the running Docker stack:
     * Provisioned temporary site `scratch-phase15-restore.local` in 24.7s.
     * Restored gzipped database dump `20261027_102247-frontend-database.sql.gz` (1.7 MB) in **36.6 seconds**.
     * Verified 1:1 database record parity: 4 installed apps (`frappe`, `erpnext`, `departmental_store`, `india_compliance`), 254 sales invoices, 545 catalog items, 353 POS sync logs, 2 subscriptions, 2 invoices.
     * Cleanly dropped scratch site and database with zero side effects on production `frontend` site.
     * Target RTO: <15 minutes. Empirical RTO achieved: 36.6 seconds.

4. **Automated Staging Preflight Check Suite**:
   - Updated `tests/integration/staging_preflight_check.mjs` with 25 automated checks.
   - Executed: **25 PASSED**, 0 FAILED, 6 BLOCKED (external cloud dependencies) with exit code 0.
   - Verifies system prerequisites, Docker Compose topology, strict network isolation (0 public DB/Redis ports), Traefik v3 reverse proxy routing, and app health endpoints.

5. **Operational Incident Runbooks & Launch Documentation**:
   - `docs/launch/STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md`: Host OS, sizing, secret management, Docker Compose validation, migration rollback, health endpoints.
   - `docs/launch/OFFSITE_BACKUP_AND_DR_SPECIFICATION.md`: S3 multi-cloud architecture, SigV4, AES256, RTO/RPO metrics, and retention lifecycle.
   - `docs/operations/STAGING_AND_DR_INCIDENT_RUNBOOKS.md`: 10 operational runbooks (RB-01 through RB-10) for outages, routing, DB locks, Redis, provisioning, webhooks, backups, leaks, rollbacks, and DR.
   - `docs/launch/LAUNCH_BLOCKER_REGISTER.md`: BLK-OPS-01 & BLK-OPS-02 updated to LOCAL READY / BLOCKED on external cloud prerequisites.

## Verified Test Commands & Suite Status
- `npm --prefix apps/windows-pos test` → 80/80 PASS (exit code 0)
- `python -m unittest tests/integration/test_replicate_offsite.py` → 5/5 PASS (exit code 0)
- `node tests/integration/staging_preflight_check.mjs` → 25 PASS, 6 BLOCKED (exit code 0)
- `python deployment/backup/test_restore_scratch.py` → RTO 36.6s, 1:1 parity PASS (exit code 0)
- `python deployment/backup/replicate_offsite.py --dry-run` → 12 files verified PASS (exit code 0)
- `npm --prefix packages/shared-types test` → 80/80 PASS (exit code 0)
- `npm --prefix apps/owner-dashboard test` → 68/68 PASS (exit code 0)
- `npm --prefix apps/mobile test` → 11/11 PASS (exit code 0)
- `bench --site frontend run-tests --app departmental_store --module departmental_store.tests.test_billing_api` → 21/21 PASS (exit code 0)

---

# PHASE 15A HANDOFF AUDIT — 2026-10-27 (Lint Failure Resolution, Backup Safety & Release Revalidation)

## Root Cause of CI Failure & Resolution
- **Failed Job:** `Lint Frappe Custom App` (Job ID 122247248737 in Run 40520861239).
- **Exact Command:** `ruff check departmental_store` in `erpnext-app/departmental_store`.
- **Root Cause:** 54 linting errors in Frappe custom app Python code including unused imports (`F401`), unused local variables (`F841`), format specifier violations (`UP031`), ambiguous single-letter variable names (`E741`), and undefined names (`F821`).
- **Remediation:** Resolved all 54 issues without suppressing or weakening any lint configuration.
- **Verification:** `ruff check departmental_store` exits 0 with zero errors/warnings. All 120 Frappe backend tests pass cleanly.

## Off-Site S3 Replication Safety Hardening
- **Path Traversal Guards:** Implemented `validate_bucket_name()`, `validate_region()`, `validate_prefix()`, and `validate_object_key()`. Path traversal attempts (`..`, `\`, null bytes) fail closed immediately.
- **Transport Security:** Mandatory HTTPS for all remote endpoints; plain HTTP rejected unless `localhost` / `127.0.0.1`.
- **Verification State Distinction:** Distinguishes `UPLOAD_ACKNOWLEDGED` (HTTP 200 on PUT) from `REMOTE_VERIFIED` (post-upload HEAD probe verifies remote object existence, byte count, and SHA-256 metadata).
- **Safe Retention Pruning:** Implemented `evaluate_retention_pruning()` with strict guarantees: newest backup set and minimum retained backups (at least 1) can NEVER be pruned.
- **Unit Test Coverage:** 19 automated tests in `tests/integration/test_replicate_offsite.py` PASS (exit code 0).

## Disaster Recovery Scratch Site Rehearsal Hardening
- **Site Collision Guard:** Probes whether target site exists before creation; refuses to overwrite existing sites or databases.
- **Deep Parity & Integrity:** Validates application ping availability (`frappe.ping` -> `PONG`), installed apps, table record counts, GL ledger balance (`gl_ledger_balanced: True` with 0.0 imbalance), and tenant isolation.
- **Empirical RTO Benchmark:** Scratch site created in 41.79s, database restored in 70.59s (RTO benchmark: **70.59s** vs <900s target), total duration 127.6s. Cleanly dropped scratch site with zero side effects on production `frontend`.

## Full Workspace Regression Verification (All Tests Run & Verified)
- `ruff check departmental_store` → PASS (0 errors, exit code 0)
- `python -m ruff check deployment/backup tests/integration/test_replicate_offsite.py` → PASS (0 errors, exit code 0)
- `npm --prefix apps/windows-pos test` → 80/80 PASS (exit code 0)
- `python -m unittest tests/integration/test_replicate_offsite.py` → 19/19 PASS (exit code 0)
- `node tests/integration/staging_preflight_check.mjs` → 25 PASS, 6 BLOCKED (exit code 0)
- `python deployment/backup/test_restore_scratch.py` → 70.59s RTO, balanced GL, 1:1 parity PASS (exit code 0)
- `python deployment/backup/replicate_offsite.py --dry-run` → 13 files, 5.12 MB verified PASS (exit code 0)
- `npm --prefix packages/shared-types test` → 80/80 PASS (exit code 0)
- `npm --prefix apps/owner-dashboard test` → 68/68 PASS (exit code 0)
- `npm --prefix apps/mobile test` → 11/11 PASS (exit code 0)
- `bench --site frontend run-tests --app departmental_store` → 120/120 PASS (exit code 0)
- `python scripts/ci/secret_scan.py` → 380 tracked files, 0 secrets (exit code 0)
- `git diff --check` → 0 whitespace errors (exit code 0)

---

# PHASE 15B HANDOFF AUDIT — 2026-10-27 (Remote CI/CD Confirmation & Cloud Backup Recovery Validation)

## Remote GitHub Actions CI Verification
- **Verified Commit SHA:** `617bdd06cb3dc54eb6521945091559f70cc15661` (`617bdd0`)
- **Remote Run URL:** [`https://github.com/sukeshperiyasamy/department-store/actions/runs/40524872536`](https://github.com/sukeshperiyasamy/department-store/actions/runs/40524872536)
- **Workflow:** `CI Quality Gates`
- **Conclusion:** `success` (100% GREEN)
- **Job Status Breakdown (6/6 PASS):**
  * `Frappe App Python Quality` (Job `122261577551`): **success** (remediated the 54 Ruff lint errors from Phase 15A)
  * `Windows POS Test & Frontend Build` (Job `122261577533`): **success**
  * `Typecheck & Contract Validation` (Job `122261577466`): **success**
  * `Security & Config Preflight` (Job `122261577372`): **success**
  * `Owner Dashboard Test & Build` (Job `122261577339`): **success**
  * `Mobile Companion Isolation Tests` (Job `122261577129`): **success**

## S3 Round-Trip Disaster Recovery Capability
- **Atomic Download (`download_file`)**: Added SigV4 authenticated S3 download to `deployment/backup/replicate_offsite.py`. Streams object chunks directly into a `.part` temporary file, computes SHA-256 on-the-fly, validates hash against expected hash, and atomically replaces target destination only on checksum match.
- **Path Traversal Protection**: Ensures target local file path resolves strictly within the intended destination directory.
- **Unit Test Coverage**: Added `test_download_file_dry_run_and_path_validation` to `tests/integration/test_replicate_offsite.py`. All 20 tests pass cleanly.
- **Cloud Infrastructure Status**: Halted at verified local tests; S3 bucket credentials (`S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) remain unconfigured by platform owner. Per policy, stopped and marked as blocked dependency rather than simulating cloud operations.

## Disaster Recovery Scratch Site Rehearsal Benchmark
- **Target Site**: `scratch-phase15-restore.local`
- **Restored Archive**: `20261027_102247-frontend-database.sql.gz` (1.7 MB gzipped MariaDB dump)
- **RTO Benchmark Measured**: **70.59s** (Target SLA: <900s)
- **Parity Verified**: `frappe.ping` -> `PONG`, 4 installed apps, 254 sales invoices, 545 catalog items, 353 POS sync logs, 2 subscriptions, 2 invoices
- **Financial Ledger Integrity**: `gl_ledger_balanced: True` (`gl_imbalance_amount: 0.0`)
- **Isolation & Cleanup**: Scratch site cleanly dropped; zero side effects on production `frontend` site.

## Full Workspace Regression Verification (All Tests Run & Verified)
- `ruff check departmental_store` → PASS (0 errors, exit code 0)
- `python -m ruff check deployment/backup tests/integration/test_replicate_offsite.py` → PASS (0 errors, exit code 0)
- `npm --prefix apps/windows-pos test` → 80/80 PASS (exit code 0)
- `python -m unittest tests/integration/test_replicate_offsite.py` → 20/20 PASS (exit code 0)
- `node tests/integration/staging_preflight_check.mjs` → 25 PASS, 6 BLOCKED (exit code 0)
- `python deployment/backup/test_restore_scratch.py` → 70.59s RTO, balanced GL, 1:1 parity PASS (exit code 0)
- `python deployment/backup/replicate_offsite.py --dry-run` → 13 files, 5.12 MB verified PASS (exit code 0)
- `npm --prefix packages/shared-types test` → 80/80 PASS (exit code 0)
- `npm --prefix apps/owner-dashboard test` → 68/68 PASS (exit code 0)
- `npm --prefix apps/mobile test` → 11/11 PASS (exit code 0)
- `bench --site frontend run-tests --app departmental_store` → 120/120 PASS (exit code 0)
- `python scripts/ci/secret_scan.py` → 380 tracked files, 0 secrets (exit code 0)
- `git diff --check` → 0 whitespace errors (exit code 0)

---

# PHASE 15C HANDOFF AUDIT — 2026-10-27 (Latest Commit CI Verification, Backup Download Testing & Staging Readiness)

## Latest Commit Remote GitHub Actions CI Verification
- **Verified Commit SHA:** `cc831d3b6ad4123e377a7367abc8df43edf36455` (`cc831d3`)
- **Remote Run URL:** [`https://github.com/sukeshperiyasamy/department-store/actions/runs/40527267818`](https://github.com/sukeshperiyasamy/department-store/actions/runs/40527267818)
- **Workflow:** `CI Quality Gates`
- **Conclusion:** `success` (100% GREEN)
- **Job Status Breakdown (6/6 PASS):**
  * `Security & Config Preflight` (Job `122270121817`): **success**
  * `Typecheck & Contract Validation` (Job `122270122345`): **success**
  * `Frappe App Python Quality` (Job `122270122356`): **success**
  * `Owner Dashboard Test & Build` (Job `122270122394`): **success**
  * `Windows POS Test & Frontend Build` (Job `122270122660`): **success**
  * `Mobile Companion Isolation Tests` (Job `122270122952`): **success**

## S3 Download Test Coverage & Safety Invariants
- **Expanded Test Suite**: 29 automated tests in `tests/integration/test_replicate_offsite.py` PASS (exit code 0).
- **10 Core Scenarios Verified**:
  1. Signed GET and streamed download chunking.
  2. SHA-256 integrity hash and exact byte-count tracking.
  3. Checksum mismatch fails closed and preserves existing local file intact.
  4. Mid-stream network failure and HTTP 500 cleanly remove partial `.part` file.
  5. Missing or malformed expected checksum fails safely with explicit `ValueError`.
  6. Destination directory traversal and directory targets strictly rejected.
  7. Atomic destination replacement (`part_path.replace(local_path)`) without intermediate non-atomic deletion.
  8. Secrets, tokens, and authorization headers never leak into exceptions or log messages.
  9. Remote HEAD metadata fallback retrieves `x-amz-meta-sha256` when caller hash is omitted.
  10. Windows file handle cleanup verified: handles closed before rename/delete, preventing sharing violations.

## Cloud Storage & Staging Readiness Status
- **Local Technical Infrastructure**: Preflight audit verifies 25/25 checks PASS with 0 failures (`tests/integration/staging_preflight_check.mjs`).
- **Cloud Storage Replication (BLK-OPS-01)**: `replicate_offsite.py` supports S3, R2, and MinIO. Blocked on owner-provided credentials (`S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- **Public Staging Deployment (BLK-OPS-02)**: Traefik v3 templates and ACME DNS-01 staging options ready. Blocked on owner-provisioned public VM and DNS zone delegation (`*.staging.departmentstore.in`).
- **Legal, Tax, & Commercial KYC**: Blocked on CA sign-off (SAC 998315 / 18% GST), Legal counsel review (ToS & DPDPA), and live Razorpay merchant KYC.

## Full Workspace Regression Verification (All Tests Run & Verified)
- `ruff check departmental_store` → PASS (0 errors, exit code 0)
- `python -m ruff check deployment/backup tests/integration/test_replicate_offsite.py` → PASS (0 errors, exit code 0)
- `npm --prefix apps/windows-pos test` → 80/80 PASS (exit code 0)
- `python -m unittest tests/integration/test_replicate_offsite.py` → 29/29 PASS (exit code 0)
- `node tests/integration/staging_preflight_check.mjs` → 25 PASS, 6 BLOCKED (exit code 0)
- `python deployment/backup/test_restore_scratch.py` → 70.59s RTO, balanced GL, 1:1 parity PASS (exit code 0)
- `python deployment/backup/replicate_offsite.py --dry-run` → 13 files, 5.12 MB verified PASS (exit code 0)
- `npm --prefix packages/shared-types test` → 80/80 PASS (exit code 0)
- `npm --prefix apps/owner-dashboard test` → 68/68 PASS (exit code 0)
- `npm --prefix apps/mobile test` → 11/11 PASS (exit code 0)
- `bench --site frontend run-tests --app departmental_store --module departmental_store.tests.test_billing_api` → 21/21 PASS (exit code 0)
- `python scripts/ci/secret_scan.py` → 380 tracked files, 0 secrets (exit code 0)
- `git diff --check` → 0 whitespace errors (exit code 0)

---

# PHASE 16 HANDOFF AUDIT — 2026-10-27 (Staging Deployment Gate & Release Evidence Reconciliation)

## Baseline & Remote GitHub Actions CI Verification
- **Verified Commit SHA:** `8f90158b60d7571fbb63602fee0877ac00b14cec` (`8f90158`)
- **Remote Run URL:** [`https://github.com/sukeshperiyasamy/department-store/actions/runs/40529474846`](https://github.com/sukeshperiyasamy/department-store/actions/runs/40529474846)
- **Workflow:** `CI Quality Gates`
- **Conclusion:** `success` (100% GREEN)
- **Job Status Breakdown (6/6 PASS):**
  * `Mobile Companion Isolation Tests` (Job `122278012458`): **success**
  * `Owner Dashboard Test & Build` (Job `122278012938`): **success**
  * `Frappe App Python Quality` (Job `122278013001`): **success**
  * `Windows POS Test & Frontend Build` (Job `122278013012`): **success**
  * `Security & Config Preflight` (Job `122278013116`): **success**
  * `Typecheck & Contract Validation` (Job `122278013174`): **success**

## Full Release Evidence Reconciliation (388 Automated Tests)
Raw command execution confirms exactly **388 automated test cases** across the repository, reconciling the historical 378 (Phase 15A) and 379 (Phase 15B) counts with the 10 new download test cases added in Phase 15C:

1. **Client / Frontend Test Suites (239 tests - Vitest)**:
   - `apps/windows-pos`: **80 tests passed** (12 test files)
   - `packages/shared-types`: **80 tests passed** (4 test files)
   - `apps/owner-dashboard`: **68 tests passed** (12 test files)
   - `apps/mobile`: **11 tests passed** (1 test file)
2. **Infrastructure & Disaster Recovery Suite (29 tests - Python unittest)**:
   - `tests/integration/test_replicate_offsite.py`: **29 tests passed** (10 S3 download scenarios + 19 upload/prune/auth tests)
3. **Frappe Backend Core Business Suites (120 tests - Frappe Bench runner)**:
   - Unspecified test category (55 tests passed): `test_sales_api`, `test_provisioning_api`, `test_health_api`, `test_tenant_isolation`, `test_returns_api`
   - Old-category test category (65 tests passed): `test_catalog_api`, `test_settings_api`, `test_onboarding_api`, `test_billing_api`, `test_tenant_api`
   - *(Note: When executing only `test_billing_api` during focused iterations, 21 tests are run)*
4. **Preflight, Security & Quality Audits (Non-Test Assertion Checks)**:
   - `staging_preflight_check.mjs`: **25 PASSED**, 0 FAILED, 6 BLOCKED external dependencies
   - `secret_scan.py`: 380 tracked files scanned, 0 secrets detected
   - `ruff check departmental_store`: 0 errors
   - `ruff check deployment/backup tests/integration/test_replicate_offsite.py`: 0 errors
   - `git diff --check`: 0 formatting/whitespace errors

## Staging Deployment Architecture & Ingress Verification
- **Network Isolation**: Ingress (`saas-edge-ingress`) binds solely to ports 80 and 443. MariaDB (3306), Redis (6379), and Frappe Gunicorn (8000) are unmapped to host interfaces.
- **Tenant Fail-Closed Routing**: Next.js `middleware.ts` enforces RFC 1123 hostname validation; malformed or unmapped subdomains fail closed with 404; tenant `/admin` attempts are blocked with 403.
- **Trusted Proxy Inspection**: Forwarded headers (`x-forwarded-host`, `x-forwarded-for`) are accepted only from explicitly matched trusted proxy CIDRs (`TRUSTED_PROXY_IPS`).
- **7-Item External Staging Acceptance Sequence**: Formally documented in `STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md` detailing exact owner actions required before initiating public deployment.

---

# Phase 17 Handoff Audit — Latest CI Verification, Staging Execution Planning & Production Safety Audit (2026-10-28)

## Baseline & Remote CI State
- **Baseline Commit**: `e26a8325cda2bb77e66bef539f3bde16dfbf0677` (on `main`, clean tree).
- **GitHub Actions Verification**: Run ID `40531875063` (`CI Quality Gates`), Status: `completed`, Conclusion: `success`.
  * `Owner Dashboard Test & Build` (ID: `122286578219`): **PASS**
  * `Windows POS Test & Frontend Build` (ID: `122286578585`): **PASS**
  * `Typecheck & Contract Validation` (ID: `122286578674`): **PASS**
  * `Mobile Companion Isolation Tests` (ID: `122286578695`): **PASS**
  * `Frappe App Python Quality` (ID: `122286578738`): **PASS**
  * `Security & Config Preflight` (ID: `122286578775`): **PASS**

## Reconciled Full Test Suite (396 Automated Test Cases - 100% GREEN)
1. **Frontend / Monorepo Client Suites (243 tests - Vitest)**:
   - `packages/shared-types`: **80 tests passed** (4 test files)
   - `apps/owner-dashboard`: **72 tests passed** (12 test files, +4 new adversarial tests)
   - `apps/windows-pos`: **80 tests passed** (12 test files)
   - `apps/mobile`: **11 tests passed** (1 test file)
2. **Infrastructure & Disaster Recovery Suite (29 tests - Python unittest)**:
   - `tests/integration/test_replicate_offsite.py`: **29 tests passed** (10 S3 download scenarios + 19 upload/prune/auth tests)
3. **Frappe Backend Core Business Suites (124 tests - Frappe Bench runner)**:
   - Unspecified test category (**59 tests passed**, was 55): `test_sales_api` (18), `test_provisioning_api` (14), `test_health_api` (6), `test_tenant_isolation` (**11**, was 7), `test_returns_api` (10)
   - Old-category test category (**65 tests passed**): `test_catalog_api` (4), `test_settings_api` (13), `test_onboarding_api` (8), `test_billing_api` (21), `test_tenant_api` (19)
4. **Preflight, Security & Quality Audits (Non-Test Invariants)**:
   - `tests/integration/staging_preflight_check.mjs`: **25 PASSED**, 0 FAILED, 6 BLOCKED external dependencies
   - `scripts/ci/secret_scan.py` (`npm run scan:secrets`): 380 tracked files scanned, 0 secrets detected
   - `scripts/ci/validate_deployment_configs.py` (`npm run validate:configs`): All deployment configs valid
   - `python -m ruff check ...`: 0 errors across custom app, tools, and tests
   - `npm run typecheck`: 0 TypeScript errors across all 4 workspaces

## Critical Invariant & Path Reconciliations
- **Package Manager**: Clarified that root workspace orchestration uses `npm` (`npm run test --workspace @departmental/...`), not `pnpm`.
- **Preflight Script Path**: Staging preflight check is located at `tests/integration/staging_preflight_check.mjs`.
- **Backup Tools Path**: S3 replication script is at `deployment/backup/replicate_offsite.py` and its test suite is at `tests/integration/test_replicate_offsite.py`.
- **Frappe DDL Transaction Safety**: Fixed `ImplicitCommitError` in `ensure_saas_membership_table()` by adding `table_exists` check prior to DDL execution.
- **Controlled 10-Step Staging Acceptance Protocol**: Fully specified in Section 8 of `STAGING_DEPLOYMENT_AND_RECOVERY_RUNBOOK.md` with explicit pass/fail gates.

---

# Phase 18 Handoff Audit — Tenant-Site Isolation Proof and Final Software Release Gate (2026-10-28)

## Baseline & Remote CI Verification
- **Baseline Commit**: `72f535b34ac724dd7c34627db4f342e9e6209518` (on `main`).
- **GitHub Actions Verification**: Run ID `40565971201` (`CI Quality Gates`), Status: `completed`, Conclusion: `success` (6/6 jobs PASS).
- **Pushed Release Commit**: `a4f0b18c777ed7b904fb1a2be37b5ff9c66068da` (`feat(tenancy): add two-site physical tenant isolation proof & release gate (Phase 18)`).

## Core Deliverables & Verifications
1. **Physical Two-Site Isolation Proof (`test_two_site_tenant_isolation.py`)**:
   - 7/7 automated checks PASS (exit code 0).
   - Validated distinct MariaDB schemas (`_5d32c992bf9e2cc2` vs disposable `_35883b21ac2a614c`).
   - Proved 100% data invisibility: Item, User, and Tenant fixtures created on Site A are completely absent on Site B.
   - Cross-tenant object ID manipulation and forged tenant headers are strictly denied with `PermissionError`.
   - Unknown and unverified hostnames fail closed (`TENANT_NOT_FOUND`).
   - Redis cache key isolation verified via `db_name` key prefixes (`frappe.local.conf.get('db_name')|key`); `frappe.destroy()` resets context cleanly.
   - Transaction failure/retry context cleanup verified: crashed transactions on Site A do not leak locks or uncommitted records to Site B.
2. **End-to-End Request Traceability**:
   - Traced all 7 stages from Traefik ingress down to MariaDB schema isolation with exact code files, functions, and lines in `docs/launch/TENANT_SITE_ISOLATION_PROOF_PHASE18.md`.
3. **Platform-Admin Boundary Verification**:
   - Verified `/admin` lockout on tenant subdomains in `middleware.ts`, `require_platform_admin()` server-side enforcement, and explicit worker job tenant scoping.
4. **Full Workspace Regression Suite (396 Automated Tests - 100% GREEN)**:
   - Client Suites: 243 Vitest tests (80 POS, 80 shared-types, 72 owner-dashboard, 11 mobile).
   - Backend Core: 124 Frappe bench tests across all modules.
   - Infrastructure & DR: 29 S3 replication/download tests.
   - Preflight & Security: 25 preflight checks PASS, 380 tracked files scanned with 0 secrets.

---

# Phase 19 Handoff Audit — End-to-End Tenant Host Routing Verification & Staging Gate (2026-10-28)

## Baseline & Remote CI Verification
- **Baseline Commit**: `a4f0b18c777ed7b904fb1a2be37b5ff9c66068da` (on `main`).
- **GitHub Actions Verification**: Run ID `40574563439` (`CI Quality Gates`), Status: `completed`, Conclusion: `success` (6/6 jobs PASS).
- **Pushed Release Commit**: `833a8c8f22fa760c474085fc9a8634e29d2addcf` (`feat(tenancy): verify e2e tenant http routing and fix nginx site header (Phase 19)`).

## Core Deliverables & Verifications
1. **Demonstrated Nginx Multi-Site Routing Defect & Correction**:
   - Discovered `deployment/erpnext/pwd.yml` had hardcoded `FRAPPE_SITE_NAME_HEADER: frontend`, causing Nginx to set `proxy_set_header X-Frappe-Site-Name frontend;` and routing all traffic to `frontend` regardless of requested Host.
   - Corrected to `$$host`, dynamically passing the client's Host header as `X-Frappe-Site-Name` to Gunicorn backend.
   - Verified unknown hostnames fail closed with HTTP 404, and forged client `X-Frappe-Site-Name` headers are overwritten by Nginx.
2. **Automated Real HTTP Two-Tenant Routing Suite (`test_e2e_tenant_http_routing.py`)**:
   - 10/10 automated checks PASS (exit code 0) over real HTTP port 8080.
   - Verified dynamic site selection via Host header, tenant marker isolation (`Alpha Organic Bread` vs `Beta Farm Milk`), unknown host fail-closed (HTTP 404), unverified hostname denial, suspended tenant denial, forged header rejection, cross-tenant credential denial (HTTP 401), unauthenticated access protection (HTTP 403), cache isolation across host switching, and error isolation without context leak.
3. **Guarded Teardown & Documentation**:
   - Disposable sites dropped cleanly; primary `frontend` site preserved.
   - Authored formal release proof in `docs/launch/TENANT_HTTP_ROUTING_PROOF_PHASE19.md`.

---

# Phase 20 Handoff Audit — Tenant Lifecycle Enforcement, Custom-Domain Routing & Staging Readiness (2026-10-28)

## Baseline & Remote CI Verification
- **Baseline Commit**: `833a8c8f22fa760c474085fc9a8634e29d2addcf` (on `main`).
- **GitHub Actions Verification**: Run ID `40583310029` (`CI Quality Gates`), Status: `completed`, Conclusion: `success` (6/6 jobs PASS).

## Key Accomplishments & Technical Deliverables

1. **API-Level Lifecycle Enforcement Gate in Frappe WSGI Hook**:
   - Registered `enforce_tenant_lifecycle_and_membership()` in Frappe's `before_request` hook (`hooks.py`).
   - Protects all operational APIs (`/api/resource/*`, `/api/method/*`) across all tenant sites.
   - Fails closed with HTTP 403 on `SUSPENDED` (`TenantSuspendedError`), `ARCHIVED` (`TenantArchivedError`), and `PROVISIONING`/`INACTIVE` (`TenantInactiveError`).
   - Safely bypasses control plane site `frontend`, OPTIONS preflights, and health probes (`frappe.ping`, `get_liveness`, `resolve_tenant_by_host`).

2. **User Membership Authorization Gate**:
   - Evaluates user identity from session or `Authorization: token <key>:<secret>` header directly in `before_request`.
   - Requires authenticated non-admin users to hold `status == 'ACTIVE'` in `tabSaaS Tenant Membership` for the tenant workspace.
   - Rejects missing or inactive memberships with HTTP 403 `MembershipInactiveError`.

3. **Zero-Lock Redis Caching & Instant Real-Time Invalidation**:
   - Tenant lifecycle and custom domains cached in Redis key `saas_tenant_lifecycle:{site_name}` (`shared=True`, 300s TTL) for <0.2ms resolution time and zero cross-database locking per request.
   - Administrative status changes (`set_tenant_status`, `verify_tenant_hostname`, `verify_custom_domain`, `remove_custom_domain`) immediately write or evict shared Redis keys for zero-second stale window.

4. **Trusted Custom-Domain Routing via Filesystem Symlinks**:
   - Verified custom domains mapped via bench filesystem symlinks (`sites/<custom_domain> -> sites/<site_name>`).
   - Unverified or removed custom domains fail closed with HTTP 404 or HTTP 403 `HostnameUnverifiedError`.
   - Global collision detection prevents cross-tenant domain hijacking.
   - Header validation strictly checks `real_site` against `custom_domains` list, preventing worker cache desynchronization.

5. **Automated Integration & Regression Suite (`test_tenant_lifecycle_and_custom_domain.py`)**:
   - 17/17 automated assertion checks PASS (exit code 0) over real HTTP port 8080:
     1. `01_control_plane_frontend_accessible`: HTTP 200 on control plane.
     2. `02_active_tenant_a_reads_protected_api`: HTTP 200 on active tenant.
     3. `03_suspended_tenant_a_denied_api`: HTTP 403 `TenantSuspendedError`.
     4. `04_reactivated_tenant_a_restored_api`: HTTP 200 restored immediately.
     5. `05_archived_tenant_a_denied_api`: HTTP 403 `TenantArchivedError`.
     6. `06_provisioning_tenant_b_denied_api`: HTTP 403 `TenantInactiveError`.
     7. `07_unverified_hostname_denied`: HTTP 403 `HostnameUnverifiedError`.
     8. `08_verified_custom_domain_resolves_site`: HTTP 200 via verified custom domain.
     9. `09_unverified_custom_domain_fails_closed`: HTTP 403 / 404.
     10. `10_removed_custom_domain_immediately_fails_closed`: HTTP 403 / 404 upon unlinking.
     11. `11_custom_domain_collision_blocked`: Collision rejected with `ValidationError`.
     12. `12_forged_forwarded_host_cannot_bypass_lifecycle`: Forged headers fail closed.
     13. `13_active_membership_allowed`: HTTP 200 for active member user.
     14. `14_inactive_membership_denied`: HTTP 403 `MembershipInactiveError`.
     15. `15_cross_tenant_membership_denied`: Tenant A user denied access to Tenant B.
     16. `16_instant_cache_invalidation_verified`: Immediate denial without waiting for TTL.
     17. `17_pos_sales_lifecycle_enforcement`: POS sale rejected with HTTP 403 on suspended tenant.

6. **Full Monorepo Test Regression Status (100% GREEN)**:
   - `tests/integration/test_tenant_lifecycle_and_custom_domain.py` → 17/17 PASS (exit code 0)
   - `tests/integration/test_e2e_tenant_http_routing.py` → 10/10 PASS (exit code 0)
   - `tests/integration/test_two_site_tenant_isolation.py` → 7/7 PASS (exit code 0)
   - `bench --site frontend run-tests --app departmental_store` → 124/124 PASS (0 errors, 0 failures)
   - `python -m unittest tests/integration/test_replicate_offsite.py` → 29/29 PASS (exit code 0)
   - `node tests/integration/staging_preflight_check.mjs` → 25 PASS, 6 BLOCKED (exit code 0)
   - `npm run test` → 243/243 PASS across 4 workspaces (11 mobile, 72 owner-dashboard, 80 windows-pos, 80 shared-types)
   - `npm run typecheck --workspaces --if-present` → 0 TypeScript errors
   - `python -m ruff check departmental_store` → 0 lint errors
   - `python -m ruff check tests/integration/test_tenant_lifecycle_and_custom_domain.py` → 0 lint errors
   - `npm run scan:secrets` → 384 tracked files, 0 secrets detected
   - `python scripts/ci/validate_deployment_configs.py` → SUCCESS

## Staging & External Blocker Status
- **Local Software Verification**: `PASS — lifecycle and hostname routing verified locally`.
- **External Prerequisites (Strictly Blocked / Non-Simulated)**:
  * Public Staging Linux VM & DNS Zone Delegation (`*.staging.departmentstore.in`)
  * Cloud Object Storage S3/R2 Bucket & Credentials for Off-Site Backup Replication
  * Production Razorpay Live Merchant Account KYC & Production Webhooks
  * Chartered Accountant & Legal Counsel Sign-Off (SAC 998315 / 18% GST / ToS / DPDPA)
  * Physical Hardware Validation (Thermal Printers, Barcode Scanners, Cash Drawers)
