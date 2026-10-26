# Test Execution Log — 2026-10-26 QA cycle

All times local (UTC+05:30-ish; commands run from repo root `C:\Users\COMPUTER\Downloads\sukesh\departmental` unless noted). Exit codes: 0 unless stated.

| # | Time (approx) | Command | Result / Exit | Notes |
| --- | --- | --- | --- | --- |
| 1 | 23:14 | `git log --oneline; git status; docker compose ps` | clean tree @ 76813d8; stack healthy | audit |
| 2 | 23:15 | `npm run typecheck` | 0 TS errors, exit 0 | 3 workspaces |
| 3 | 23:16 | `npm run test` | 80 tests passed (baseline) | 69 POS + 10 shared + 1 dashboard |
| 4 | 23:18 | `npm run build -w @departmental/windows-pos` | OK | vite |
| 5 | 23:18 | `npm run build -w @departmental/owner-dashboard` | OK | next |
| 6 | 23:19 | `npm audit` | 9 vulnerabilities (2 critical dev) | details → SECURITY_REPORT |
| 7 | 23:19 | `git grep` for session tokens | none committed | secret scan |
| 8 | 23:20 | `python -m compileall erpnext-app/...` | OK | static python |
| 9 | 23:24 | bench `run-tests --app departmental_store` | 16 tests: catalog additions FAILED (SQL aggregate syntax) | QA-0001 work begins |
| 10 | 23:26 | fix `catalog.py` `_new_checkpoint` (dict aggregates); rerun bench | 20 tests OK (16+4) | QA-0001 fixed + regression tests green |
| 11 | 23:40 | create cashier user, race items, 300 perf items (`bench execute departmental_store.seeds.*`) | OK after fixing EAN checksum + duplicate barcode collisions | ERP rejects duplicate barcodes (QA-0007) |
| 12 | 23:55 | `node tests/integration/api_suite.mjs` (1st) | 16 PASS / 8 FAIL | discovered QA-0002 (tz TypeError) + cashier permission gap |
| 13 | 23:57 | fix `_posting_date`; add 3 bench regression tests; rerun bench (OK) + suite | 22 PASS / 2 FAIL | remaining: fixture warehouse mismatch, SEC-01 |
| 14 | 23:58 | add strict transaction_id charset + claim containment; add 2 bench tests; rerun | bench 16 OK; suite 23 PASS / 1 FAIL | QA-0003 fixed; SEC-01 PASS |
| 15 | 00:00 | fix race-item warehouse to POS-profile warehouse; fix suite stock coupling | bench OK; suite 24 PASS / 0 FAIL | STOCK-01, RACE-01, IDEMP-01 stable |
| 16 | 00:05 | `node tests/integration/reliability_check.mjs` | 4 PASS | backend stop → restart → exactly-once commit |
| 17 | 00:08 | `npx vitest run src/ui/BillingScreen.test.tsx` (jsdom) | 4 PASS | then full `npm run test` = 84 |
| 18 | 00:20 | `bench --site frontend backup --with-files` | backup created | backup phase |
| 19 | 00:30 | `bench new-site test-restore.local` + `restore` | restored OK | after flag/password fixes |
| 20 | 00:33 | verify restored site (list-apps, counts, owner_summary) | 87 invoices, 194 sync logs, 300 items, gross ₹4,287 / 87 bills | integrity consistent |
| 21 | 00:35 | `bench drop-site test-restore.local` | removed | cleanup |
| 22 | 00:40 | `npx vitest run --coverage` (POS) | 73 tests; coverage table captured | → COVERAGE_REPORT |
| 23 | 00:45 | full regression: typecheck + `npm run test` + both builds + `api_suite.mjs` | 0 errors; 84 tests; builds OK; 24 PASS | final |

## Environment details

- Docker compose project `departmental-erp` (services: backend, db, frontend, queues, scheduler, websocket) — healthy throughout except intentional stops in step 16.
- Site `frontend` (demo-seeded). Tokens generated per-run via `departmental_store.seeds.make_cashier_user` / `make_dashboard_user` (never stored in the repo).
- Raw outputs: `docs/testing/artifacts/api-suite-results.json`, `docs/testing/artifacts/coverage-pos-vitest.txt`.
