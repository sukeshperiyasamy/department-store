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
| 10 | Backup/restore documented and tested | **PASS** | backup verified; PowerShell + Git Bash runners; Windows Task Scheduler registered; scratch-site restore rehearsal (4 apps, 95 bills, 501 items) |
| 11 | No invented tax/government identifiers | **PASS** | synthetic GSTIN labeled; e-invoicing disabled |
| 12 | Uncertain payments not shown successful | **PASS** | references only; payment modal wording |
| 13 | Secrets/customer data protected | **PASS** | secret scan; synthetic data only |
| 14 | Critical test evidence reproducible | **PASS** | TEST_ENVIRONMENT.md; dated logs + fresh-stack addendum; provisioning steps in KNOWN_ISSUES_AND_TODO |

## Fresh-stack revalidation & Release-Readiness Phase (2026-10-27)

Environment fully reset after ISSUE-05: verified backup → `down -v` → fresh stack → apps
reinstalled → reseeded (160-item regional catalog idempotent, GST templates, 300 PERF items).
Settings Console audit completed and host automation verified.

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
- Backup & Restore: `run_backup.ps1` + `schedule_backup.ps1` (Task Scheduler state `Ready`), restore into `scratch-restore.local` PASS (95 sales invoices, 501 items restored)

Full evidence: `docs/testing/TEST_EXECUTION_LOG_2026-10-27.md` addendum, `docs/testing/BUG_REPORT.md` addendum #3, and `docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`.

## Capability status

| Capability | Status |
| --- | --- |
| Windows POS executable (Tauri 2, GNU toolchain) | **IMPLEMENTED_AND_VERIFIED** (built, launched, E2E sales flow verified) |
| Windows NSIS installer workflow (.github/workflows/windows-release.yml) | **WORKFLOW_READY** (GitHub Actions CI workflow + packaging guide configured) |
| Returns/refunds (API + POS UI + idempotency + authorization) | **IMPLEMENTED_AND_VERIFIED** (bench tests; MC-08) |
| India Compliance installed (v16 branch) + GST templates + POS-path GST sale | **IMPLEMENTED_NOT_FULLY_TESTED** (arithmetic verified; accountant + real GSTIN outstanding) |
| Receipt builder (ESC/POS) + duplicate/reprint semantics | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Label builders (ZPL/TSPL) + injection sanitization | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Backup automation (PowerShell runner + Task Scheduler + DR rehearsal) | **IMPLEMENTED_AND_VERIFIED** (Task Scheduler `Ready`; scratch restore verified) |
| Multi-counter/offline suite (11 checks, 2 real SQLite counters) | **IMPLEMENTED_AND_VERIFIED** (11/11 PASS; verdict counting fixed) |
| STOCK-01 full-qty race sale with india_compliance | **RESOLVED — QA-0005 fixed, regression-tested** (api_suite 24/24) |
| Manager Console Settings Page (9 sections, 10 feature flags, live health, GST guard) | **IMPLEMENTED_AND_VERIFIED** (live ERP persistence, System Manager role check, 0 deadlocks) |
| Production deployment checklist (docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | **IMPLEMENTED_AND_VERIFIED** (explicit checklist for legal, tax, secrets, users, devices) |

## Recommendation

**CONDITIONAL GO** for a supervised single-counter pilot with the packaged exe
(login, catalog, billing, local persistence, GST templates, returns, settings console,
and host backup automation all evidenced on a freshly rebuilt stack).

Production revenue use strictly requires:
1. Accountant-approved GST configuration with the store's real GSTIN and verified HSN codes.
2. Physical receipt and label printer hardware validation upon delivery.
3. Execution of the GitHub Actions NSIS workflow on an MSVC runner to produce the signed setup installer.
