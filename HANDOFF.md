# HANDOFF — Departmental Store ERP

Handoff date: 2026-10-27 · Branch: `main` · See "Current state" below for HEAD.
Audience: next AI coding agent or developer. Read this file top to bottom before changing anything.

## 1. What this project is

A departmental-store ERP for a single store with 2–3 Windows POS counters:

- **Backend**: ERPNext v16.52.1 on Frappe v16.53.0, MariaDB 11.8, Redis — deployed via the official
  `frappe_docker` compose stack (`deployment/erpnext/pwd.yml`, project `departmental-erp`, site `frontend`, port 8080).
- **Custom Frappe app** `departmental_store` (in `erpnext-app/departmental_store/`): idempotent POS sale/return
  submission, catalog snapshot, device registry, reporting APIs, feature-flag settings, seeds, GST setup helpers.
- **Windows POS**: Tauri 2 + React + TypeScript (`apps/windows-pos`) with counter-local SQLite (durable outbox,
  offline queue), ESC/POS + ZPL/TSPL builders, Tamil/Tanglish-ready catalog search.
- **Manager Console**: Next.js 15 + TS (`apps/owner-dashboard`, port 3100) — dashboard, catalog, sales,
  inventory alerts, sync health; all data from real ERP APIs, zod-validated.
- **Shared contracts**: `packages/shared-types` (zod schemas = single source of API truth).
- **India Compliance** app (branch `version-16`) installed on the test site with synthetic GSTIN.

## 2. Current state (git)

- Branch `main`, clean tree. Recent commits: `e3ddacd` (gitignore creds doc) → `f9508fd` (untrack leaked
  tok.env, rotate tokens) → `51d86d9` (Windows/GST/returns/multi-counter phase) → `27e308f` (returns) →
  earlier phases in `git log`.
- Pushed to `https://github.com/sukeshperiyasamy/department-store` (origin/main). **Never force-push.**
- All work through 2026-10-27 is committed and pushed unless noted in §7.

## 3. Module map (where things live)

| Area | Path | Notes |
| --- | --- | --- |
| Sale API (idempotent) | `erpnext-app/.../api/sales.py` | claim-based idempotency via `POS Sale Sync Log`; deadlock retry; Sales Invoice `is_pos` (ADR-0002) |
| Returns API | `erpnext-app/.../api/returns.py` | `submit_pos_return`, `get_original_invoice`; allocated-refund mirroring |
| Catalog API | `erpnext-app/.../api/catalog.py` | `catalog_snapshot` (checkpoint covers items **and** prices — QA-0001) |
| Devices | `erpnext-app/.../api/devices.py` | manager-only `register_device`; cashier-readable `get_device` |
| Reports | `erpnext-app/.../api/reports.py` | `owner_summary`, `server_status`, `stock_alerts`, `recent_invoices` |
| Settings/flags | `erpnext-app/.../api/settings.py` + `.../doctype/departmental_store_settings/` | 10 feature flags; `require_flag()` server guard |
| Install/self-heal | `erpnext-app/.../install.py` | roles, permissions, language, **apps.txt + module-map repair** |
| Seeds | `erpnext-app/.../seeds.py` | demo fixtures, cashier/manager users, race items, perf items |
| Regional catalog | `erpnext-app/.../regional_catalog.py` | 160 TN demo products w/ Tamil+Tanglish aliases (see §7 BLOCKED) |
| GST setup | `erpnext-app/.../gst_setup.py` | synthetic GSTIN, templates, `gst_validation_cases` |
| POS domain | `apps/windows-pos/src/domain/` | money (minor units), cart, outbox state machine, sync engine, catalog search, receipt/labels |
| POS persistence | `apps/windows-pos/src/local/` | schema v2, repos (atomic sale+outbox), Tauri + Node drivers |
| POS transport | `apps/windows-pos/src/transport/frappe.ts` | zod-validated; Tauri HTTP plugin fetch (no CORS) |
| POS UI | `apps/windows-pos/src/ui/` | Billing/Payment/Returns/Sync screens, preview harness (`preview.html`) |
| Tauri shell | `apps/windows-pos/src-tauri/` | sql + http plugins, `print_raw` spool command, capabilities |
| Dashboard | `apps/owner-dashboard/src/` | shell + (app) route group; lib/frappe-server.ts fetchers |
| Contracts | `packages/shared-types/src/index.ts` | all API zod schemas; `api_version` pinned to 1 |

