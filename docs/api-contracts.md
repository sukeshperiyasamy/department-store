# API Contracts — API v1

All contracts are defined once in `packages/shared-types/src/index.ts` as zod
schemas, mirrored by server-side validation in
`erpnext-app/departmental_store/departmental_store/api/`. Every client validates
responses at the trust boundary; `api_version` is pinned to `1` and unknown
versions are refused by both ends.

Transport: Frappe REST — `POST /api/method/<dotted.path>` with JSON body.
Auth: session cookie (POS login, dashboard login) or
`Authorization: token <key>:<secret>` (dashboard service user, POS device users).

Frappe wraps results as `{"message": <payload>}`; the contracts below describe
`<payload>`.

## 1. Sales submission — `departmental_store.api.sales.submit_pos_sale`

Request body: `{ "payload": "<JSON string of SalePayload>" }`

SalePayload (strict; unknown fields rejected):

| Field | Type | Rules |
| --- | --- | --- |
| api_version | literal 1 | |
| transaction_id | string 1..100 | client UUID; primary idempotency key |
| device_id | string 1..100 | must be a registered, enabled POS Device |
| counter_name | string? | informational |
| occurred_at | ISO 8601 string? | counter clock; skew window +10min/-3 days |
| cashier | string? | informational; server uses session user |
| customer | string? | falls back to POS Profile default customer |
| pos_profile | string? | falls back to first active POS Profile |
| lines[] | 1..500 | line_id, item_code, qty>0; rate/uom/discount/batch optional |
| payments[] | 1..n | mode_of_payment, amount>=0, optional reference_no/date |
| totals.grand_total | number? | display only, never authoritative |

Server behaviour (all verified by bench tests):

- Prices re-derived from the selling price list; client rates are ignored unless
  `allow_rate_override` is set AND the session user has the "Store Manager" role
  (override is audited on the invoice as a comment).
- Taxes computed by ERPNext from the configured tax template.
- Invoice posted = **Sales Invoice with `is_pos=1, update_stock=1`** (ADR-0002):
  stock ledger and GL entries are produced per bill by the standard ERP lifecycle.
- Cash tendered above grand total yields `invoice.change_amount`.
- Tendered below grand total → `PAYMENT_SHORTFALL` review result, nothing posted.

Response (SaleResponse):

```
{
  "api_version": 1,
  "status": "SERVER_COMMITTED" | "REQUIRES_REVIEW" | "PROCESSING" | "UNKNOWN",
  "duplicate": bool?,          // true when the transaction_id was already recorded
  "transaction_id": string?,
  "invoice": { doctype, name, customer, posting_date, net_total,
               total_taxes_and_charges, grand_total, rounding_adjustment,
               change_amount, currency } | null,
  "error": { "code": <enum>, "message": string } | null,
  "resolved_at": ISO string
}
```

Error codes (enum in shared-types): `ITEM_NOT_FOUND`, `ITEM_DISABLED`,
`PRICE_MISSING`, `BATCH_INVALID`, `PAYMENT_SHORTFALL`, `RATE_OVERRIDE_DENIED`,
`REQUIRES_POS_PROFILE`, `VALIDATION_FAILED`, `DEVICE_UNKNOWN`, `DEVICE_DISABLED`,
`INVOICE_POSTING_FAILED`.

Retry behaviour: submitting the same `transaction_id` again NEVER creates a
second invoice — the recorded result is returned with `duplicate: true`
(claim-based idempotency via the POS Sale Sync Log DocType; unique key). Results
are returned as HTTP 200 payloads so the client can persist the exact verdict;
structural failures (payload not JSON etc.) return HTTP 4xx/5xx and are treated
as transport errors by the client.

## 2. Lost-response recovery — `check_transaction`

Request: `{ "transaction_id": string }`. Response: same SaleResponse shape, with
status `UNKNOWN` when the server has no record. The sync engine calls this
whenever a submission times out, before any resubmission.

## 3. Catalog snapshot — `departmental_store.api.catalog.catalog_snapshot`

Request: `{ since?: checkpoint, price_list?: string, include_customers?: 0|1 }`.

Response (CatalogSnapshot): `api_version`, `generated_at`, `checkpoint`,
`price_list`, `currency`, `items[]` (item_code, item_name, item_group, stock_uom,
brand, description, is_stock_item, has_batch_no, aliases[], barcodes[],
price { price_list_rate, uom } | null, modified), `tax_templates[]` (name,
company, is_default, taxes[]), `payment_modes[]` (mode_of_payment, type),
optional `customers[]`, `is_incremental`.

Incremental sync: pass the previous `checkpoint`; items and prices modified after
it are re-sent. **Limitation (v1): deletions are not detected incrementally** —
clients must do a full refresh (omit `since`) when the catalog appears to drift.

## 4. Devices — `register_device` / `record_sync`

`register_device` (manager roles only): `{ device_id, counter_name?, notes? }` →
`{ api_version, device_id, counter_name, status: Enabled|Disabled, action:
registered|updated }`. `record_sync` (any authenticated user): `{ device_id,
checkpoint }` → `{ ok: true }`; updates last_sync_at on the device.

## 5. Reporting — `owner_summary` / `server_status` (manager/accountant roles)

`owner_summary { business_date? }` → `{ api_version, business_date, generated_at,
gross_sales (Σ base grand_total, tax inclusive, non-return invoices),
net_sales (Σ base net_total, tax exclusive), taxes_collected, returns_total,
net_sales_after_returns, bills (count), average_bill_value, returns_count,
payment_split[] (allocated amounts per mode; cash excludes change),
cashier_split[] }`.

`server_status {}` → `{ frappe_version, apps[], devices[] (device_id,
counter_name, status, last_sync_at), processing_transactions[],
review_queue[] (transaction_id, error_code, error_message, updated_at) }`.

## Versioning

Any breaking change bumps `api_version` and requires new schemas in
shared-types plus a release note here. Non-breaking additions append optional
fields. Clients refuse `api_version` values they do not implement.
