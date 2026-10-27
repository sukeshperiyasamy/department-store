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
- **Manager Console & SaaS Marketing**: Next.js 15 + TS (`apps/owner-dashboard`, port 3100):
  * Public Marketing Website (`/`, `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms`).
  * Customer Onboarding Foundation (live slug availability check against reserved keywords, lead persistence in Frappe MariaDB + resilient `.leads-outbox/`).
  * Authenticated Manager Console (`/app`, `/catalog`, `/sales`, `/inventory`, `/sync`, `/settings`); all data from real ERP APIs, zod-validated.
- **Shared contracts**: `packages/shared-types` (zod schemas = single source of API truth, including tenancy and onboarding contracts).
- **India Compliance** app (branch `version-16`) installed on the test site with synthetic GSTIN.

## 2. Current state (git)

- Branch `main`.
- Recent phases:
  * Phase 1: Tenancy contracts, hostname resolution, Frappe tenant API, ADR-0008.
  * Phase 2: Public SaaS marketing website, customer onboarding entry point, demo request persistence, Next.js route groups (`(marketing)` vs `(app)`).
  * Phase 3: Tenant Provisioning Pipeline and Platform Admin Console:
    - 10-state lifecycle state machine (`PENDING_REVIEW` -> `ACTIVE`, `PROVISIONING_FAILED`, `SUSPENDED`, `ARCHIVED`).
    - Dedicated `Platform Admin` role in Frappe; strict server-side denial for store-level `System Manager`.
    - Asynchronous worker queue (`tabSaaS Provisioning Job`) with atomic row claiming, step tracking, bounded retries, and sanitized error logs.
    - Protected Platform Admin Console at `apps/owner-dashboard/src/app/(admin)/admin/onboarding` with KPIs, tabs, search, inspect drawer, approve/reject/retry/suspend modals.
    - Immutable audit trail in `tabSaaS Provisioning Audit Log` with zero secret leakage. ADR-0009 accepted.
  * Phase 4A: Provisioning Security, Tenant Isolation, and Local Subdomain Routing:
    - Privileged provisioning security: subprocess argument password redaction, dynamic credential retrieval, atomic stale-job reclamation (>600s heartbeat timeout), worker entry point with bounded retries.
    - Server-side role audit: reconciled canonical role `Cashier` (in `install.py`), verified `Platform Admin` exclusive access.
    - Local subdomain routing: Next.js `middleware.ts` with RFC 1123 normalization, trusted proxy IP enforcement (`TRUSTED_PROXY_IPS`), `/admin` lockout on tenant subdomains, and cache isolation (`Vary: Host, Cookie`).
    - 5 authenticated session models formally defined and verified.
    - Two-tenant isolation test suite (`test_tenant_isolation.py`) proving Shop A and Shop B database, auth, and record separation with zero fallback defaults.
  * Phase 4B: Production Ingress, Wildcard TLS, and Tenant Routing:
    - Traefik v3 selected as edge ingress reverse proxy (ADR-0010 accepted).
    - Production and staging deployment templates created in `deployment/ingress/` with Let's Encrypt DNS-01 challenge support for wildcard certificates (`*.departmentstore.in` + apex).
    - Dual-upstream routing matrix: Next.js 15 SSR (`owner-dashboard:3100`) for marketing, platform admin, and tenant web UI; Frappe Nginx (`frontend:8080`) for tenant APIs, assets, WebSockets, and POS billing sync.
    - Strict lifecycle state separation: site provisioning (`PROVISIONED`), hostname verification (`VERIFIED`), and commercial activation (`ACTIVE`); verified through `verify_tenant_hostname` and `activate_tenant` in `provisioning.py`.
    - Staging acceptance runbook (`STAGING_ACCEPTANCE_RUNBOOK.md`) and disaster recovery/rollback runbook (`INGRESS_ROLLBACK_AND_MONITORING.md`).
    - Automated integration suite `tests/integration/ingress_routing_check.mjs` (26/26 PASS).
  * Phase 4C: Staging Deployment and Real-World Acceptance Testing:
    - Preflight audit and compose verification: `tests/integration/staging_preflight_check.mjs` (13/13 PASS).
    - Port exposure verification: public ports strictly 80 & 443; MariaDB (3306), Redis (6379), and Frappe (8000) not exposed publicly.
    - Deployment prerequisite gate: external cloud deployment stopped pending owner-controlled staging domain, authoritative DNS, and DNS-01 API token; exact checklist documented in `STAGING_ACCEPTANCE_RUNBOOK.md`.
    - Status marked `BLOCKED (Missing Staging Prerequisites)`.
- Pushed to `https://github.com/sukeshperiyasamy/department-store` (origin/main). **Never force-push.**

## 3. Module map (where things live)

