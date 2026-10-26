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
