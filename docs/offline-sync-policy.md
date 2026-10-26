# Offline Sync Policy

Authority model (non-negotiable):

- ERPNext (central server) is authoritative for finalized stock, accounting and
  official invoice records.
- Counter SQLite is authoritative ONLY for local drafts and pending operations.
- Disconnected counters can NOT guarantee global stock availability; offline
  stock displays are advisory and may be stale.

## Transaction states

`DRAFT → LOCAL_SAVED → PENDING_SYNC → SYNCING → SERVER_COMMITTED`
with exits to `SYNC_FAILED` (retryable, bounded backoff), `REQUIRES_REVIEW`
(permanent server verdict, human action needed) and `CANCELLED`.
A sale is never shown as centrally committed before the server confirms it.

## Durability rules (implemented and tested)

1. **Atomic save**: the sale row and its outbox event are written in ONE SQLite
   transaction (`PosStore.saveSaleWithOutbox`; verified against real SQLite,
   including rollback of both on failure).
2. **Stable identity**: every transaction gets a UUID at checkout; the server
   keys idempotency on it (POS Sale Sync Log unique key).
3. **Server idempotency**: the server claims the transaction atomically before
   creating any invoice. Concurrent or repeated submissions return the recorded
   result with `duplicate: true` (bench-tested).
4. **Lost response recovery**: on submit timeout, the engine asks
   `check_transaction(transaction_id)`. If the server committed, the counter
   adopts that verdict (`duplicate: true`) and never resubmits blindly
   (engine test).
5. **Crash recovery**: records stuck in `SYNCING` (app killed mid-flight) are
   reset to `PENDING_SYNC` on the next engine run and re-synced; server
   idempotency makes this safe (engine + SQLite tests).
6. **Restart durability**: reopening the counter database preserves all records
   (real SQLite test on a closed/reopened file).
7. **Bounded retries**: exponential backoff (2s base, 5min cap, jitter). After
   8 auto attempts a record waits for a manual "Retry now". Permanent review
   results are never silently retried.
8. **Catalog isolation**: catalog refreshes never touch sales rows; pending
   bills keep their item codes and the server re-prices at submission time
   (SQLite test). Historical invoice amounts therefore never change when prices
   change.

## Documented operational policies

- **Short LAN outage**: billing continues normally; the sync engine retries with
  backoff. Counters show a sync badge with pending counts.
- **Prolonged outage**: sales keep queueing in SQLite (no hard cap in v1; disk
  is the limit). After 8 failed auto attempts per record the engine defers to
  manual retry; the Sync screen lists every record and allows bulk-free manual
  retries once the network returns.
- **Stale stock / overselling**: the server validates stock availability at
  submission against real-time stock. An offline sale of the last unit succeeds
  locally but is flagged for review at sync time (`VALIDATION_FAILED` with the
  ERP's stock error); the manager resolves it (e.g. correct stock or cancel).
  The counter never blocks a cash sale on possibly-stale stock — that is the
  documented trade-off of offline-first retail.
- **Duplicate requests**: impossible to double-post; the server claim is unique.
- **Price changes mid-outage**: queued bills are re-priced by the server at sync
  time (prices are re-derived from the price list). The receipt issued offline
  is an estimate by definition; the server response carries the authoritative
  totals. Cash-handling policy: the cashier gives change based on the offline
  estimate; differences surface in the review queue.
- **Invoice numbering**: the ERP assigns official numbering at sync time; the
  counter never invents official invoice numbers. Offline receipts print
  "(pending sync)" plus the transaction UUID. A legally validated offline
  numbering strategy is REQUIRED before production (see known-limitations.md).
- **Payment uncertainty**: a typed UPI/card reference is recorded as a reference
  only, never as settlement proof. Reconciliation against bank statements or a
  payment-gateway integration is a production prerequisite.
- **Conflict review**: `REQUIRES_REVIEW` records carry the server's error code
  and message; the Sync screen and the owner dashboard review queue surface
  them. Resolution actions (fix data, retry, cancel) require manager rights.

## Clock skew

Counter `occurred_at` timestamps are accepted within +10 minutes / −3 days of
server time; outside that window the bill is sent to review instead of silently
shifting the books. Local timestamps are kept distinct from server timestamps.
