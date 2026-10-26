# Coverage Report

Measured with `@vitest/coverage-v8` (v2.1.9) over the Windows POS TypeScript codebase. Command: `npx vitest run --coverage` (from `apps/windows-pos`). Raw table: `docs/testing/artifacts/coverage-pos-vitest.txt`. Frappe/Python side has **no coverage instrumentation** (Frappe's test runner does not produce coverage here) — bench suite composition is documented manually below.

## POS TypeScript (73 tests)

| Scope | Statements | Branch | Functions | Lines |
| --- | --- | --- | --- | --- |
| **All files** | **54.4%** | **74.6%** | **83.7%** | **54.4%** |
| src/domain (money, cart, outbox, sync-engine, catalog, receipt) | 86.8% | 82.8% | 95.1% | 86.8% |
| src/local (schema, repos, drivers) | 79.6% | 76.2% | 90.6% | 79.6% |
| src/transport (frappe client) | 78.5% | 66.7% | 60.0% | 78.5% |
| src/ui (screens, services, store, App) | low | low | — | low |

### Reading the numbers

- The overall 54% is dragged down by **UI shell code** (`App.tsx`, `SyncScreen.tsx`, `services.ts`, `PaymentScreen.tsx`, `main.tsx`) which is largely Tauri-runtime wiring. The business-critical layers (domain + persistence + transport) sit at **78–87% statements / 76–83% branches**, which is the meaningful figure for the offline guarantees.
- `services.ts` (0%) is the composition root; its logic is exercised indirectly by the HTTP suite and Tauri runtime, not unit tests.
- `sync-engine.ts` covers all state paths except `PROCESSING`-status deferral of a live claim (logic mirrored by the PROCESSING branch test in the transport layer and server-side bench tests).

### Critical workflows WITHOUT tests (honest gaps)

1. **Return/exchange flow** — not implemented in the custom API; ERPNext-native returns untested in the app (TEST_CASES BL-04 adjacent).
2. **Frappe report endpoints** (`owner_summary`, `server_status`) — verified only via live HTTP, no bench tests (they were exercised against seeded data; totals cross-checked manually).
3. **`register_device` / `record_sync` success paths** — only denial paths are HTTP-tested; happy path ran during dashboard verification (device appeared on dashboard) but has no automated bench test.
4. **Tauri driver** (`tauri-driver.ts`) — interface-identical to the tested Node driver but unverifiable without the desktop shell.
5. **Print spool command (`print_raw` Rust)** — cannot compile or test here.

## Frappe bench suite (20 tests, no coverage tooling)

- `test_sales_api.py` (16): idempotency, review paths, posting effects (SLE/GL), change amount, check_transaction, occurred_at handling (QA-0002), transaction_id validation (QA-0003).
- `test_catalog_api.py` (4): full/incremental snapshot semantics, checkpoint correctness (QA-0001).

## Dashboard

- 1 unit test (formatINR). Pages are server components hitting live ERP; verified end-to-end manually and via HTTP (dashboard rendered real totals in the previous cycle).

## Limitations

- Coverage percentages come from v8 instrumentation; line coverage ≠ correctness. The strongest guarantees (idempotency, durability, recovery) rest on the behavior-focused suites, not on the aggregate percentage.
- No mutation testing; no coverage for the Rust shell (blocked).