## 4. Authoritative docs (read next)

- `docs/api-contracts.md` — API v1 request/response shapes and error codes.
- `docs/offline-sync-policy.md` — durability rules, state machine, clock skew.
- `docs/architecture-decisions.md` — ADRs (ADR-0002: Sales Invoice over POS Invoice — critical).
- `docs/deployment.md`, `docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`, `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`.
- `docs/compliance/GST_IMPLEMENTATION_AND_VALIDATION.md` — what's verified vs accountant-pending.
- `docs/testing/TESTING_REPORT.md`, `TEST_EXECUTION_LOG_2026-10-27.md`, `MULTI_COUNTER_AND_OFFLINE_REPORT.md`, `RELEASE_READINESS.md`.
- `docs/ui-ux/DESIGN_SYSTEM.md` + `MODULE_SCREEN_AUDIT.md`.
- `docs/known-limitations.md`, `docs/implementation/KNOWN_GAPS.md`, `docs/testing/BUG_REPORT.md`.
- **Credentials**: `docs/local-demo-credentials.md` — **gitignored, local-only**. Never commit; placeholders
  live in `apps/owner-dashboard/.env.example`.

## 5. Environment & commands

- Docker stack: `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d` (site `frontend`,
  ERP on :8080, dashboard on :3100). Site credentials: see gitignored `docs/local-demo-credentials.md`.
- Seed/maintenance (inside `backend` container, site `frontend`):
  - `bench --site frontend execute departmental_store.install.ensure_app_registered` — **run this whenever any
    bench command says "Module … not found"**; it repairs `sites/apps.txt` + redis module maps (recurring issue, §7).
  - Seeds: `…seeds.demo --kwargs "{'run': True}"`, `…seeds.make_dashboard_user`, `…seeds.make_cashier_user_a/_b`,
    `…seeds.make_qa_pos_profile`, `…seeds.make_race_items`, `…seeds.make_perf_items --kwargs "{'n': 300}"`,
    `…regional_catalog.seed` (regional catalog), `…gst_setup.setup --kwargs "{'run': True}"`.
- Tests: `bench --site frontend run-tests --app departmental_store` (30 PASS);
  `npm run typecheck` (0 errors); `npm run test` (86 TS tests); `npm run build` both frontends;
  `node tests/integration/api_suite.mjs`; `npx tsx tests/integration/multi_counter.ts`;
  `node tests/integration/reliability_check.mjs` (stops/starts the backend container!).
- Windows exe: toolchain = rustup GNU + MSYS2 mingw64 binutils (no admin needed — see
  `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`); build `npx tauri build --no-bundle` from `apps/windows-pos`
  with both toolchain dirs on PATH; artifact `src-tauri/target/release/windows-pos.exe`.

## 6. Verified test status (as of 2026-10-27)

- **PASS**: 30 bench tests (sales/returns/catalog); 80 POS vitest + 10 shared-types + 1 dashboard;
  typecheck 0 errors; both builds; API suite 23/24; multi-counter 9/9; reliability 4/4; DR restore; GST math
  incl. POS path; Windows exe E2E flow (login→catalog→cart→payment→sync→verdict).
- **FAIL (open)**: `STOCK-01` in api_suite — full-qty raced sale rejected claiming 1.0 short while Bin shows 2.0,
  only with india_compliance enabled; equivalent MC-03 passes. Investigate `get_stock_availability` path.
- **BLOCKED**: physical printer + camera hardware tests (no devices); NSIS installer (MSVC CI runner);
  speech-recognition accuracy (no engine chosen); regional catalog seed execution (see §7).
