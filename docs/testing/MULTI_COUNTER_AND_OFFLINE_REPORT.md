# Multi-Counter and Offline Validation Report

Date: 2026-10-27 · Environment: live test ERP (ERPNext v16.52.1, docker), two independent counters
with **separate SQLite databases** and separate sync engines, driven by `tests/integration/multi_counter.ts`
(via `npx tsx`). Raw evidence: `docs/testing/artifacts/multi-counter-results.json`.

## Executed scenarios and results

| ID | Scenario | Result | Evidence (real ids/outcomes) |
| --- | --- | --- | --- |
| MC-01 | Both counters download the same catalog | PASS | identical item counts + checkpoint on both |
| MC-02 | Different products sold from both counters concurrently | PASS | both SERVER_COMMITTED after engine backoff retries absorbed a real **naming-series deadlock** (see defect MC-D1) |
| MC-03 | Two counters race for the final unit | PASS | exactly 1 SERVER_COMMITTED, 1 REQUIRES_REVIEW (stock) |
| MC-04 | Counter offline before submit | PASS | record stuck in SYNC_FAILED locally, never lost/faked |
| MC-05 | Backend restarts; retry after recovery | PASS | same transaction committed exactly once (`duplicate=false`) |
| MC-06 | Duplicate sync delivery | PASS | same invoice returned, `duplicate=true`, no second invoice |
| MC-07 | Malformed payload | PASS | safe structured handling (HTTP 4xx/200-review, no crash) |
| MC-08 | Two counters refund the same original concurrently | PASS | ≤1 credit note committed; the loser surfaced for review |
| MC-09 | Both counter DBs reopened after the run | PASS | records intact (pendingCounts non-empty on both) |
| GUI | Real packaged Windows exe: login → sync → sale → sync → verdict | PASS | server sync-log rows with device UUID `ac262843-…`; review states surfaced in UI |

## Defects found & fixed (regression-tested)

| ID | Defect | Fix | Regression |
| --- | --- | --- | --- |
| MC-D1 | Concurrent invoice posting deadlocks on Frappe's naming series (`QueryDeadlockError: Record has changed since last read in table 'tabSeries'`) | `submit_pos_sale` retries once on deadlock-class errors (transaction rolled back cleanly by ERP; retry is safe) | MC-02 (previously failed, now passes); bench suite green |
| MC-D2 | Seed tokens: a single cashier user's keys rotated per call → second counter unauthorized | per-counter seed users (`make_cashier_user_a/_b`) | suite fixtures |
| MC-D3 | GUI POS login called manager-only `register_device` with cashier credentials → 403 | new cashier-readable `get_device` + tolerant login flow (cashier proceeds only if a manager already enabled the counter); registration stays manager-only | security matrix still PASS (SEC-02/03) |

## At-most-once guarantee

Every counter transaction carries a UUID; the server claims it in `POS Sale Sync Log`
(unique key) BEFORE posting. MC-03/06/08 + RELY-03/04 + bench BI-01 demonstrate no
duplicate finalized sales under any retry/duplication pattern tested.

## Known limits

- The stock-race "loser" remains REQUIRES_REVIEW until a manager resolves it (by design).
- Windows GUI tests used a single display; true simultaneous physical counters would add
  hardware variance, not new server semantics (server-side concurrency already covered).
