# DATABASE_AND_API

Reference for the data layer (ERPNext doctypes, counter SQLite) and every custom API
method. Canonical request/response schemas: `docs/api-contracts.md` + `packages/shared-types`.
All custom methods are whitelisted Frappe endpoints:
`POST /api/method/<python.path>` with JSON body; auth = session cookie or
`Authorization: token <key>:<secret>`. API v1 pinned (`api_version: 1` in every payload/response).

---

## 1. Database layer

### 1.1 ERPNext / MariaDB (authoritative — never written to directly)

| Doctype | Role | Key fields |
| --- | --- | --- |
| Sales Invoice | Finalized sales **and** returns (ADR-0002) | `is_pos=1`, `update_stock=1`, `is_return`+`return_against` for returns |
| POS Sale Sync Log *(custom)* | Idempotency + audit | `transaction_id` (PK, unique), `status` Processing→Server Committed/Requires Review/Cancelled, `is_return`, `original_invoice`, `device_id`, `error_code/message`, `request_payload`, `response_payload` |
| POS Device *(custom)* | Counter registry | `device_id` (PK), `counter_name`, `status` Enabled/Disabled, `last_sync_at`, `last_catalog_checkpoint` |
| Item / Item Price / Item Barcode | Catalog | `ds_search_aliases` custom field (Tamil/Tanglish), `gst_hsn_code` |
| Batch / Bin / Stock Ledger Entry | Stock authority | Managed by ERPNext; app never writes directly |
| Customer / Mode of Payment / POS Profile / Sales Taxes and Charges Template | Config | Standard ERPNext |
| Departmental Store Settings *(custom, Single)* | Feature flags | 10 check fields (voice/AI/MCP/camera off by default; batch-expiry/notifications/regional-catalog/printing on), `expiry_warning_days` |
| GST HSN Code (india_compliance) | HSN validation | 6/8-digit codes required on sellable items |

### 1.2 Counter SQLite (`pos.db`, schema v2, WAL)

Migrations in `apps/windows-pos/src/local/schema.ts` (v1 = base, v2 = `kind` + `original_invoice`).

| Table | Purpose |
| --- | --- |
| `schema_meta` | key/value (`device_id` persisted here) |
| `catalog_items` / `catalog_barcodes` / `catalog_meta` | Replaceable catalog cache (`payload` JSON, price in minor units, checkpoint) — refresh never touches `sales` |
| `sales` | One row per transaction: `transaction_id` PK, `kind` (sale/return), `state`, `payload` JSON, `response` JSON, `attempts`, `next_attempt_at`, `last_error_*`, `receipt_printed` |
| `outbox` | One event per sale/return (`event_id` PK, `event_type` sale.submitted.v1 / return.submitted.v1, `dispatched_at`) |
| `shifts` | Counter shift open/close + cash variance |
| `sync_runs` | Engine run diagnostics |

Transaction rules: `saveSaleWithOutbox` / `saveReturnWithOutbox` insert the sale row **and**
its outbox event in ONE transaction; state moves are guarded (`UPDATE … WHERE transaction_id=? AND state=?`).
Drivers: `TauriSqliteDriver` (production, serialized queue + WAL + busy_timeout) and
`NodeSqliteDriver` (tests; identical interface).

---

## 2. Custom API methods

### Sales — `departmental_store.api.sales`

| Method | Auth | Body | Result |
| --- | --- | --- | --- |
| `submit_pos_sale` | any billing user (device must be registered+enabled) | `{ payload: "<SalePayload JSON>" }` | `SaleResponse`: SERVER_COMMITTED (with `invoice`), REQUIRES_REVIEW (`error.code`), or duplicate replay. Server re-prices from the price list; posts Sales Invoice `is_pos`+`update_stock`; single deadlock retry (QA: tabSeries) |
| `check_transaction` | any billing user | `{ transaction_id }` | Recorded verdict or `UNKNOWN` — lost-response recovery |

### Returns — `departmental_store.api.returns`

| Method | Auth | Notes |
| --- | --- | --- |
| `get_original_invoice` | billing user | `{ invoice_name }` → header + lines with `returnable_qty` (sold − already returned) + original payments |
| `submit_pos_return` | billing user (cashier window 1 day; older = Store Manager) | `{ payload: ReturnPayload JSON }` → credit note via `is_return`+`return_against`; refunds explicit or proportional to allocated original payments; same idempotency claim |

### Catalog — `departmental_store.api.catalog`

| Method | Auth | Notes |
| --- | --- | --- |
| `catalog_snapshot` | any authenticated user | `{ since?, price_list?, include_customers? }` → items (barcodes, aliases incl. Tamil/Tanglish, price), tax templates, payment modes, `checkpoint`. Incremental re-sends items **or** items whose price changed (QA-0001). Deletions not detected → full refresh needed |

### Devices — `departmental_store.api.devices`

| Method | Auth | Notes |
| --- | --- | --- |
| `register_device` | **System Manager / Store Manager** | upsert `{ device_id, counter_name, notes }` |
| `get_device` | any authenticated user | `{ device_id }` → `{ registered, status, counter_name }` (POS login flow) |
| `record_sync` | any authenticated user | `{ device_id, checkpoint }` → updates `last_sync_at` |

### Reports — `departmental_store.api.reports` (System Manager / Store Manager / Accounts Manager)

| Method | Returns |
| --- | --- |
| `owner_summary` (`business_date?`) | gross/net sales, taxes, returns, bills, avg bill, payment split (allocated; cash excl. change), cashier split |
| `server_status` | Frappe version, apps, devices, processing backlog, review queue |
| `recent_invoices` (`limit?`) | last submitted bills (replaces ERPNext REST which 403s for the reporting user) |
| `stock_alerts` (`days_to_expiry?`) | out-of-stock, below-reorder (Item Reorder × Bin), expiring batches |

### Settings — `departmental_store.api.settings`

| Method | Auth | Notes |
| --- | --- | --- |
| `get_settings` | any authenticated user | 10 feature flags + `expiry_warning_days` |
| `set_flag` | **System Manager** | `{ flag, value }` → audit-logged; unknown flags rejected |

### Error model

Structured outcomes return HTTP 200 with `status: REQUIRES_REVIEW` + `error.code`
(`ITEM_NOT_FOUND`, `ITEM_DISABLED`, `PRICE_MISSING`, `BATCH_INVALID`, `PAYMENT_SHORTFALL`,
`RETURN_QTY_EXCEEDS`, `RETURN_AUTHORIZATION_REQUIRED`, `REFUND_MISMATCH`, `DEVICE_UNKNOWN`,
`DEVICE_DISABLED`, `REQUIRES_POS_PROFILE`, `VALIDATION_FAILED`, `INVOICE_POSTING_FAILED`).
Auth failures are HTTP 401/403. Clients treat any 4xx/5xx as retryable transport errors
and rely on server idempotency.

---

## 3. ERPNext REST used by clients

Only one legacy call remains outside custom methods: none — the dashboard previously
used `/api/resource/Sales Invoice` (403 for the reporting user) and now uses
`recent_invoices`. The POS dashboard/login flow uses only the methods above plus
`POST /api/method/login` (session cookie).

---

## 4. Migration / deployment notes

- Doctype changes: `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp exec backend bench --site frontend migrate`
- Counter SQLite: `PosStore.migrate()` applies `MIGRATIONS` idempotently on app start (v1 base, v2 returns columns)
- API v1 is pinned; breaking changes require a new `api_version` + shared-types schema (see `docs/api-contracts.md`)
