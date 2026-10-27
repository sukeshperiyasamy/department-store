# FEATURE_STATUS

Statuses: ✅ VERIFIED (executed with evidence) · 🟡 IMPLEMENTED_NOT_FULLY_TESTED · 🚧 PARTIAL · ⛔ BLOCKED · ⬜ NOT STARTED
Evidence pointers: docs/testing/, docs/artifacts/. Date of last verification: 2026-10-27.

## Core billing & backend

| Feature | Status | Evidence |
| --- | --- | --- |
| Idempotent sale submission (claim + unique txn id) | ✅ | bench BI-01, HTTP IDEMP-01, MC-06, RELY-03/04 |
| Server-side re-pricing (client rates ignored) | ✅ | bench BI-test, HTTP CONTRACT-01 |
| Stock + GL effects via ERPNext lifecycle | ✅ | bench BI-08 (SLE + GL), GST cases |
| Lost-response recovery (check_transaction) | ✅ | RECOVERY-01, RELY-03, engine tests |
| Deadlock retry (two-counter tabSeries race) | ✅ | MC-D1 fix, MC-02 |
| Returns/refunds (partial, full, authz, idempotent) | ✅ | 10 bench tests, MC-08, GUI screen |
| Catalog snapshot sync (items+prices checkpoint) | ✅ | bench catalog tests, PERF-02 |
| Device registration (manager-only) + status check | ✅ | SEC-02/03, MC-DEVICES |
| Feature flags (10 modules) + settings API | ✅ | settings doctype migrated + API verified live |
| Owner summary / stock alerts / recent invoices APIs | ✅ | HTTP-verified against live ERP |
| Backup + DR scratch-site restore | ✅ | run_backup.sh + rehearsal 10-26 & 10-27 |
| Audit logging (flag changes, overrides, sync events) | ✅ | logger calls; flag change test |

## POS client (Tauri 2 + React)

| Feature | Status | Evidence |
| --- | --- | --- |
| Login + device registration flow | ✅ | real exe E2E (WIN fixes) |
| Catalog sync to SQLite (v2 schema) | ✅ | repos tests, GUI verified |
| Barcode/search billing, cart, qty, remove | ✅ | GUI E2E + component tests |
| Payment (cash/UPI/card, split, change, shortfall guard) | ✅ | GUI E2E, unit tests |
| Durable local save + outbox (atomic) | ✅ | real SQLite tests incl. rollback |
| Sync engine (backoff, lost-response, crash recovery) | ✅ | sync-engine tests |
| Sync/review screen (retry, reprint) | ✅ | component + unit tests |
| Returns screen | 🟡 | implemented + typed; UI not yet exercised in the packaged exe |
| Receipt printing (ESC/POS bytes, duplicate marker) | ✅ builder / ⛔ physical device |
| Label printing (ZPL + TSPL, sanitization) | ✅ builder / ⛔ physical device |
| Feature-flag gating of POS modules | 🚧 | flags API live; POS screens not yet flag-gated |
| Tamil/Tanglish catalog search | ✅ | catalog tests (alias ranking) |
| Tamil voice assistant (Ctrl+Space, parser) | 🚧 | parser spec'd; engine unselected; not started |
| Camera/OCR batch capture | ⬜ | spec only |
| Shift open/close UI | 🚧 | SQLite repo exists, no screen |
| NSIS installer | 🟡 | .github/workflows/windows-release.yml (GitHub Actions MSVC CI workflow configured) |

## Manager Console (Next.js)

| Feature | Status | Evidence |
| --- | --- | --- |
| Dashboard (KPIs, charts, recent bills, counters) | ✅ | live-ERP screenshots |
| Catalog / Sales / Inventory alerts / Sync & Health pages | ✅ | live-ERP screenshots |
| Login (session) + service-token auth | ✅ | SEC matrix |
| Settings page (feature flags UI, 9 sections, live DB health, GST guard) | ✅ | /settings live, 10 flags persisted via set_flag, live MariaDB status, 9 vitest tests, 8 bench tests, WCAG switch accessible |
| Mobile responsive light theme | ✅ | 390/768/1366/1920 screenshots, settings layout tested |

