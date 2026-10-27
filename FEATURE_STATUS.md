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
| Production deployment checklist | ✅ | docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md |
| e-invoicing / e-waybill | ⬜ disabled pending legal determination | settings UI verified |
| Tamil voice speech engine | ⬜ | spec only |
| MCP adapter (typed tool boundary only) | 🚧 | boundary typed |