| Area | Path | Notes |
| --- | --- | --- |
| Sale API (idempotent) | `erpnext-app/.../api/sales.py` | claim-based idempotency via `POS Sale Sync Log`; deadlock retry; Sales Invoice `is_pos` (ADR-0002) |
| Returns API | `erpnext-app/.../api/returns.py` | `submit_pos_return`, `get_original_invoice`; allocated-refund mirroring |
| Catalog API | `erpnext-app/.../api/catalog.py` | `catalog_snapshot` (checkpoint covers items **and** prices — QA-0001) |
| Devices | `erpnext-app/.../api/devices.py` | manager-only `register_device`; cashier-readable `get_device` |
| Reports | `erpnext-app/.../api/reports.py` | `owner_summary`, `server_status`, `stock_alerts`, `recent_invoices` |
| Settings/flags | `erpnext-app/.../api/settings.py` + `.../doctype/departmental_store_settings/` | 10 feature flags; `require_flag()` server guard |
| Tenancy & Leads API | `erpnext-app/.../api/tenant.py` | `resolve_tenant_by_host`, `get_tenant_info`, `list_user_tenants`, `check_slug_availability`, `submit_demo_request`, `submit_onboarding_request` |
| Provisioning & Admin API | `erpnext-app/.../api/provisioning.py` | `list_onboarding_requests`, `get_onboarding_detail`, `approve_onboarding_request`, `reject_onboarding_request`, `retry_provisioning_job`, `claim_next_provisioning_job`, `execute_provisioning_pipeline`, `set_tenant_status` |
| Install/self-heal | `erpnext-app/.../install.py` | roles (`Platform Admin`, `Store Manager`, `POS Cashier`), permissions, language, **apps.txt + module-map repair** |
| Seeds | `erpnext-app/.../seeds.py` | demo fixtures, cashier/manager users, race items, perf items |
| Regional catalog | `erpnext-app/.../regional_catalog.py` | 160 TN demo products w/ Tamil+Tanglish aliases (see §7 BLOCKED) |
| GST setup | `erpnext-app/.../gst_setup.py` | synthetic GSTIN, templates, `gst_validation_cases` |
| POS domain | `apps/windows-pos/src/domain/` | money (minor units), cart, outbox state machine, sync engine, catalog search, receipt/labels |
| POS persistence | `apps/windows-pos/src/local/` | schema v2, repos (atomic sale+outbox), Tauri + Node drivers |
| POS transport | `apps/windows-pos/src/transport/frappe.ts` | zod-validated; Tauri HTTP plugin fetch (no CORS) |
| POS UI | `apps/windows-pos/src/ui/` | Billing/Payment/Returns/Sync screens, preview harness (`preview.html`) |
| Tauri shell | `apps/windows-pos/src-tauri/` | sql + http plugins, `print_raw` spool command, capabilities |
| SaaS Marketing Site | `apps/owner-dashboard/src/app/(marketing)/` | Public pages: `/`, `/features`, `/pricing`, `/request-demo`, `/register`, `/privacy`, `/terms` |
| Platform Admin Console | `apps/owner-dashboard/src/app/(admin)/` | Protected control plane: `/admin`, `/admin/onboarding` |
| Manager Dashboard | `apps/owner-dashboard/src/app/(app)/` | Authenticated shell: `/app`, `/catalog`, `/sales`, `/inventory`, `/sync`, `/settings` |
| Lead Outbox | `apps/owner-dashboard/src/lib/lead-storage.ts` | Resilient local outbox in `.leads-outbox/` mirroring Frappe MariaDB leads |
| Contracts & Tenancy | `packages/shared-types/src/index.ts` + `tenancy.ts` | API zod schemas + SaaS tenant registry, onboarding schemas, provisioning schemas |

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
- Tests: `bench --site frontend run-tests --app departmental_store` (40 PASS: sales 18 / returns 10 / catalog 4 / settings 8);
  `npm run typecheck` (0 errors); `npm run test` (103 TS tests: 80 POS + 14 shared-types + 9 dashboard); `npm run build` both frontends;
  `node tests/integration/apps_txt_guard.mjs` (4 checks); `node tests/integration/api_suite.mjs` (24 checks);
  `npx tsx tests/integration/multi_counter.ts` (11 checks);
  `node tests/integration/reliability_check.mjs` (stops/starts the backend container!).
- Windows exe: toolchain = rustup GNU + MSYS2 mingw64 binutils (no admin needed — see
  `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`); build `npx tauri build --no-bundle` from `apps/windows-pos`
  with both toolchain dirs on PATH; artifact `src-tauri/target/release/windows-pos.exe`.

## 6. Verified test status (as of 2026-10-27, after Settings Console audit + fresh-stack revalidation)

- Environment reset (ISSUE-05): backup `20261027_035610` verified → `docker compose down -v` →
  fresh stack → apps reinstalled → reseeded (160 catalog idempotent, GST templates, 300 PERF items).
- **PASS on the fresh stack**: 40 bench tests (sales 18 / returns 10 / catalog 4 / settings 8); 80 POS vitest +
  14 shared-types + 9 dashboard (103 total TS tests); typecheck 0 errors; apps_txt_guard 4/4; **api_suite 24/24
  (including STOCK-01)**; multi-counter 11/11; reliability 4/4; **zero deadlocks**
  (`Innodb_deadlocks = 0` via live MariaDB query, no deadlock matches in backend/queue logs).