- **NOT RUN**: GSTR filing tooling; mobile-native (PWA only); load testing (k6 not installed).

## 7. Critical pitfalls (read twice)

1. **`sites/apps.txt` churn**: interrupted bench operations rewrite `sites/apps.txt` dropping installed apps and
   the redis `app_modules`/`installed_app_modules` caches go stale → every DocType insert fails with
   "Module … not found". **Fix**: `bench --site frontend execute departmental_store.install.ensure_app_registered`
   then `bench --site frontend clear-cache` and restart the backend. This recurred many times.
2. **ERPNext v16 POS Invoice does not move stock** — that's why the platform posts **Sales Invoice `is_pos`**
   (ADR-0002). Do not "fix" this back to POS Invoice.
3. **Bench kwargs quoting** through Git Bash mangles args — prefer no-arg seed wrapper functions (pattern
   `make_cashier_user_a/_b`).
4. **IPython console in docker hides multiline output** — use `bench execute` (prints return value) or write
   results to a file.
5. **Flag defaults**: `Departmental Store Settings` row created via API defaults to zeros; use
   `ensure_default_settings` (install) or set the demo row explicitly. Opt-in modules (voice/AI/MCP/camera)
   default OFF by design.
6. **Commit hygiene**: never commit token files (`tok.*` gitignored; a leak happened in `e484d5e`, rotated +
   documented); never force-push; demo barcodes are in-store range `20…` (never claim real products).
7. **India Compliance** enforces HSN (6/8 digits, must exist in GST HSN Code doctype) on every new sellable
   item — seeds include it; keep it that way.

## 7b. Code intelligence — Graphify (installed 2026-10-27)

`graphifyy 0.9.96` (Apache-2.0, pip) builds a queryable knowledge graph of the repo.
CLI lives in the Python `Scripts/` dir (add it to PATH: `%USERPROFILE%/AppData/Local/Python/pythoncore-3.14-64/Scripts`).

**Setup/refresh (verified commands)**:
```bash
graphify install            # copies the /graphify skill into platform config dirs
graphify . --code-only      # rebuild graph from local AST — NO API key needed
graphify update .           # incremental refresh after code changes (zero API cost)
```

**Artifacts (gitignored)**: `graphify-out/GRAPH_REPORT.md` (human report), `graph.json`
(1005 nodes / 1951 links / 76 communities, relations: contains/calls/imports/imports_from/
method/references), `graph.html`, `manifest.json`, `cache/`. The graph records
`built_at_commit` — compare against `git rev-parse HEAD` before trusting it; stale means
run `graphify update .` first.

**Key findings (from commit a83d9494)**:
- God nodes: `PosStore` (33 edges), `SyncRecord` (27), `make_item()` (25, test fixture hub),
  `FrappeClient` (24), `CatalogItem` (19), `AppServices` (18), `SaleReviewError`/`SaleResponse` (17).
- Relation mix: 649 contains · 480 calls · 260 imports · 203 imports_from · 150 method · 79 references.
- Surprise: `tests/integration/multi_counter.ts` **directly instantiates `FrappeClient` and
  `PosStore`** — behavioral changes to those classes ripple into the integration suite.
- Full LLM/doc-image semantic mode is intentionally NOT configured (requires GEMINI/OPENAI/
  ANTHROPIC API key). Do not add a key; `--code-only` is sufficient for code navigation.

**How future agents should use it**: before grepping or reading many files for
architecture/refactor/bug questions, query `graphify-out/graph.json` first (directly, or via
`graphify path "A" "B"` / `graphify explain "X"`), locate exact files + call/import edges, then
read only those files. Grep only for strings the graph misses (SQL literals, config values).

## 8. Next steps, priority order

1. **Run `regional_catalog.seed`** (code done, 160 products) — blocked only by the apps.txt churn; self-heal
   first, then seed; verify counts + Tamil alias search. Doc: `docs/catalog/REGIONAL_DEMO_CATALOG.md` (to write).
