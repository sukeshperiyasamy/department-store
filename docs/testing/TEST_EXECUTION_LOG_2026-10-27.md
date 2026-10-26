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

---

# Addendum — fresh-stack environment reset + full revalidation (2026-10-27, later session)

Trigger: ISSUE-05 (dev MariaDB contention). Backup `20261027_035610` verified (gzip -t +
SHA256SUMS) BEFORE `docker compose down -v`; volumes confirmed disposable; no valuable data lost.

## Stack provisioning (actual commands, in order)

| # | Command | Duration | Result |
| --- | --- | --- | --- |
| P1 | `bash deployment/backup/run_backup.sh` | ~1 min | backup 20261027_035610 OK |
| P2 | `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp down -v` | ~20 s | 0 volumes remain |
| P3 | `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d` | ~1 min | 10 containers up; db healthy |
| P4 | `docker compose … exec create-site` (compose service) + poll | ~4 min | site `frontend` created: frappe 16.53.0 + erpnext 16.52.1 |
| P5 | `docker cp erpnext-app/departmental_store …:/home/frappe/frappe-bench/apps/` + `bench pip install -e ./apps/departmental_store` + `install-app` | ~1 min | departmental_store 0.1.0 installed (NOTE: `bench --site X pip install` is INVALID — pip is bench-level) |
| P6 | `bench get-app india_compliance https://github.com/resilient-tech/india-compliance.git --branch version-16` + `install-app` | ~2 min | 16.11.0 installed; transient dir-rename race left duplicate `apps/india-compliance` + a bogus `india-compliance` line in apps.txt (removed; pip editable already pointed at the correct `apps/india_compliance`) |
| P7 | `bench --site frontend migrate` + all `install.ensure_*` helpers | ~2 min | module_map_ok=true (41 modules); timezone pinned Asia/Kolkata |
| P8 | Seeds: `demo_run`, `make_qa_pos_profile`, `make_race_items`, cashier a/b, `make_dashboard_user`, `regional_catalog.seed_run`, `gst_setup.setup_run`, `make_perf_items` | catalog seed 2.6 s | 160 catalog items (re-run: 0 created / 160 skipped — idempotent); 3 demo sales SERVER_COMMITTED; GST templates up |

## Validation results (all on the fresh stack)

| # | Command | Result | Notes |
| --- | --- | --- | --- |
| 1 | `node tests/integration/apps_txt_guard.mjs` | **4/4 PASS** (run twice) | G-04 invoice SINV-26-00004/00050; seed idempotency G-03 `created=0/0` |
| 2 | `node tests/integration/api_suite.mjs` | first run 23/24, after QA-0005 fix **24/24 PASS** | STOCK-01 `full=SERVER_COMMITTED`, oversell blocked; RACE-01 `committed=1 review=2` (correct); PERF p95: snapshot 39 ms, incremental 16 ms, sale 136 ms |
| 3 | `npx tsx tests/integration/multi_counter.ts` | **11/11 PASS** (after record() fix) | MC-03 exactly one commit; MC-05 exactly-once retry after backend restart; MC-08 ≤1 refund commit |
| 4 | `node tests/integration/reliability_check.mjs` | **4/4 PASS** | offline → restart → exactly-once → duplicate suppressed |
| 5 | `bench --site frontend run-tests --app departmental_store` | **32/32 OK** (28 + 4; was 30 — +2 QA-0005 regressions) | final run after HSN fixtures |
| 6 | `npm run typecheck` | 0 errors | 3 workspaces |
| 7 | `npm test` | 91 PASS (80 POS + 10 shared-types + 1 dashboard) | |
| 8 | Deadlock check | **0 deadlocks**: `Innodb_deadlocks = 0` via db-container `mariadb` query; 0 log matches (backend, queue-long, queue-short) | across all concurrent suites |
| 9 | ISSUE-02 restart proof | `docker compose stop backend && start backend` → configurator re-ran (StartedAt 23:07:33Z) → apps.txt RETAINED all 4 apps | was wiped to `[erpnext, frappe]` before the pwd.yml merge fix; guard re-run 4/4 after |

## Defects found & fixed in this pass

1. **QA-0005 (critical, product)** — `_posting_date` converted tz-aware `occurred_at` with
   `datetime.astimezone()` (container TZ = UTC) while Frappe posts stock in the site TZ
   (Asia/Kolkata fallback; fresh sites ship `time_zone` EMPTY). Posting date shifted one day back →
   receipts appeared "in the future" of the sale → NegativeStockError on every real stock-item HTTP
   sale. **This was the true root cause of the historical STOCK-01 "environmental" failures.**
   Fixed via `convert_utc_to_timezone(occurred, get_system_timezone())` + `ensure_site_timezone`;
   2 regression tests added. Non-stock PERF items had masked it (no stock validation).
2. **ISSUE-02 infrastructure root cause** — the one-shot configurator re-runs on every
   `docker compose start backend` (compose re-runs exited `service_completed_successfully`
   dependencies) and its `ls -1 apps > sites/apps.txt` wiped custom apps (baked image has only
   frappe+erpnext). pwd.yml now merges via `sort -u` union. Proven by the restart test above.
   `ensure_app_registered` + guard remain as defense in depth; restart steps in
   multi_counter/reliability now self-heal explicitly.
3. **multi_counter.ts verdict bug** — `record()` signature took 3 args but calls passed 4, so
   verdicts landed in `detail`: the summary could never count PASS/FAIL and the script always
   exited 0. Fixed; re-run gives a truthful 11/11.
4. **Misleading module-map diagnostics** — `check_module_map`/`ensure_app_registered` asserted app
   names as module keys (never true for frappe/erpnext/india_compliance); now probe real module
   keys (`accounts`, `gst_india`, `income_tax_india`, `departmental_store`) and report richer state.
5. **HSN compliance on seeds/tests** — IC validates HSN on sales items and links Item Tax rows via
   the GST HSN Code master (record must exist). Demo items now carry plausible HSNs; synthetic
   `999999` for race/PERF/test items; `seeds._ensure_demo_hsn` guarantees master records. The old
   aware-occurred_at test fixture (site-local wall time labeled UTC) now sends true UTC.
6. **bench-execute JSON** — `regional_catalog.seed` and `check_module_map` now return dicts
   (bench prints dicts as clean JSON; json.dumps strings come back repr-escaped and break parsers).

## Environment notes for the next session

- After any app install/update inside the backend container: restart backend + queue workers +
  scheduler, then frontend (stale `.pth` / nginx IP). `docker compose stop/start backend` re-runs
  the configurator (now safe).
- Raw artifacts refreshed: `docs/testing/artifacts/{api-suite-results,apps-txt-guard-results,
  multi-counter-results}.json` (all from the final green runs).