- Settings Console audit verified: unique section input IDs (`toggle-${idPrefix}-${meta.key}`), WCAG switch accessibility (`role="switch"`, `aria-checked`), live database version & deadlock telemetry, server role enforcement (System Manager only; Store Manager & Cashier rejected), and prominent GST demo warning callout.
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

1. ~~Regional catalog seed~~ DONE — 160 products seeded, idempotency verified.
2. ~~Fix STOCK-01~~ RESOLVED as QA-0005 (timezone split in posting_date).
3. ~~Settings UI page~~ DONE — `/settings` on Manager Console reading `get_settings` and mutating via `set_flag`.
4. ~~Backup automation & Task Scheduler~~ DONE — `run_backup.ps1` + `schedule_backup.ps1` active in Windows Task Scheduler ('Ready'); scratch site restore verified.
5. ~~Production deployment checklist~~ DONE — `docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`.
6. ~~Windows NSIS packaging workflow~~ DONE — `.github/workflows/windows-release.yml` configured on MSVC runner.
7. **Voice**: deterministic Tamil/Tanglish parser + transcript-fixture tests (spec §4 of the TN master prompt);
   wire `voice_assistant_enabled` flag; speech engine selection (Vosk vs Whisper) is a separate decision.
8. Accountant GST review → real GSTIN; then enable e-invoicing per legal advice.
9. Physical printer/camera validation when hardware arrives.

---

# FINAL HANDOFF AUDIT — 2026-10-27 (Release-Readiness Phase)

Commit at audit: HEAD · Branch `main`, clean.

## Feature classification (final)

**COMPLETE**: ERP stack deployment; idempotent sales + returns APIs (40 bench tests);
offline SQLite queue + sync engine; POS billing UI; Manager Console (6 pages: Dashboard,
Catalog, Sales, Inventory, Sync & Health, Settings); GST software layer (templates +
POS-path case ₹100→CGST9+SGST9=₹118); multi-counter suite 11/11; reliability 4/4;
backup scripts (PowerShell + Git Bash) + Windows Task Scheduler job active + 3 DR rehearsals;
ESC/POS + ZPL/TSPL builders; feature flags API + settings UI;
production deployment checklist (`docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`);
Windows NSIS CI packaging workflow (`.github/workflows/windows-release.yml`);
Graphify code map; documentation set (28+ docs).

**WORKFLOW READY**: NSIS installer packaging via GitHub Actions (`windows-latest` MSVC runner);
Authenticode signing hook; silent install/uninstall verification tests.

**PARTIAL**: regional catalog seeding (code done, 160 items seeded);
returns screen in packaged exe (API verified, GUI pending device test); shift UI (repo layer only);
voice assistant (parser spec only); MCP adapter (boundary only).

**BLOCKED (Physical / External)**: physical printer tests; camera/OCR hardware tests;
certified accountant GST sign-off on legal GSTIN; speech-engine accuracy.

**NOT STARTED**: e-invoicing/e-waybill (disabled pending legal turnover determination);
GSTR tooling validation; k6 load tests; mobile-native app (responsive PWA covers v1).

## Verified commands (run at Phase 4C completion)

- `node tests/integration/staging_preflight_check.mjs` → 13/13 PASS (compose rendering, port exposure, ACME staging, prerequisite audit)
- `node tests/integration/ingress_routing_check.mjs` → 26/26 PASS (static, dynamic, ports, and simulated ingress routing)
- `bench --site frontend run-tests --app departmental_store` → 78 PASS (40 core store tests + 14 provisioning + 17 tenant registry + 7 tenant isolation)
- `npm run typecheck` → 0 errors across all workspaces (@departmental/owner-dashboard, @departmental/windows-pos, @departmental/shared-types)
- `npm run test` → 170 tests PASS (80 POS + 53 shared-types + 37 owner-dashboard)
- `npm run build --prefix apps/owner-dashboard` → PASS (All 13 routes and Middleware (51.3 kB) built and optimized)
- `node tests/integration/api_suite.mjs` → 24/24 PASS (including STOCK-01, IDEMP-01, SEC-01..04)
- `npx tsx tests/integration/multi_counter.ts` → 11/11 PASS (multi-counter sales, offline sync, idempotency)
- `node tests/integration/reliability_check.mjs` → 4/4 PASS (RELY-01 through RELY-04 across container restarts)
- Git: clean tree; `git ls-files` contains NO credential files

## Exact next steps (priority)

1. Next module: Phase 5 — Shared Mobile Application Foundation (React Native / Flutter / Tauri companion app with QR counter pairing, tenant switcher, and offline sync).
2. Staging domain validation runbook execution once owner provides staging domain, authoritative DNS, and DNS-01 API token using `docs/operations/STAGING_ACCEPTANCE_RUNBOOK.md`.
3. Store owner / accountant GST review with the store's legal 15-digit GSTIN using `docs/release/PRODUCTION_DEPLOYMENT_CHECKLIST.md`.
4. Physical printer + camera validation when hardware arrives at the store.
5. Build Tamil voice parser + transcript fixtures; gate on `voice_assistant_enabled`.
