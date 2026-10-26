# Release Readiness — 2026-10-27 (updated after fresh-stack revalidation)

Commit: see §"this phase" below · Supersedes the pre-reset verdict (kept in git history)

## Gate status

| # | Gate | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No duplicate finalized sales on retry | **PASS** | bench BI-01; HTTP IDEMP-01; RELY-03/04; MC-06 |
| 2 | Supported ERPNext workflows only | **PASS** | Sales Invoice is_pos/is_return lifecycle; bench suite |
| 3 | Stock/accounting effects correct | **PASS** | BI-08; returns tests (stock restored, GL posted); **STOCK-01 now PASS after QA-0005 fix** |
| 4 | No direct DB writes | **PASS** | whitelisted methods only |
| 5 | Offline transactions durable and visible | **PASS** | SQLite suites; MC-04; Windows GUI |
| 6 | Retries never lose/duplicate | **PASS** | sync-engine suite; MC-05; RELY-03 |
| 7 | Concurrent counter conflicts explicit | **PASS** | MC-03; MC-D1 deadlock retry; MC-08 (refunds); **0 deadlocks on fresh stack** (`Innodb_deadlocks=0`) |
| 8 | Cashier permissions server-side | **PASS** | SEC-02/03/04; QA-0004; device registration manager-only (MC-D3) |
| 9 | Refunds/overrides respect permissions | **PASS** | returns bench tests; RETURN_AUTHORIZATION_REQUIRED test |
| 10 | Backup/restore documented and tested | **PASS** | backup 20261027_035610 verified pre-reset; scratch-site restore rehearsals (10-26 + 10-27) |
| 11 | No invented tax/government identifiers | **PASS** | synthetic GSTIN labeled; e-invoicing disabled |
| 12 | Uncertain payments not shown successful | **PASS** | references only; payment modal wording |
| 13 | Secrets/customer data protected | **PASS** | secret scan; synthetic data only |
| 14 | Critical test evidence reproducible | **PASS** | TEST_ENVIRONMENT.md; dated logs + fresh-stack addendum; provisioning steps in KNOWN_ISSUES_AND_TODO |

## Fresh-stack revalidation & Settings Console Audit (2026-10-27)

Environment fully reset after ISSUE-05: verified backup → `down -v` → fresh stack → apps
reinstalled → reseeded (160-item regional catalog idempotent, GST templates, 300 PERF items).
Post-implementation Settings audit completed: Settings page in Manager Console verified with
10 persisted feature flags, live database metrics, unique WCAG switch IDs, and GST demo guards.

Results:
- Apps/Guard: apps_txt_guard **4/4**
- API Suite: api_suite **24/24** (STOCK-01 PASS)
- Multi-counter: multi_counter **11/11**
- Reliability: reliability **4/4**
- Bench Tests: **40/40** PASS (28 sales/returns + 4 catalog + 8 settings & security)
- TypeScript Strict Mode: **103/103** unit tests PASS (80 POS + 14 shared-types + 9 dashboard)
- Typecheck: 0 errors across all workspaces
- Builds: Next.js dashboard production build PASS, POS Vite build PASS
- Deadlocks: **zero deadlocks** (`Innodb_deadlocks = 0` via live MariaDB query)

Full evidence: `docs/testing/TEST_EXECUTION_LOG_2026-10-27.md` addendum and `docs/testing/BUG_REPORT.md` addendum #3.

## Capability status

| Capability | Status |
| --- | --- |
| Windows exe (Tauri 2, GNU toolchain) built + launched + E2E sale flow | **IMPLEMENTED_AND_VERIFIED** (NSIS installer packaging: BLOCKED — MSVC CI runner needed) |
| Returns/refunds (API + POS UI + idempotency + authorization) | **IMPLEMENTED_AND_VERIFIED** (bench tests; MC-08) |
| India Compliance installed (v16 branch) + GST templates + POS-path GST sale | **IMPLEMENTED_NOT_FULLY_TESTED** (arithmetic verified; accountant + real GSTIN outstanding) |
| Receipt builder (ESC/POS) + duplicate/reprint semantics | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Label builders (ZPL/TSPL) + injection sanitization | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Backup script + integrity + DR restore rehearsal | **IMPLEMENTED_AND_VERIFIED** (scheduler registration: operational task) |
| Multi-counter/offline suite (11 checks, 2 real SQLite counters) | **IMPLEMENTED_AND_VERIFIED** (11/11 PASS; verdict counting fixed) |
| STOCK-01 full-qty race sale with india_compliance | **RESOLVED — QA-0005 fixed, regression-tested** (api_suite 24/24) |
| Manager Console Settings Page (9 sections, 10 feature flags, live health, GST guard) | **IMPLEMENTED_AND_VERIFIED** (live ERP persistence, System Manager role check, 0 deadlocks) |

## Recommendation

**CONDITIONAL GO** for a supervised single-counter pilot with the packaged exe
(login, catalog, billing, local persistence, GST templates, returns, settings console,
and backups all evidenced on a freshly rebuilt stack). Production revenue use still requires:
accountant-approved GST configuration with the store's real GSTIN/HSN data,
physical printer validation, NSIS installer via an MSVC CI runner, and backup
scheduling registration on the store server.
