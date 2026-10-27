# Architecture Decision Records

## ADR-0001 — ERPNext via the official frappe_docker compose (pwd.yml)

- **Decision**: run the store server ERP with the official `frappe_docker`
  compose stack (deployment/erpnext/pwd.yml): ERPNext v16.52.1, MariaDB 11.8,
  Redis, workers, nginx frontend.
- **Rationale**: supported deployment method, reproducible, includes backup
  entrypoints. No PostgreSQL anywhere (ERPNext requires MariaDB).
- **Status**: deployed and verified on this workstation; the same stack pattern
  is recommended for the store's Linux server with a production benchmark.

## ADR-0002 — Sales Invoice (is_pos) instead of POS Invoice

- **Decision**: `submit_pos_sale` posts **Sales Invoice with `is_pos=1`,
  `update_stock=1`, `pos_profile` set**.
- **Context**: ERPNext v16 changed POS internals: `POSInvoice.on_submit` no
  longer creates Stock Ledger Entries (verified against v16.52.1 source and
  empirically — a submitted POS Invoice for a stock item produced zero SLEs),
  and v16's POS defaults to "Sales Invoice mode" (`POS Settings.invoice_type`),
  actively rejecting POS Invoices.
- **Consequences**: per-bill stock movement and GL entries from the standard
  lifecycle; paid/change amounts still supported via the payments table. The
  POS Opening/Closing Entry consolidation flow (POS-Invoice-based) is therefore
  not used; shift reconciliation is handled at the counter (SQLite shifts) and
  via ERP payment records. Cash-drawer/shift reporting should be built on
  cashier shifts + Sales Invoice payments.
- **Status**: implemented; bench tests verify stock + GL effects per bill.

## ADR-0003 — Claim-based server idempotency (POS Sale Sync Log)

- **Decision**: a custom DocType keyed uniquely by the client `transaction_id`
  is claimed (inserted with status Processing, committed) BEFORE any invoice is
  created. Duplicate claim attempts lose the race and return the recorded
  result.
- **Rationale**: atomic claim prevents the duplicate-invoice race under
  concurrent retries; the claim also records the request payload for audit and
  review.
- **Status**: implemented; bench tests cover resubmission, unknown-device
  pre-claim errors, and review paths.

## ADR-0004 — Sales Invoice mode and roles

- **Decision**: custom roles `Store Manager`, `Cashier`, `Inventory Operator`
  are created by the app installer. Rate overrides require Store Manager.
  Reporting APIs require Store Manager / Accounts Manager. Device registration
  is manager-only (a device is a trust anchor; cashiers cannot self-register
  counters).
- **Status**: implemented in `install.py` + API permission checks.

## ADR-0005 — Counter SQLite schema is document-cache + queue

- **Decision**: sales rows store the full SalePayload as JSON (SQLite is a
  durable queue, not a reporting store); catalog rows are a replaceable cache
  keyed by item_code/barcode; states are guarded SQL updates.
- **Rationale**: server re-prices at sync time; no client-side authoritative
  tax/valuation; catalog refreshes cannot corrupt in-flight bills.
- **Status**: implemented; verified with better-sqlite3 tests (the Tauri SQL
  plugin driver implements the identical interface).

## ADR-0006 — Payment references are not settlement proof

- **Decision**: UPI/card references typed by cashiers are stored as reference
  numbers only. No payment-gateway integration exists yet, so digital payments
  are reconciled manually (ERP payment records + bank statement).
- **Status**: implemented in UI wording and data model; gateway integration is
  a production prerequisite for automatic confirmation.

## ADR-0007 — Least-privilege dashboard service account

- **Decision**: the owner dashboard authenticates either as the signed-in owner
  (session cookie) or via a dedicated service user holding only reporting roles
  (Store Manager, Accounts Manager) with an API token in dashboard env vars.
  Tokens are never committed; `.env.example` documents the variables.
- **Status**: implemented and verified (token auth against live ERP).

## ADR-0008 — Multi-Tenant SaaS Architecture: Central Control Plane with Dedicated Frappe Tenant Sites (Database Isolation)

- **Decision**: Adopt a hybrid SaaS architecture combining a central Control Plane
  (managing tenant registry, verified hostnames, user memberships, and subscription
  lifecycle) with dedicated Frappe sites per tenant (`bench new-site <tenant_site>`)
  sharing the underlying application containers and background queues.
- **Context & Problem Statement**: Evolving from a single-shop ERP to a commercial SaaS
  platform serving multiple independent retail stores requires strict tenant boundary
  isolation, individual statutory GST/tax setups, and multi-counter POS support without
  compromising performance or risking cross-tenant data exposure.
