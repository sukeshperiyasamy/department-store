# Testing Report — Departmental Store ERP

- **Commit tested:** `76813d8` (main) + QA fixes applied during this cycle
- **Date:** 2026-10-26
- **Environment:** Windows 11 dev workstation · Docker Desktop (ERPNext v16.52.1, MariaDB 11.8, Redis) · Node 24.18 · TypeScript 5.6 · Python 3.14 host / container-managed Python for bench tests

## Executive summary

The core platform was exercised end-to-end: 20 bench (ERPNext-integration) tests, 84 TypeScript unit/component tests, a 24-test live HTTP integration/contract/security/performance suite, a 4-check reliability scenario (backend restart with idempotent retry), and a full **backup → restore into a scratch site** rehearsal. All executed suites pass.

The QA cycle found and fixed **three real defects** — most notably **QA-0002 (Critical): every HTTP sale carrying an `occurred_at` timestamp crashed before posting**, which escaped the original bench suite because those tests never sent the timestamp field. Two more defects (stale prices after incremental catalog sync; a 500-with-stack-trace leak on malformed transaction IDs) were found by the new suites and fixed with regression tests.

**Release recommendation: CONDITIONAL GO** for internal pilot use — see RELEASE_READINESS.md. Production go-live remains blocked on hardware validation, GST/compliance configuration, and the offline-invoice-numbering design (pre-existing gaps, unchanged by this cycle).

## Scope and exclusions

In scope: Frappe app (sales sync API, catalog API, devices, reports), POS domain/persistence/transport/UI components, shared contracts, owner dashboard data layer, ERP posting integrity, offline sync guarantees, security of the custom APIs, performance of the custom endpoints.

Excluded / not applicable: Rust/Tauri shell compilation (no toolchain — BLOCKED), physical printers/scanners (no hardware — BLOCKED), voice assistant (not implemented), GST compliance certification (requires accountant), CI pipeline (not configured in repo), multi-window/multi-counter desktop soak (needs the built desktop app).

## Exact commands executed (all exit 0 unless noted)

| Command | Result |
| --- | --- |
| `npm run typecheck` | 0 errors across 3 workspaces |
| `npm run test` | 84 tests passed (73 POS + 10 shared-types + 1 dashboard) |
| `npm run build -w @departmental/windows-pos` | vite build OK |
| `npm run build -w @departmental/owner-dashboard` | next build OK |
| `npx vitest run --coverage` (POS) | see COVERAGE_REPORT.md |
| `npm audit` | 9 vulnerabilities (see SECURITY_REPORT.md) |
| `python -m compileall` (Frappe app) | OK |
| `bench --site frontend run-tests --app departmental_store` | 20 passed (16 + 4) |
| `node tests/integration/api_suite.mjs` | 24 PASS / 0 FAIL |
| `node tests/integration/reliability_check.mjs` | 4 PASS |
| `bench --site frontend backup --with-files` → `bench new-site test-restore.local` → `bench restore` → data verification → `bench drop-site` | restored site consistent |

## Results by category

| Category | Executed | Passed | Failed | Blocked | Not run | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Static/build | 6 | 6 | 0 | 0 | 0 | baseline table above; artifacts/coverage |
| Unit (TS) | 84 | 84 | 0 | 0 | 0 | vitest output |
| Unit/integration (bench) | 20 | 20 | 0 | 0 | 0 | bench output |
| API contract/security/perf (HTTP) | 24 | 24 | 0 | 0 | 0 | artifacts/api-suite-results.json |
| Offline/sync (engine + SQLite) | 27 | 27 | 0 | 0 | 0 | sync-engine + repos suites |
| Reliability | 4 | 4 | 0 | 0 | 0 | reliability_check output |
| Backup/restore | 1 | 1 | 0 | 0 | 0 | console verification (87 invoices, 194 sync logs) |
| E2E desktop POS | — | — | — | 1 | 0 | needs compiled Tauri shell |
| Hardware | — | — | — | — | N/A | no devices connected |
| Performance (load tools) | partial | — | — | 1 | 1 | HTTP latency measured; k6/Locust not installed |