2. **Fix STOCK-01** availability mismatch (india_compliance + POS stock check) — BUG_REPORT addendum has repro.
3. **Voice**: deterministic Tamil/Tanglish parser + transcript-fixture tests (spec §4 of the TN master prompt);
   wire `voice_assistant_enabled` flag; speech engine selection (Vosk vs Whisper) is a separate decision.
4. **Settings UI page** on the Manager Console reflecting `get_settings`/`set_flag` (API exists).
5. **NSIS installer** on an MSVC CI runner; replace demo capabilities scope with the store's URL pattern.
6. Accountant GST review → real GSTIN; then enable e-invoicing per legal advice.
7. Physical printer/camera validation when hardware arrives.
8. Register the backup scheduler on the store server (script + runbook ready).

---

# FINAL HANDOFF AUDIT — 2026-10-27 (post Graphify integration)

Commit at audit: `4b937de` · Branch `main`, clean, pushed. Graphify refreshed to HEAD
(1325 nodes / 2394 links; SyncEngine consumers: `ui/services.ts` + `tests/integration/multi_counter.ts`).

## Feature classification (final)

**COMPLETE**: ERP stack deployment; idempotent sales + returns APIs (30 bench tests);
offline SQLite queue + sync engine; POS billing UI; Manager Console (5 pages); GST
software layer (templates + POS-path case ₹100→CGST9+SGST9=₹118); multi-counter suite
9/9; backup script + 2 DR rehearsals; ESC/POS + ZPL/TSPL builders; feature flags API;
Graphify code map; documentation set (25+ docs).

**PARTIAL**: regional catalog seeding (code done, blocked by apps.txt churn — ISSUE-02);
returns screen in packaged exe (API verified, GUI pending); shift UI (repo layer only);
settings UI page (API only); voice assistant (parser spec only); MCP adapter (boundary only).

**BLOCKED**: physical printer tests; camera/OCR hardware tests; NSIS installer (MSVC CI);
STOCK-01 fix (india_compliance availability mismatch — BUG_REPORT); speech-engine accuracy.

**NOT STARTED**: e-invoicing/e-waybill; GSTR tooling validation; k6 load tests;
mobile-native app (responsive PWA covers v1); Tamil voice speech engine integration.

## Verified commands (run at audit)

- `npm run typecheck` → 0 errors · `npm run test` → 91 tests PASS (81 POS + 10 contracts)
- ERP live: ping 200; feature flags returned correctly via API
- Git: clean tree; `git ls-files` contains NO credential files (tok.*, .env.local,
  local-demo-credentials.md, graphify-out/) — all gitignored and verified

## Known bugs / technical debt / security risks

| Item | Severity | Where |
| --- | --- | --- |
| STOCK-01: full-qty race sale rejected (1.0 short, bin=2.0) under india_compliance | Medium | BUG_REPORT; api_suite STOCK-01 |
| apps.txt/module-map churn after interrupted bench ops | Medium (self-heal exists) | install.ensure_app_registered |
| Raw HTML in server error messages shown in POS dialog | Low | returns.py/sales.py messages |
| Server messages echoed raw into review dialog (HTML) | Low | PaymentScreen/ReturnsScreen |
| Dev passwords (`admin`) in pwd.yml | Info | demo-only stack; rotate for production |
| No k6/load tests; single-warehouse GST cases | Debt | PERFORMANCE_REPORT |

## Exact next steps (priority)

1. Fix ISSUE-01 apps.txt churn root cause (bench rewriter) → then run
   `regional_catalog.seed` and verify 160 products + Tamil alias search.
2. Fix STOCK-01 (instrument get_stock_availability under india_compliance).
3. Build Tamil voice parser + transcript fixtures (spec: TN master prompt §4);
   gate on `voice_assistant_enabled`.
4. Settings UI page (flags) on Manager Console.
5. NSIS installer via MSVC CI; narrow HTTP capability scope to store server URL.
6. Accountant GST review → real GSTIN; k6 load test.
7. Physical printer/camera validation on hardware.
