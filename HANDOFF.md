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
- Seed/maintenance (inside `backend` container, site `frontend`; all seeds are idempotent):
  - `bench --site frontend execute departmental_store.install.ensure_app_registered` — **run this whenever any
    bench command says "Module … not found"**; it repairs `sites/apps.txt` + redis module maps.
  - No-arg wrappers (Git-Bash-safe): `…seeds.demo_run`, `…seeds.make_dashboard_user`,
    `…seeds.make_cashier_user_a/_b`, `…seeds.make_qa_pos_profile`, `…seeds.make_race_items`,
    `…seeds.make_perf_items --kwargs "{'n': 300}"`, `…regional_catalog.seed_run` (160 TN products),
    `…gst_setup.setup_run`, `…install.ensure_site_timezone` (pins Asia/Kolkata on fresh sites).
  - **`bench pip` is bench-level, NOT site-level**: `bench pip install -e ./apps/departmental_store`
    (no `--site`). After installing/updating apps, restart backend + queue workers + scheduler
    (long-lived processes don't re-read `.pth`), then restart frontend (nginx re-resolves backend IP).
- Tests: `bench --site frontend run-tests --app departmental_store` (37 PASS: sales 18 / returns 10 / catalog 4 / settings 5);
  `npm run typecheck` (0 errors); `npm run test` (103 TS tests: 80 POS + 14 shared-types + 9 dashboard); `npm run build` both frontends;
  `node tests/integration/apps_txt_guard.mjs` (4 checks); `node tests/integration/api_suite.mjs` (24 checks);
  `npx tsx tests/integration/multi_counter.ts` (11 checks);
  `node tests/integration/reliability_check.mjs` (stops/starts the backend container!).
- Windows exe: toolchain = rustup GNU + MSYS2 mingw64 binutils (no admin needed — see
  `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`); build `npx tauri build --no-bundle` from `apps/windows-pos`
  with both toolchain dirs on PATH; artifact `src-tauri/target/release/windows-pos.exe`.

## 6. Verified test status (as of 2026-10-27, after settings page + fresh-stack revalidation)

- Environment reset (ISSUE-05): backup `20261027_035610` verified → `docker compose down -v` →
  fresh stack → apps reinstalled → reseeded (160 catalog idempotent, GST templates, 300 PERF items).
- **PASS on the fresh stack**: 37 bench tests (sales 18 / returns 10 / catalog 4 / settings 5); 80 POS vitest +
  14 shared-types + 9 dashboard (103 total TS tests); typecheck 0 errors; apps_txt_guard 4/4; **api_suite 24/24
  (including STOCK-01)**; multi-counter 11/11; reliability 4/4; **zero deadlocks**
  (`Innodb_deadlocks = 0`, no deadlock matches in backend/queue logs).
- STOCK-01 was closed as **QA-0005, a real product bug** (timezone conversion), not environmental —
  see §7 pitfall 8. ISSUE-05 (DB contention) did not reproduce on the fresh volumes.
- **BLOCKED**: physical printer + camera hardware tests (no devices); NSIS installer (MSVC CI runner);
  speech-recognition accuracy (no engine chosen).
- **NOT RUN**: GSTR filing tooling; mobile-native (PWA only); load testing (k6 not installed).

## 7. Critical pitfalls (read twice)

1. **`sites/apps.txt` churn — TWO causes, both fixed 2026-10-27 but keep the guard**:
   (a) the one-shot `configurator` service re-runs on every `docker compose start backend`
   (compose re-runs exited `service_completed_successfully` dependencies) and its
   `ls -1 apps > sites/apps.txt` used to wipe custom apps (its container only has frappe+erpnext
   baked in) — pwd.yml now MERGES via `sort -u` union; (b) stale redis module caches after
   interrupted bench ops. **Fix of last resort**:
   `bench --site frontend execute departmental_store.install.ensure_app_registered` then
   `bench --site frontend clear-cache` and restart the backend.
2. **ERPNext v16 POS Invoice does not move stock** — that's why the platform posts **Sales Invoice `is_pos`**
   (ADR-0002). Do not "fix" this back to POS Invoice.
3. **Bench kwargs quoting** through Git Bash mangles args — prefer no-arg seed wrapper functions
   (`demo_run`, `seed_run`, `setup_run`, `make_cashier_user_a/_b`).
4. **IPython console in docker hides multiline output** — use `bench execute` (prints return value) or write
   results to a file. Note `bench execute` MASKS the real exception with a NameError eval fallback —
   debug a failing seed via `bench console`.
5. **Flag defaults**: `Departmental Store Settings` row created via API defaults to zeros; use
   `ensure_default_settings` (install) or set the demo row explicitly. Opt-in modules (voice/AI/MCP/camera)
   default OFF by design.
6. **Commit hygiene**: never commit token files (`tok.*` gitignored; a leak happened in `e484d5e`, rotated +
   documented); never force-push; demo barcodes are in-store range `20…` (never claim real products).
7. **India Compliance** enforces HSN on every new **sales** item (length-validated per GST Settings; Item Tax
   rows link through the GST HSN Code master — the record must EXIST, not just be well-formed). Seeds/tests
   create synthetic `999999` + plausible demo HSNs via `seeds._ensure_demo_hsn`; keep that pattern for any
   new seed. Keep GST Settings `validate_hsn_code` ON — the GST validation suite depends on it.
8. **Timezone split (QA-0005)**: containers run UTC while the Frappe site timezone is Asia/Kolkata.
   NEVER convert timestamps with `datetime.astimezone()` in server code (follows the container TZ);
   use `frappe.utils.convert_utc_to_timezone(dt, get_system_timezone())`. `_posting_date` and
   `ensure_site_timezone` exist because of this; a regression here turns every receipt into
   "future stock" and fails NegativeStockError. The bench `pip freeze` env belongs to the container
   that installed it — other containers (queues) share `sites/` but NOT the Python env; restart all
   python services after installing apps.
9. **Bench returns**: functions that return json.dumps STRINGS get printed repr-escaped by
   `bench execute` (breaks JSON parsers); return dicts instead — bench prints them as clean JSON.

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

1. ~~Regional catalog seed~~ DONE — 160 products seeded, idempotency verified. Remaining: write `docs/catalog/REGIONAL_DEMO_CATALOG.md` and wire the catalog into POS defaults.
2. ~~Fix STOCK-01~~ RESOLVED as QA-0005 (timezone split in posting_date).
3. ~~Settings UI page~~ DONE — `/settings` on Manager Console reading `get_settings` and mutating via `set_flag`.
4. **Voice**: deterministic Tamil/Tanglish parser + transcript-fixture tests (spec §4 of the TN master prompt);
   wire `voice_assistant_enabled` flag; speech engine selection (Vosk vs Whisper) is a separate decision.
5. **NSIS installer** on an MSVC CI runner; replace demo capabilities scope with the store's URL pattern.
6. Accountant GST review → real GSTIN; then enable e-invoicing per legal advice.
7. Physical printer/camera validation when hardware arrives.
8. Register the backup scheduler on the store server (script + runbook ready).

---

# FINAL HANDOFF AUDIT — 2026-10-27 (post Settings Page & Graphify refresh)

Commit at audit: HEAD · Branch `main`, clean. Graphify refreshed to HEAD
(1416 nodes / 2600 links / 114 communities).

## Feature classification (final)

**COMPLETE**: ERP stack deployment; idempotent sales + returns APIs (37 bench tests);
offline SQLite queue + sync engine; POS billing UI; Manager Console (6 pages: Dashboard,
Catalog, Sales, Inventory, Sync & Health, Settings); GST software layer (templates +
POS-path case ₹100→CGST9+SGST9=₹118); multi-counter suite 11/11; reliability 4/4;
backup script + 2 DR rehearsals; ESC/POS + ZPL/TSPL builders; feature flags API + settings UI;
Graphify code map; documentation set (25+ docs).

**PARTIAL**: regional catalog seeding (code done, 160 items seeded);
returns screen in packaged exe (API verified, GUI pending device test); shift UI (repo layer only);
voice assistant (parser spec only); MCP adapter (boundary only).

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
| STOCK-01: suite failure was environmental — isolated repro PROVED stock lifecycle correct (bin 2→0, clean SLEs); residual suite failures are ISSUE-05 dev-DB contention (deadlocks on inserts, retry succeeds) | Medium→Low | HANDOFF audit; apps_txt_guard results |
| apps.txt/module-map churn after interrupted bench ops | Medium (self-heal exists) | install.ensure_app_registered |
| Raw HTML in server error messages shown in POS dialog | Low | returns.py/sales.py messages |
| Server messages echoed raw into review dialog (HTML) | Low | PaymentScreen/ReturnsScreen |
| Dev passwords (`admin`) in pwd.yml | Info | demo-only stack; rotate for production |
| No k6/load tests; single-warehouse GST cases | Debt | PERFORMANCE_REPORT |

## Exact next steps (priority)

1. ISSUE-02 apps.txt churn: PERMANENT FIX DEPLOYED (union-of-sources self-heal in install.py); ISSUE-02 CLOSED. Verify stability across future bench operations via tests/integration/apps_txt_guard.mjs.
2. STOCK-01 CLOSED as environmental (ISSUE-05): isolated repro proved stock lifecycle correct. Reset dev stack when contention blocks testing.
3. Build Tamil voice parser + transcript fixtures (spec: TN master prompt §4);
   gate on `voice_assistant_enabled`.
4. Settings UI page (flags) on Manager Console.
5. NSIS installer via MSVC CI; narrow HTTP capability scope to store server URL.
6. Accountant GST review → real GSTIN; k6 load test.
7. Physical printer/camera validation on hardware.
