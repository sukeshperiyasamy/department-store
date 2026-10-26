# PROJECT_OVERVIEW — Departmental Store ERP

A production-oriented retail ERP for a single departmental store in Southern Tamil Nadu with 2–3
Windows billing counters, offline-capable POS, and a manager dashboard. Repo:
`github.com/sukeshperiyasamy/department-store` (branch `main`).

## What the system does

1. **Billing** — cashiers scan/search products and complete sales on a Windows POS that keeps working
   when the server is unreachable: every bill is saved with its outbox event in one SQLite transaction and
   synced to ERPNext with server-side idempotency (a retried or duplicated submission can never create a
   second invoice).
2. **Back office** — ERPNext v16 is the sole authority for stock, accounting, GST and official invoices.
   The custom Frappe app `departmental_store` exposes only whitelisted APIs; nothing writes to ERP tables directly.
3. **Visibility** — a light-theme Manager Console (Next.js) shows sales, payment mix, catalog, inventory
   alerts (out-of-stock / below-reorder / expiring batches), counter health and the sync review queue.
4. **Returns** — cashier-facing returns screen posts ERPNext-native credit notes with authorization rules
   and the same idempotency guarantees as sales.

## Architecture at a glance

```
Windows POS (Tauri 2 + React + TS, SQLite outbox)
        │  REST + zod-validated contracts (API v1)
        ▼
ERPNext v16 + Frappe 16 + MariaDB 11.8  ←  departmental_store custom app
        │  (whitelisted APIs: sales, returns, catalog, devices, reports, settings)
        ▼
Manager Console (Next.js 15, Recharts)   ·   regional TN catalog (Tamil/Tanglish aliases)
```

Key design decision: finalized sales post as **Sales Invoice with `is_pos` + `update_stock`** (ADR-0002),
because v16 POS Invoices no longer move stock per bill. Idempotency uses a claim row
(`POS Sale Sync Log`, unique `transaction_id`) created **before** any invoice, so crashes and retries are safe.

## Repositories / module map

| Component | Path | Purpose |
| --- | --- | --- |
| Docker ERP stack | `deployment/erpnext/pwd.yml` | ERPNext v16.52.1 + MariaDB 11.8 + Redis, site `frontend`, port 8080 |
| Frappe app | `erpnext-app/departmental_store/` | sales/returns/catalog/devices/reports/settings APIs, seeds, GST setup, install self-heal |
| Windows POS | `apps/windows-pos/` | Tauri 2 shell (`src-tauri`), React UI (`src/ui`), domain + SQLite (`src/domain`, `src/local`), printing (`src/printing`) |
| Manager Console | `apps/owner-dashboard/` | dashboard, catalog, sales, inventory, sync pages |
| Shared contracts | `packages/shared-types/` | zod schemas shared by POS + dashboard (API v1 pinned) |
| Feature flags | `Departmental Store Settings` DocType | 10 module flags; voice/AI/MCP/camera opt-in OFF |

## Feature status (verified = executed with evidence)

| Feature | Status |
| --- | --- |
| Sales billing (barcode/search/cart/payment/change) | ✅ verified — 30 bench + integration tests; real Windows exe E2E |
| Offline queue + sync + exactly-once | ✅ verified — sync-engine/SQLite suites, reliability + multi-counter runs |
| Returns/refunds with authorization | ✅ verified — 10 bench tests, concurrent-refund test |
| Catalog (snapshot sync, Tamil/Tanglish search) | ✅ verified; 160-product TN regional seed implemented (site seeding blocked by apps.txt churn — see HANDOFF §7) |
| GST (india_compliance v16, templates, POS-path tax) | ✅ math verified on test site; ⚠ accountant sign-off + real GSTIN pending |
| Manager Console dashboard | ✅ verified against live ERP |
| Windows exe (Tauri 2) | ✅ built + E2E verified; NSIS installer needs MSVC CI |
| Receipt/label printing (ESC/POS, ZPL, TSPL) | ✅ byte-level tests; ❌ physical hardware untested |
| Feature flags + settings API | ✅ verified |
| Batch/expiry alerts | ✅ `stock_alerts` API + dashboard page |
| Tamil voice assistant, camera OCR, MCP tools | 🚧 architecture + flags only (per spec, built after core) |
| Backup/DR | ✅ script + scratch-site restore rehearsal; scheduler registration pending |

## Key documentation

- Start here: `HANDOFF.md` (module map, pitfalls, next steps) · `README.md`
- Contracts & policy: `docs/api-contracts.md`, `docs/offline-sync-policy.md`, `docs/architecture-decisions.md`
- Operations: `docs/deployment.md`, `docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`, `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`
- Quality: `docs/testing/TESTING_REPORT.md`, `docs/testing/TEST_EXECUTION_LOG_2026-10-27.md`, `docs/testing/RELEASE_READINESS.md`
- Limits & security: `docs/known-limitations.md`, `docs/testing/BUG_REPORT.md`
- Local-only (gitignored): `docs/local-demo-credentials.md`

## Quick commands

```bash
# ERP stack
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d

# tests
npm run typecheck && npm run test
bench --site frontend run-tests --app departmental_store        # inside backend container
node tests/integration/api_suite.mjs
npx tsx tests/integration/multi_counter.ts

# builds
npm run build --workspace @departmental/windows-pos
npm run build --workspace @departmental/owner-dashboard
```

Environment variables (placeholders in `apps/owner-dashboard/.env.example`): `ERP_BASE_URL`,
`DASHBOARD_API_KEY`, `DASHBOARD_API_SECRET`. Local demo credentials: gitignored
`docs/local-demo-credentials.md`.
