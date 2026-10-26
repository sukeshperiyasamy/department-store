# department-store

Departmental-store ERP for a single store in Southern Tamil Nadu with 2–3 Windows billing
counters: offline-capable POS, authoritative ERPNext v16 back office, and a manager dashboard.

## Architecture

```
Windows POS (Tauri 2 + React + TS, SQLite outbox)
        │  REST + zod-validated contracts (API v1)
        ▼
ERPNext v16 + Frappe 16 + MariaDB 11.8  ←  departmental_store custom app
        ▼
Manager Console (Next.js 15)   ·   Tamil/Tanglish regional catalog
```

Finalized sales and returns post through the ERPNext document lifecycle with
**server-side idempotency** — a retried, duplicated or crashed sync can never create a
second invoice. The counter keeps a durable local queue (SQLite) and works offline.

## Repositories / modules

| Component | Path |
| --- | --- |
| ERP docker stack | `deployment/erpnext/pwd.yml` |
| Custom Frappe app (`departmental_store`) | `erpnext-app/departmental_store/` |
| Windows POS (Tauri 2 + React + TS strict) | `apps/windows-pos/` |
| Manager Console (Next.js 15) | `apps/owner-dashboard/` |
| Shared zod API contracts | `packages/shared-types/` |

## Documentation

| Topic | Doc |
| --- | --- |
| **Agent/dev handoff** | [HANDOFF.md](HANDOFF.md) |
| System overview | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| Database & API reference | [DATABASE_AND_API.md](DATABASE_AND_API.md) |
| Feature status / history / issues | [FEATURE_STATUS.md](FEATURE_STATUS.md) · [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md) · [KNOWN_ISSUES_AND_TODO.md](KNOWN_ISSUES_AND_TODO.md) |
| Testing & deployment | [TESTING_AND_DEPLOYMENT.md](TESTING_AND_DEPLOYMENT.md) · [docs/testing/TESTING_REPORT.md](docs/testing/TESTING_REPORT.md) |
| API contracts & sync policy | [docs/api-contracts.md](docs/api-contracts.md) · [docs/offline-sync-policy.md](docs/offline-sync-policy.md) |
| Decisions & limits | [docs/architecture-decisions.md](docs/architecture-decisions.md) · [docs/known-limitations.md](docs/known-limitations.md) |
| Operations | [docs/deployment.md](docs/deployment.md) · [docs/operations/BACKUP_AND_DISASTER_RECOVERY.md](docs/operations/BACKUP_AND_DISASTER_RECOVERY.md) · [docs/hardware/PRINTER_SETUP_AND_TESTING.md](docs/hardware/PRINTER_SETUP_AND_TESTING.md) |
| GST compliance | [docs/compliance/GST_IMPLEMENTATION_AND_VALIDATION.md](docs/compliance/GST_IMPLEMENTATION_AND_VALIDATION.md) |
| UI/UX | [docs/ui-ux/DESIGN_SYSTEM.md](docs/ui-ux/DESIGN_SYSTEM.md) |

Local demo credentials: `docs/local-demo-credentials.md` (**gitignored** — placeholders in
`apps/owner-dashboard/.env.example`).

## Quick start

```bash
# ERP stack (ERPNext v16 + MariaDB + Redis), site "frontend" on :8080
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
# demo fixtures (inside backend container):
bench --site frontend execute departmental_store.install.ensure_app_registered
bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"

# tests
npm install
npm run typecheck && npm run test
node tests/integration/api_suite.mjs

# apps
npm run build --workspace @departmental/windows-pos     # POS frontend (tsc strict + vite)
npm run build --workspace @departmental/owner-dashboard # dashboard (next build)
cd apps/windows-pos && npx tauri build --no-bundle       # Windows exe (see docs/release/)
```

## Status

Supervised-pilot ready for core billing/offline/returns (see
[docs/testing/RELEASE_READINESS.md](docs/testing/RELEASE_READINESS.md) — **CONDITIONAL GO**).
Production use still requires: accountant-approved GST configuration with the store's real
GSTIN, physical printer validation, NSIS installer via MSVC CI, and a legal offline
invoice-numbering strategy. No real credentials, barcodes or government identifiers are used
anywhere in the repo.