- **Alternatives Evaluated**:
  1. *Shared Single Frappe Site (Row-Level Multi-Tenancy)*:
     - Evaluated: adding `tenant_id` or relying on Frappe's `Company` field in a single database.
     - **Rejected**: Critical leakage risks in ERPNext financial and stock reports that execute
       raw SQL joins across `tabGL Entry` and `tabStock Ledger Entry`. Frappe singletons
       (`Stock Settings`, `Departmental Store Settings`, `Print Settings`, `GST Settings`) cannot
       be varied per shop. Public file uploads share a single storage namespace. MariaDB naming
       series locks on sales invoices create contention across unrelated shops. Tenant data export,
       backup, and deletion cannot be done cleanly without cascading table surgery.
  2. *Completely Independent Container/VM Stacks per Customer*:
     - **Rejected**: Prohibitive infrastructure cost and operational overhead for small shops;
       fails to provide a unified public marketing site, shared mobile app sign-in, or central
       user management.
  3. *Hybrid Central Control Plane + Dedicated Tenant Sites (Selected)*:
     - Leverages Frappe's native multi-site architecture. Each shop receives an isolated MariaDB
       database, independent `site_config.json`, isolated encryption key, and private file space.
     - Central Control Plane resolves incoming domains (e.g. `ramesh.departmentstore.in`), validates
       verification status, checks user memberships, and routes requests to the verified tenant site.
     - The custom Windows POS, offline SQLite sync, sales posting, and returns workflows work
       100% unmodified against the tenant's site URL.
- **Consequences**:
  - Hard physical isolation at the database layer prevents SQL, cache, and reporting cross-leakage.
  - Per-tenant GST compliance, tax templates, and custom settings are fully isolated.
  - Individual tenant disaster recovery, backup (`bench backup`), and data export are built-in.
  - Low idle resource overhead: 50–100 small shop databases can share a single bench deployment.
- **Status**: Implemented foundation in Phase 1 (contracts in `packages/shared-types`, Frappe tenant API
  in `departmental_store.api.tenant`, and comprehensive unit tests).

## ADR-0009 — Tenant Provisioning Pipeline and Platform Admin Security Boundary
- **Context**:
  - As the departmental store ERP evolves into a multi-tenant SaaS platform, new store registrations must be reviewed, approved, provisioned, and activated safely.
  - Critical security requirements:
    1. Public registration requests must NEVER directly execute site-creation commands, choose database credentials, access the Docker socket, or activate tenants without administrative approval.
    2. Store-level `System Manager` roles on tenant sites must NOT grant access to the global SaaS control plane.
    3. Site provisioning is long-running and must not block synchronous HTTP requests.
    4. Passwords, database credentials, encryption keys, and internal filesystem paths must never appear in logs or audit records.
    5. Partial provisioning failures must not automatically run destructive drop-site commands without operator reconciliation.
- **Decision**:
  - Implement an explicit, persisted 10-state lifecycle state machine:
    `PENDING_REVIEW` -> `APPROVED` -> `PROVISIONING` -> `PROVISIONED` -> `VERIFICATION_PENDING` -> `ACTIVE`, with failure state `PROVISIONING_FAILED`, rejection `REJECTED`, and operational states `SUSPENDED` and `ARCHIVED`.
  - Introduce a dedicated `Platform Admin` role in Frappe (`ROLE_DEFINITIONS`). The authorization guard `require_platform_admin()` rejects guests, store cashiers, store managers, and tenant System Managers.
  - Model durable provisioning jobs in `tabSaaS Provisioning Job` with atomic row claiming (`SELECT ... FOR UPDATE`), step tracking (`INIT`, `VALIDATE`, `CREATE_SITE`, `INSTALL_APPS`, `INITIALIZE_STORE`, `VERIFY_HEALTH`, `COMPLETED`), heartbeat timestamps, worker IDs, and bounded retries (max 3).
  - Model an immutable audit trail in `tabSaaS Provisioning Audit Log` capturing every transition, acting operator, reason, and sanitized metadata with automatic redaction of secret-bearing keys (`sanitize_error()`).
  - Deploy a dedicated Platform Admin Review Console in `apps/owner-dashboard` under `(admin)/admin/onboarding` separate from ordinary shop owner views.
  - Secure site creation uses explicit argument lists passed to `bench new-site` without shell interpolation (`shell=False`).
- **Consequences**:
  - Robust isolation between platform control plane and tenant store management.
  - Idempotent and recoverable site provisioning under network hiccups, container restarts, or transient errors.
  - Complete operational observability with zero secret exposure.
- **Status**: Implemented in Phase 3 with end-to-end unit, backend, and browser tests.

