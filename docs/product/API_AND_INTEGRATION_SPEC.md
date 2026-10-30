# API and Integration Specification

## 1. API principles

- REST endpoints under `/api/v1`.
- JSON request/response bodies with a consistent error envelope.
- Zod schemas define input and output at the trust boundary.
- OpenAPI is generated from the contract and reviewed with each change.
- Unknown API versions are rejected.
- Breaking changes require a new version; optional additions are preferred.
- All mutation endpoints accept an idempotency key where retries are possible.
- Correlation/request IDs appear in logs and safe error responses.

## 2. Core resources

Initial resource groups:

- `auth`, `sessions`, `users`, `roles`, `devices`
- `stores`, `counters`, `catalog`, `prices`, `barcodes`
- `sales`, `returns`, `receipts`, `held-bills`
- `payments`, `reconciliation`, `cash-sessions`, `expenses`
- `purchases`, `receipts-in`, `suppliers`, `supplier-payments`
- `stock`, `counts`, `batches`, `write-offs`
- `customers`, `loyalty`
- `reports`, `alerts`, `sync`, `audit`, `health`

## 3. Mutation contract

Every mutation response includes:

```json
{
  "request_id": "uuid",
  "operation_id": "uuid",
  "status": "accepted | committed | review | failed",
  "data": {},
  "error": null
}
```

Errors use stable machine codes, a safe user message, field details when
applicable and a retryability classification. Server logs may contain more
diagnostic detail but never secrets.

## 4. Integration boundaries

- POS communicates with the new API only; it never writes the central database.
- Printers use an adapter boundary for ESC/POS and supported Windows drivers.
- Payment integrations are optional and must provide confirmed status before a
  payment is treated as settled.
- Bank statement reconciliation starts with manual import/matching; provider
  adapters are later integrations.
- Customer messaging is optional and consent-based.
- AI/recommendation services receive minimized, non-authoritative data and may
  not mutate ledgers.

## 5. Contract testing

The server and every client run the same contract fixtures. Tests cover valid
requests, unknown fields, missing permissions, duplicate idempotency keys,
timeouts, stale versions and error mapping.
