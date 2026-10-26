# Test Execution Log — 2026-10-27 (Phase: Windows release, GST, returns, hardware, multi-counter)

All commands from repo root unless noted. Exit codes 0 unless stated. Raw artifacts: `docs/testing/artifacts/`.

| # | Command | Result | Notes |
| --- | --- | --- | --- |
| 1 | `git log/status` + toolchain checks | clean @ 8466a05; no Rust/MSVC present | audit |
| 2 | rustup (gnu) + MSYS2/MinGW install | rustc 1.99.1, gcc via msys64 | user-level, no admin |
| 3 | `npx tauri build --no-bundle` (apps/windows-pos) | 1st fail: dlltool missing → 2nd fail: capability `sql:load` invalid → **3rd+ PASS after fixes** | WIN-001/002; exe 8.2 MB |
| 4 | GUI launch + login + full sale via OS automation | PASS after CORS (tauri-plugin-http), SQL ACL, DB-lock fixes | screenshots `pos-windows-*.png`; server sync-log rows verified |
| 5 | `bench --site frontend migrate` + `run-tests --app departmental_store` | **26 + 4 = 30 tests OK** (incl. 10 new returns tests) | after DocType `is_return/original_invoice` migration |
| 6 | india_compliance `version-16` get-app + install-app | installed; GST templates + synthetic GSTIN configured | `gst_setup.py` |
| 7 | `gst_validation_cases` | intra 5%/18%, inter 18%, rounding, and **real POS path** (₹100 → CGST 9 + SGST 9 = ₹118) all computed correctly | output captured in GST doc |
| 8 | `npx vitest run` (POS) | **80 tests PASS** (incl. 5 label + App render tests) | |
| 9 | `npm run typecheck` | 0 errors | 3 workspaces |
| 10 | `npm run build` POS + dashboard | both PASS | |
| 11 | `node tests/integration/api_suite.mjs` | **23 PASS / 1 FAIL** (STOCK-01 — see below) | artifacts/api-suite-results.json |
| 12 | `npx tsx tests/integration/multi_counter.ts` | **9/9 PASS** | artifacts/multi-counter-results.json |
| 13 | `bash deployment/backup/run_backup.sh` | backup OK (gzip -t + SHA256SUMS) | |
| 14 | DR restore rehearsal → scratch site → drop | PASS | counts verified |
| 15 | Final regression (typecheck/tests/builds/API suite) | see #9–11 | this record |

## Findings on this date

- **PASS**: Windows exe end-to-end (login, device registration, catalog, cart, payment modal, local save + sync, honest verdicts); returns API (30 bench tests); GST math incl. POS path; multi-counter 9/9; DR restore; label/receipt builders.
- **FAIL (under investigation)**: `STOCK-01` — a sale of the full raced stock (2 units seeded, bin shows 2.0) is rejected claiming 1.0 units short. Only appears with india_compliance enabled on the suite's items; the equivalent MC-03 scenario PASSES. Suspect an availability-calc interaction (reservation/UOM) — investigation tracked in BUG_REPORT addendum.
- **Environment notes**: `sites/apps.txt` was repeatedly rewritten losing installed apps after interrupted bench operations; `ensure_app_registered` now rebuilds it from DB truth (runbook + self-heal).

## Prior records

- 2026-10-26 QA cycle: docs/testing/TEST_EXECUTION_LOG.md (kept intact).
