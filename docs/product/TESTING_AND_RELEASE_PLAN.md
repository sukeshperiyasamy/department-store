# Testing and Release Plan

## 1. Test layers

### Unit tests

Cover money arithmetic, tax adapters, discounts, permissions, reorder formulas,
cash calculations, state transitions, validation and report definitions.

### Database integration tests

Run against real PostgreSQL containers. Verify migrations, constraints,
transaction rollback, concurrent idempotency claims, stock locks, cash closing
and audit records.

### POS/local integration tests

Run against real SQLite. Verify atomic sale plus outbox, restart recovery,
crash during sync, retry ordering, catalog refresh isolation and held bills.

### API contract tests

Verify generated OpenAPI schemas, authorization, error envelopes, versioning and
client/server compatibility.

### Browser/E2E tests

Use Playwright for login, product setup, billing, hold/resume, returns,
receiving, cash close, reconciliation, report drill-down and manager approval.

### Hardware tests

Validate supported barcode scanner suffixes, thermal printer text/raster modes,
paper cut, disconnect/reconnect and duplicate print prevention.

### Security and accessibility tests

Run secret scans, dependency audits, authorization matrix tests, basic abuse
tests, keyboard navigation, focus checks, contrast checks and screen-reader
smoke tests.

## 2. Required failure scenarios

- API timeout after server commit
- Application killed during SQLite commit
- Application killed during sync
- Network lost before and after payment entry
- Duplicate payment reference
- Price changed while a bill is pending
- Stock conflict at synchronization
- Invalid/expired batch
- Printer unavailable or paper out
- Database unavailable during API request
- Backup failure and restore to a clean environment
- Cash difference beyond approval tolerance

## 3. CI quality gates

Every change must pass:

```text
npm ci
npm run typecheck
npm test
npm run lint
secret scan
database migration test
API contract tests
Playwright smoke suite
```

The exact scripts may be added as the new workspace is scaffolded. A missing
environment-dependent test must be reported as unrun, never treated as passed.

## 4. Release gates

### Alpha

Core sale works locally, tests cover the domain and the API can be migrated and
started from a clean environment.

### Pilot

Offline recovery, printer/scanner hardware, permissions, backup restore and all
critical user journeys pass on one store's representative hardware.

### Production

No open P0/P1 defects, accountant-approved tax configuration, migration
rehearsal, rollback rehearsal, operator runbook and support escalation path.
