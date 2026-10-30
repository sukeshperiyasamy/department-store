# New Store Platform — Architecture and Technology Specification

## 1. Architecture decision

Build a TypeScript modular monolith with a local-first Windows client. Do not
build microservices, a second accounting database or a cloud-only POS.

The existing ERPNext/Frappe application remains available as the legacy system
during migration. The new backend becomes authoritative only after the
migration and cutover gates pass.

```text
Windows POS (2–3 counters)
React + Vite + Tauri 2 + SQLite
              │ HTTPS REST / sync
              ▼
Fastify modular monolith + worker
              │
              ▼
PostgreSQL authoritative ledger
       ┌──────┴─────────┐
       ▼                ▼
Owner/admin PWA     Android companion (later)
```

## 2. Technology choices

| Layer | Choice | Required use |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | API, worker and tooling |
| Language | TypeScript strict mode | Shared domain and client code |
| Windows shell | Tauri 2 | Native window, printer/scanner/device bridge |
| POS UI | React + Vite | Fast counter UI and local assets |
| Owner UI | React + Vite PWA | Responsive owner dashboard and approvals |
| Local database | SQLite | Drafts, catalog cache, pending operations, outbox |
| API | Fastify | Modular HTTP server and health endpoints |
| Central database | PostgreSQL | Authoritative sales, stock, cash and audit data |
| Schema/migrations | Drizzle ORM + SQL migrations | Type-safe schema; explicit SQL for critical transactions |
| Validation | Zod | Request/response trust boundaries |
| API documentation | OpenAPI | Generated contract and client review |
| Client server-state | TanStack Query | Cache, retry and invalidation |
| Local UI-state | Zustand | Small, explicit UI state |
| UI primitives | Radix UI + Tailwind CSS | Accessible and consistent design system |
| Auth | Server-side sessions, Argon2id | HttpOnly secure cookies and role checks |
| Worker | Postgres-backed jobs/outbox | No Redis dependency in the first release |
| Deployment | Docker Compose + Caddy | Low-cost HTTPS deployment |
| Testing | Vitest, Testing Library, Playwright, Testcontainers, cargo test | Unit through E2E and native tests |

Versions must be pinned in lockfiles and upgraded only through a tested change.

## 3. Module boundaries

The server is one deployable application with these modules:

- auth and sessions
- stores, users, roles and devices
- catalog, prices, units and barcodes
- sales, returns and receipts
- payments and reconciliation
- inventory, batches and expiry
- purchasing, receiving and suppliers
- cash sessions, expenses and closing
- customers and loyalty
- reports and owner alerts
- synchronization and idempotency
- audit and administration

Modules may share domain types but must not bypass another module's command or
authorization boundary to mutate its data.

## 4. Repository target

```text
apps/
  pos-desktop/             # React/Vite/Tauri counter application
  backoffice-web/          # React/Vite/PWA owner and manager application
  server/                  # Fastify API and worker
packages/
  contracts/               # Zod schemas and generated OpenAPI types
  domain/                  # Pure business rules and money/value objects
  database/                # Drizzle schema, migrations and repositories
  design-system/           # Accessible shared components and tokens
  sync/                    # Shared state machine and retry policies
  testing/                 # Fixtures, helpers and contract utilities
docs/product/              # Product and engineering handoff documents
```

The current `apps/windows-pos`, `apps/owner-dashboard`, `apps/mobile` and
ERPNext app remain legacy/reference surfaces until replacement milestones are
accepted. Do not delete them as part of scaffolding.

## 5. Data authority

- PostgreSQL is authoritative for finalized sales, returns, payments, stock,
  supplier balances, cash closings and audit records.
- Counter SQLite is authoritative only for local drafts and pending operations.
- A disconnected counter cannot guarantee global stock availability.
- The owner UI is a client/reporting surface, not a second ledger.
- No client writes directly to PostgreSQL.

## 6. Deployment and operations

Initial deployment uses one VPS or equivalent:

- Caddy terminates HTTPS.
- Fastify serves API and worker health endpoints.
- PostgreSQL stores central data.
- Static PWA assets are served by the web container.
- Scheduled encrypted backups are written to a separate destination.
- Restore is tested before production and at every release gate.

Scale-out is a later decision based on measured load, not an assumption.