## Backend platform & operations

| Feature | Status | Evidence |
| --- | --- | --- |
| ERPNext v16 docker stack + seeds + self-heal | ✅ | live Docker stack (9 containers) |
| India Compliance v16 + GST templates + POS-path GST | ✅ math / 🟡 accountant sign-off | bench suite tests |
| Backup script + Host scheduling + DR rehearsal | ✅ | run_backup.ps1 / run_backup.sh; Task Scheduler registered ('Ready'); scratch site restore PASS |

## Multi-Tenant SaaS Platform (Evolution)

| Feature | Status | Evidence |
| --- | --- | --- |
| Tenant Registry Contracts & Schemas | ✅ | `packages/shared-types/src/tenancy.ts` (47 vitest unit tests) |
| Hostname Normalization & Validation (RFC 1123) | ✅ | vitest test suite + bench test suite (15 bench tests) |
| Tenant Resolution Engine (Subdomain / Custom Domain) | ✅ | `resolve_tenant_by_host` API + `resolveTenantByHostname` TypeScript engine |
| Server-Side Boundary & Cross-Tenant Access Denial | ✅ | `authorizeTenantAccess` + `get_tenant_info` server role enforcement |
| Multi-Site Isolation Architecture (ADR-0008) | ✅ | Architecture decision accepted; native database separation |
| Public Marketing Website & Lead Capture Forms (Phase 2) | ✅ | Live Next.js routes (`/`, `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms`), validated Zod forms, Frappe MariaDB persistence (`tabSaaS Demo Request`, `tabSaaS Onboarding Request`) + resilient `.leads-outbox/`, browser-verified |
| Customer Onboarding & Slug Check (Phase 2) | ✅ | Live slug check against reserved keywords (`checkSlugAction`), pending review status feedback, no unverified provisioning claimed |
| Tenant Provisioning Pipeline & State Machine (Phase 3) | ✅ | 10-state lifecycle state machine (`PENDING_REVIEW` -> `ACTIVE`), Frappe worker queue (`claim_next_provisioning_job`), step tracking (`INIT` -> `COMPLETED`), timeout recovery, bounded retries, sanitized error logs, zero secret leakage, 9 bench tests PASS |
| Platform Admin Review Console (Phase 3) | ✅ | Protected console at `/admin/onboarding`, KPI cards, queue filtering tabs, full search, inspect drawer, approve/reject/retry/suspend modals, browser-verified, 26 vitest tests PASS |
| Dedicated Platform Admin Permission Boundary (ADR-0009) | ✅ | Frappe `Platform Admin` role; server-side denial of tenant System Managers, store managers, cashiers, and guests |
| Immutable Provisioning Audit Trail (Phase 3) | ✅ | `tabSaaS Provisioning Audit Log` capturing all state transitions, actors, reasons, and sanitized metadata |
| Local Subdomain Routing & Middleware Boundary (Phase 4A) | ✅ | Next.js `middleware.ts` resolving `*.localhost` to tenant workspaces, trusted proxy enforcement (`TRUSTED_PROXY_IPS`), `/admin` lockout on tenant subdomains, cache isolation (`Vary: Host, Cookie`), 33 vitest tests PASS |
| Provisioning Worker Scheduling & Stale Recovery (Phase 4A) | ✅ | Heartbeat timeout recovery (>600s), background enqueue into Frappe `long` queue, scheduler hook in `hooks.py`, CLI argument password redaction |
| Two-Tenant Isolation Verification (Phase 4A) | ✅ | Automated test suite `test_tenant_isolation.py` (4/4 PASS) demonstrating Shop A / Shop B separation, cross-tenant denial, and zero fallback defaults |
| Production Ingress & Wildcard TLS Automation (Phase 4B) | ✅ | Traefik v3 deployment templates (`deployment/ingress/`), Let's Encrypt DNS-01 challenge, ADR-0010 accepted, dual-upstream routing (`owner-dashboard` vs `frontend`), HSTS, Vary: Host/Cookie, 26 integration checks PASS |
| Hostname Verification & Tenant Activation Lifecycle (Phase 4B) | ✅ | Explicit separation of site provisioning (`PROVISIONED`), hostname verification (`VERIFIED`), and commercial activation (`ACTIVE`); server-side guards in `provisioning.py` & `tenant.py`, 78 Frappe tests PASS |
| Staging Deployment & Real-World Acceptance (Phase 4C) | 🟡 BLOCKED (Prerequisites) | Preflight validated (13 checks PASS); exact prerequisites checklist documented in `STAGING_ACCEPTANCE_RUNBOOK.md`; external cloud deployment stopped pending owner domain & credentials |
| Shared Multi-Tenant Mobile App & Auth Flow (Phase 5) | ✅ | Expo SDK 52 + React Native 0.76 client in `apps/mobile`; multi-tenant discovery, secure storage, tenant-bound session, role-based screens, offline cache; 11 vitest tests PASS, 9 live integration checks PASS |
| SaaS Subscription Billing Data Model & State Machine (Phase 6) | ✅ | `packages/shared-types/src/billing.ts`, MariaDB tables (`tabSaaS Subscription`, `tabSaaS Invoice`, etc.), 6-state lifecycle machine, 10 Frappe backend tests PASS |
| Payment Provider Integration & HMAC Webhooks (Phase 6) | ✅ | Razorpay Sandbox checkout creation, HMAC-SHA256 signature verification, deduplication, idempotent delivery, zero secret leakage, 9 integration checks PASS |
| Customer Self-Service Billing Portal (Phase 6) | ✅ | Next.js routes (`/billing`, `/billing/plans`, `/billing/invoices`, `/billing/usage`, `/billing/cancel`); 90-day data retention guarantee, Next.js build PASS (19 routes) |
| Platform-Admin Billing Console & Oversight (Phase 6) | ✅ | Protected console `/admin/billing`, subscription search, audited manual corrections, webhook replay pipeline, 44 vitest tests PASS |
| Server-Enforced Entitlements & Counter Limits (Phase 6) | ✅ | `devices.py` enforces plan `max_counters` limit during POS terminal registration; zero disruption of live checkout sales |
| Multi-Dimensional Onboarding State Machine (Phase 7) | ✅ | Decouples 6 distinct dimensions: Contact Verification, Business Review, Provisioning, Hostname, Subscription, and Tenant Access; prevents premature site creation and enforces approval/activation guards; 11 shared-types tests PASS, 8 Frappe tests PASS |
| Single-Use SHA-256 Hashed Verification Tokens (Phase 7) | ✅ | Expiring (24h) tokens stored exclusively as SHA-256 digests in `tabSaaS Verification Token`; anti-enumeration on resend, sliding-window rate limiting (`tabSaaS Rate Limit`), token reuse rejected |
| Customer Onboarding Journey Portal (Phase 7) | ✅ | Protected self-service portal at `/onboarding/status` and 1-click verification landing at `/onboarding/verify`; privacy authorization boundary enforces email/token ownership (403 on stranger snoop); Next.js build PASS (22 routes) |
| Platform Operations Cockpit (Phase 7) | ✅ | Operational dashboard at `/admin/operations`, live overview KPIs (registrations, verification, review queue, provisioning, tenants, backup status), multi-dimensional tab filtering, mandatory audit rationale modal for admin actions |
| Customer Notification Pipeline & Deduplication (Phase 7) | ✅ | Provider-independent notification engine (`tabSaaS Notification Log`), deterministic deduplication (`dedup_key = MD5(request_id + event + suffix)`), suppresses repeated alerts |
| Tenant Lifecycle & Data Preservation Operations (Phase 7) | ✅ | Suspension and cancellation strictly separated from data deletion; MariaDB tenant databases, config keys, and backup dumps preserved with zero data loss; runbook documented in `ONBOARDING_AND_TENANT_LIFECYCLE_RUNBOOK.md` |
| Threat Model & Security Audit (Phase 8) | ✅ | Comprehensive STRIDE audit covering 12 attack surfaces, zero secret leakage, container network isolation, `THREAT_MODEL_AND_SECURITY_AUDIT.md` |
| Fail-Closed Production Configuration & Secret Redaction (Phase 8) | ✅ | `apps/owner-dashboard/src/lib/env.ts` fails closed when required configs are missing; `.gitignore` guards verified; zero secrets in bundles; vitest PASS |
| Production Telemetry & Observability APIs (Phase 8) | ✅ | `get_liveness` (public probe) and role/token-protected `get_system_health` in Frappe; Next.js `/api/health` dependency probe; Redis queue depths, DB latency, POS sync metrics; 4 Frappe bench tests PASS, 2 vitest PASS |
| Disaster Recovery Rehearsal & Live Verification (Phase 8) | ✅ | Automated backup + SHA256 checksums; live restore into `scratch-phase8-restore.local` verified in 21s with 1:1 data parity (254 invoices, 545 items, 353 POS logs); documented in `BACKUP_AND_DISASTER_RECOVERY.md` |
| Comprehensive Incident Response Runbooks (Phase 8) | ✅ | 13 actionable runbooks covering security breaches, data leaks, outages, disk exhaustion, webhook failures, and deployment rollbacks in `INCIDENT_RESPONSE_RUNBOOKS.md` |
| Production Readiness Scorecard & Verdict (Phase 8) | ✅ | Complete readiness matrix across PASS, BLOCKED, NOT TESTED categories; release verdict CONDITIONAL GO — Supervised Pilot in `PRODUCTION_READINESS_SCORECARD.md` |
| Automated Security & Hardening Check Suite (Phase 8) | ✅ | `tests/integration/security_and_hardening_check.mjs` (15/15 checks PASS) validating port exposure, liveness, telemetry roles, checksums, and tenant isolation |
| Controlled Pilot Readiness Checklist (Phase 9) | ✅ | Audit of 12 operational launch areas, evidence, and PASS/BLOCKED/NOT TESTED status in `docs/pilot/PILOT_READINESS_CHECKLIST.md` |
| Documented Pilot Scope & Cohort Plan (Phase 9) | ✅ | Target cohort (1–3 shops), 14-day duration, supported retail workflows, device specs, support SLAs, and stop criteria in `docs/pilot/CONTROLLED_PILOT_PLAN.md` |
| End-to-End Pilot Acceptance Test Suite (Phase 9) | ✅ | `tests/integration/pilot_acceptance_suite.mjs` (24/24 PASS) validating registration, token expiry, privacy boundary, approval, provisioning, routing, POS sales, idempotency, returns, requires-review queue, suspension, reactivation, and telemetry |
| Pilot Telemetry API & Monitoring Cockpit (Phase 9) | ✅ | Authenticated `@frappe.whitelist() get_pilot_status()` API in Frappe reporting active/suspended tenants, in-flight/failed jobs, POS sync backlog, DB latency (0.06ms), and escalation thresholds; documented in `docs/pilot/PILOT_MONITORING_AND_ESCALATION.md` |
| Customer Feedback & Issue Tracking Workflow (Phase 9) | ✅ | Structured feedback intake schema (task, expected vs actual, Sev 1–4, correlation ID, financial impact) with strict zero-secret and zero-PII guardrails in `docs/pilot/CUSTOMER_FEEDBACK_AND_INCIDENT_WORKFLOW.md` |
| Pilot Success Scorecard & Release Gates (Phase 9) | ✅ | 10 measurable release gates, quantitative SLA benchmarks (DB latency, POS submission latency, sync drain speed), and scorecard in `docs/pilot/PILOT_SUCCESS_SCORECARD.md` |
| Formal Go / No-Go Pilot Review (Phase 9) | ✅ | Tri-pillar review (Technical PASS, Operational PASS, Business CONDITIONAL) and formal verdict CONDITIONAL GO — Supervised Real-Shop Pilot in `docs/pilot/GO_NO_GO_PILOT_REVIEW.md` |
| Production deployment checklist | ✅ | docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md |
| e-invoicing / e-waybill | ⬜ disabled pending legal determination | settings UI verified |
| Tamil voice speech engine | ⬜ | spec only |
| MCP adapter (typed tool boundary only) | 🚧 | boundary typed |
