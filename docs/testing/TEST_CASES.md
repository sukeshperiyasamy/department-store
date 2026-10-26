# Test Case Catalogue

Statuses: PASS / FAIL / BLOCKED / NOT RUN / NOT APPLICABLE. Evidence = suite output in docs/testing/artifacts/ or the report tables in TESTING_REPORT.md.

## A. Static & build

| ID | Priority | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| ST-01 | P1 | TS strict typecheck, 3 workspaces | 0 errors | 0 errors | PASS |
| ST-02 | P1 | POS production build (vite) | build completes | OK ~1s | PASS |
| ST-03 | P1 | Dashboard production build (next) | build completes | OK | PASS |
| ST-04 | P2 | Python compileall on Frappe app | no syntax errors | OK | PASS |
| ST-05 | P2 | npm audit | no high/critical runtime vulns | 9 advisories (2 dev-critical; zod high runtime) | FAIL (documented, remediation planned) |
| ST-06 | P1 | Secret scan of git history | no tokens/keys | none found | PASS |
| ST-07 | P2 | Rust `cargo check` | compiles | — | BLOCKED (no Rust/MSVC toolchain) |

## B. Unit — POS domain & local (vitest)

| ID | Priority | Test | Status |
| --- | --- | --- | --- |
| UN-01..06 | P1 | money: minor-unit math, formatting, currency mismatch, rounding | PASS (6) |
| UN-07..13 | P1 | cart: merge, no-price rejection, qty rules, remove/clear, estimates | PASS (7) |
| UN-14..24 | P1 | outbox state machine: legal/illegal transitions, terminal states, backoff bounds | PASS (11) |
| UN-25..33 | P1 | sync engine: commit, review, backoff retry, lost-response recovery, duplicate delivery, max attempts, single-flight, crash reset | PASS (9) |
| UN-34..41 | P2 | catalog search: barcode, alias ranking, multi-token, determinism | PASS (8) |
| UN-42..47 | P2 | receipt: ESC/POS framing, duplicate marker, alignment, references | PASS (6) |
| UN-48..59 | P1 | repos (real SQLite): atomic sale+outbox, rollback, restart durability, guarded transitions, state conflicts, backoff due, catalog isolation, shifts | PASS (12) |
| UN-60..69 | P1 | transport: schema validation, payload encoding, auth/timeout/network mapping, token header | PASS (10) |
| UN-70..73 | P2 | UI components (jsdom): barcode add, unknown-barcode error, F8 remove, charge disabled when empty | PASS (4) |
| UN-74..83 | P2 | shared-types contract schemas: reject bad payloads/versions/unknown codes | PASS (10) |
| UN-84 | P3 | dashboard formatINR lakh grouping | PASS (1) |

## C. Bench integration (ERPNext posting, real site)

| ID | Priority | Test | Status |
| --- | --- | --- | --- |
| BI-01 | P0 | resubmission returns same invoice + duplicate flag, single sync log | PASS |
| BI-02..06 | P1 | review paths: unknown item, missing price, unknown device, payment shortfall, client rate ignored | PASS (5) |
| BI-07 | P0 | service-item sale posts invoice | PASS |
| BI-08 | P0 | stock sale moves SLE (10→6) + GL entries | PASS |
| BI-09 | P2 | change amount returned for excess cash | PASS |
| BI-10..11 | P1 | check_transaction: UNKNOWN + recorded verdict | PASS (2) |
| BI-12..13 | P1 | occurred_at: aware ISO accepted; far-future/stale rejected to review (QA-0002) | PASS (3 tests) |
| BI-14..15 | P1 | transaction_id charset: injection rejected pre-write; valid charset accepted (QA-0003) | PASS (2) |
| BI-16..19 | P1 | catalog: full snapshot content; price-only change in incremental; checkpoint covers prices; unrelated items not resent (QA-0001) | PASS (4) |

## D. HTTP integration / contract / security (live stack)

| ID | Priority | Test | Status |
| --- | --- | --- | --- |
| HEALTH-01 | P1 | /api/method/ping 200 | PASS |
| AUTH-01..03 | P0 | unauthenticated submit/catalog rejected; invalid token rejected | PASS (3) |
| CONTRACT-01 | P0 | cashier sale posts via HTTP; server re-prices; totals from price list | PASS |
| RECOVERY-01 | P0 | check_transaction returns recorded verdict | PASS |
| IDEMP-01 | P0 | duplicate HTTP submission → same invoice, duplicate=true | PASS |
| ERR-01..06 | P1 | structured review codes: missing id, bad version, qty 0, unknown item, unknown device, shortfall | PASS (6) |
| SEC-01 | P0 | injection payload rejected safely, no stack leak | PASS |
| SEC-02..04 | P0 | cashier denied device registration + reports; manager allowed | PASS (3) |
| CATALOG-01 | P1 | snapshot schema/content (326 items incl. barcodes+prices) | PASS |
| STOCK-01 | P0 | oversell blocked with review after stock exhausted | PASS |
| RACE-01 | P0 | 3 concurrent submits for 1 unit → 1 commit, 2 explicit conflicts | PASS |
| PERF-01..03 | P2 | latency percentiles (see PERFORMANCE_REPORT.md) | PASS |

## E. Offline/sync & reliability

| ID | Priority | Test | Status |
| --- | --- | --- | --- |
| OFF-* | P0 | covered by UN-25..33 and UN-48..59 (states, retries, durability, crash recovery, duplicate delivery) | PASS |
| RELY-01 | P0 | submit while backend stopped → no commit, error surfaced | PASS |
| RELY-02 | P1 | backend recovers after container restart | PASS |
| RELY-03 | P0 | same transaction after restart commits exactly once | PASS |
| RELY-04 | P0 | further retries return duplicate with same invoice | PASS |

## F. Data integrity & backup

| ID | Priority | Test | Status |
| --- | --- | --- | --- |
| DB-01 | P1 | idempotency unique key enforced (single sync log per txn) | PASS |
| DB-02 | P1 | SQLite FK/transaction atomicity incl. rollback | PASS |
| DB-03 | P2 | duplicate barcodes rejected by ERP (global uniqueness) | PASS (observed in fixture error) |
| BK-01 | P1 | backup → restore into scratch site → apps, 87 invoices, 194 sync logs, 300 items, owner_summary consistent | PASS |

## G. Blocked / not applicable

| ID | Test | Reason |
| --- | --- | --- |
| BL-01 | Desktop E2E (Playwright through Tauri window) | Rust/MSVC toolchain absent → shell cannot be built |
| BL-02 | Physical receipt/label printing, scanner, cash drawer | No hardware connected (protocol-level formatting tests PASS instead) |
| BL-03 | Load testing with k6/Locust | tools not installed; HTTP latency measured with node script instead |
| BL-04 | India Compliance GST scenarios | app not installed (compliance work pending accountant) |
| BL-05 | Multi-window POS concurrency with real desktop app | needs BL-01 |
| NA-01 | Voice assistant | feature not implemented |
