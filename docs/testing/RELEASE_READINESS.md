# Release Readiness — 2026-10-27

Commit: 27e308f + this phase's changes · Supersedes the 2026-10-26 verdict (kept in git history)

## Gate status

| # | Gate | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No duplicate finalized sales on retry | **PASS** | bench BI-01; HTTP IDEMP-01; RELY-03/04; MC-06 |
| 2 | Supported ERPNext workflows only | **PASS** | Sales Invoice is_pos/is_return lifecycle; bench suite |
| 3 | Stock/accounting effects correct | **PASS** | BI-08; returns tests (stock restored, GL posted) |
| 4 | No direct DB writes | **PASS** | whitelisted methods only |
| 5 | Offline transactions durable and visible | **PASS** | SQLite suites; MC-04; Windows GUI |
| 6 | Retries never lose/duplicate | **PASS** | sync-engine suite; MC-05; RELY-03 |
| 7 | Concurrent counter conflicts explicit | **PASS** | MC-03; MC-D1 deadlock retry; MC-08 (refunds) |
| 8 | Cashier permissions server-side | **PASS** | SEC-02/03/04; QA-0004; device registration manager-only (MC-D3) |
| 9 | Refunds/overrides respect permissions | **PASS** | returns bench tests; RETURN_AUTHORIZATION_REQUIRED test |
| 10 | Backup/restore documented and tested | **PASS** | run_backup.sh executed 2026-10-27; scratch-site restore rehearsals (10-26 + 10-27) |
| 11 | No invented tax/government identifiers | **PASS** | synthetic GSTIN labeled; e-invoicing disabled |
| 12 | Uncertain payments not shown successful | **PASS** | references only; payment modal wording |
| 13 | Secrets/customer data protected | **PASS** | secret scan; synthetic data only |
| 14 | Critical test evidence reproducible | **PASS** | TEST_ENVIRONMENT.md; dated logs |

## New capabilities this phase

| Capability | Status |
| --- | --- |
| Windows exe (Tauri 2, GNU toolchain) built + launched + E2E sale flow | **IMPLEMENTED_AND_VERIFIED** (NSIS installer packaging: BLOCKED — MSVC CI runner needed) |
| Returns/refunds (API + POS UI + idempotency + authorization) | **IMPLEMENTED_AND_VERIFIED** (30 bench tests; MC-08) |
| India Compliance installed (v16 branch) + GST templates + POS-path GST sale | **IMPLEMENTED_NOT_FULLY_TESTED** (arithmetic verified; accountant + real GSTIN outstanding) |
| Receipt builder (ESC/POS) + duplicate/reprint semantics | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Label builders (ZPL/TSPL) + injection sanitization | **IMPLEMENTED_AND_VERIFIED** (byte tests; hardware: BLOCKED) |
| Backup script + integrity + DR restore rehearsal | **IMPLEMENTED_AND_VERIFIED** (scheduler registration: operational task) |
| Multi-counter/offline suite (9 scenarios, 2 real SQLite counters) | **IMPLEMENTED_AND_VERIFIED** (9/9 PASS) |
| STOCK-01 full-qty race sale with india_compliance | **FAIL — under investigation** (MC-03 equivalent passes; see BUG_REPORT addendum) |

## Recommendation

**CONDITIONAL GO** for a supervised single-counter pilot with the packaged exe
(login, catalog, billing, local persistence, GST templates, returns, backups all
evidenced). Production revenue use still requires: accountant-approved GST
configuration with the store's real GSTIN/HSN data, physical printer validation,
NSIS installer via an MSVC CI runner, STOCK-01 investigation, and backup
scheduling registration on the store server.