## Critical user journeys and outcomes

1. **Basic sale (HTTP, as cashier)** — PASS: login token → submit → SERVER_COMMITTED, server re-priced (client rate ignored), stock + GL entries verified in bench suite.
2. **Duplicate submission** — PASS: same transaction_id returns recorded invoice with `duplicate: true`; no second invoice (bench + HTTP).
3. **Lost response / backend restart** — PASS: transaction submitted while backend down is not committed; after restart the same id commits exactly once (reliability_check).
4. **Oversell** — PASS: exhausting stock then selling more → review result; ERP stock error surfaced (STOCK-01).
5. **Concurrent counters, 3 parallel submits for 1 unit** — PASS: exactly 1 commit, 2 explicit review conflicts, no duplicates (RACE-01).
6. **Price change propagation** — PASS after QA-0001 fix: incremental snapshot returns exactly the changed item (PERF-02).
7. **Backup restore** — PASS: scratch site restored with apps + data; owner_summary recomputed consistently.
8. **Desktop POS UI journey** — BLOCKED at the shell level (no Rust toolchain); billing screen behavior covered by 4 jsdom component tests.

## Defect summary

| ID | Severity | Status | One-line |
| --- | --- | --- | --- |
| QA-0002 | **Critical** | FIXED + regression tests | HTTP sale with `occurred_at` always failed (tz-aware vs naive datetime TypeError) |
| QA-0001 | High | FIXED + regression tests | price-only changes never reached counters via incremental sync |
| QA-0003 | High | FIXED + regression tests | malformed transaction_id caused HTTP 500 with internal stack trace |
| QA-0004 | Medium | FIXED | cashier role could not bill over HTTP (missing perms configuration) |
| QA-0005 | Low | FIXED (suite) | API suite depended on shared demo stock → flaky |
| QA-0006 | Informational | Accepted (behavior noted) | backend-stopped-but-proxy-up returns 502 HTML; engine retries with backoff |
| QA-0007 | Informational | Positive finding | ERPNext rejects duplicate barcodes globally (integrity confirmed) |

Full register: BUG_REPORT.md.

## Security findings (summary)

No secrets committed (scanned). Unauthenticated and unauthorized access correctly denied on all custom endpoints (401/403 matrix). Injection payloads rejected via strict transaction-ID charset; no stack leaks in structured responses post-QA-0003. Dependency audit: 9 advisories — zod (high, runtime, mitigated by bounded schemas; upgrade planned), tinypool (critical, dev-only test runner), postcss (high, build-time), esbuild/vite (moderate, dev server). Details and limitations: SECURITY_REPORT.md.

## Performance measurements (dev container, provisional targets)

- Catalog snapshot, 305 items full: **p50 30 ms / p95 32 ms** (n=15)
- Incremental snapshot after 1 price change: **p50 16 ms**, returns exactly 1 item
- Sale submission (full ERP posting: pricing, stock ledger, GL): **p50 ~140 ms / p95 ~155 ms** (n=10)

## Remaining risks and limitations

1. Tauri desktop binary not compiled here; E2E with real UI unverified (BLOCKED).
2. Hardware printing/scanning unverified (BLOCKED — no devices).
3. GST/India Compliance not configured; offline invoice numbering legally unvalidated (pre-existing).
4. Coverage: domain 86.8% / local 79.6% / transport 78.5% statements; UI screens partially covered; Frappe-side reports endpoints have no automated tests yet.
5. npm audit advisories (dev-toolchain) — upgrade plan documented, not executed this cycle.

## Release recommendation

**CONDITIONAL GO** for internal pilot (single counter, supervised, demo/test data). **NO-GO for production revenue use** until the production gates in RELEASE_READINESS.md (hardware, GST config, invoice numbering, backup schedule, Tauri build) are cleared with evidence.
