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

## Fresh-stack revalidation (2026-10-27, this phase)

Environment fully reset after ISSUE-05: verified backup → `down -v` → fresh stack → apps
reinstalled → reseeded (160-item regional catalog idempotent, GST templates, 300 PERF items).
Results: apps_txt_guard **4/4**, api_suite **24/24** (STOCK-01 now PASS), multi_counter **11/11**,
reliability **4/4**, bench **32/32**, typecheck 0 errors, 91 TS unit tests, **zero deadlocks**.
Full evidence: `docs/testing/TEST_EXECUTION_LOG_2026-10-27.md` addendum.

Defects resolved by this pass: **QA-0005** (timezone conversion — the true STOCK-01 root cause;
2 regression tests), **ISSUE-02 infrastructure root cause** (configurator re-run overwrote
apps.txt on backend restart; now merges; proven by restart test), multi_counter verdict-counting
bug, module-map diagnostic assertions, HSN compliance on all seed/test items.

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

## Recommendation

**CONDITIONAL GO** for a supervised single-counter pilot with the packaged exe
(login, catalog, billing, local persistence, GST templates, returns, backups all
evidenced on a freshly rebuilt stack). Production revenue use still requires:
accountant-approved GST configuration with the store's real GSTIN/HSN data,
physical printer validation, NSIS installer via an MSVC CI runner, and backup
scheduling registration on the store server.
