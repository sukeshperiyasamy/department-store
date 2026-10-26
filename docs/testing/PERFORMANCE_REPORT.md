# Performance Report

**Environment:** Windows 11 dev workstation, Docker Desktop (WSL2 backend), single-node ERPNext v16 stack, MariaDB 11.8 in-container, demo dataset (~330 items, ~90 invoices at measurement time). Measurements via Node fetch scripts (tests/integration/api_suite.mjs). **No k6/Locust available — these are targeted latency measurements, not load tests.** All targets below are **provisional** (no documented performance requirements exist in the repo); they are proposed for the dev-class environment and must be re-baselined on store hardware.

## Results

| Metric | n | p50 | p95 | Target (provisional) | Verdict |
| --- | --- | --- | --- | --- | --- |
| Full catalog snapshot (305 items, HTTP, serialized+zod-validated client-side excluded) | 15 | 30 ms | 32 ms | < 2000 ms | PASS |
| Incremental catalog snapshot after 1 price change | 10 | 16 ms | — | < 500 ms and ≤ 3 items | PASS (returned exactly 1 item — also proves QA-0001 fix) |
| Sale submission — full ERP posting (pricing, stock ledger, GL, idempotency log) over HTTP | 10 | ~140 ms | ~155 ms | < 3000 ms | PASS |
| ERP ping | 1 | ~40 ms | — | — | reference |

## Observations

- Sale submission cost is dominated by ERPNext document posting (validation, SLE, GL), not by the custom sync layer; ~140 ms server-side is comfortably within the PRD's offline-billing expectations because billing itself is local — only sync traffic hits this endpoint.
- Incremental snapshot returning exactly one item demonstrates both correct change detection and negligible payload size; a counter can cheaply poll frequently.
- Catalog scale tested to 305 items / 326 in later runs; a real store with 20k+ items was NOT tested — recommend re-running `make_perf_items 20000` on production-class hardware before go-live (NOT RUN).

## Not measured (gaps)

- Sustained throughput / concurrent-user load (needs k6 or equivalent — blocked).
- Memory/CPU profiles under load (no instrumentation attached).
- Counter-side SQLite performance at 10k+ queued sales (unit tests only, small volumes).
- Dashboard page latency (depends on ERP report queries; single-user manual use only).

## Recommended next steps

1. Install k6; script the submit/catalog endpoints at 5–20 concurrent virtual cashiers; re-baseline.
2. Test with a production-scale catalog (20k items, 10k customers) and re-measure snapshot + search.
3. Measure the compiled Tauri app's local billing latency (cart operations are in-memory and sub-millisecond by construction; scanner-to-screen latency needs the real shell).
