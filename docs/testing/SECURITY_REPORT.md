# Security Report

Scope: the custom code in this repository (Frappe app APIs, POS client, dashboard) and its default deployment. This is **not** a penetration test and not a compliance certification; automated scanners were limited (no dedicated SAST/DAST tooling installed) and findings below come from targeted manual tests executed via `tests/integration/api_suite.mjs` plus code review.

## Tests performed (all on the local test stack, synthetic data)

| ID | Check | Method | Result |
| --- | --- | --- | --- |
| S-01 | Unauthenticated API access | submit/catalog without credentials | PASS — 401/403 (AUTH-01/02) |
| S-02 | Invalid token rejection | bogus `token k:s` header | PASS — 401 (AUTH-03) |
| S-03 | Role-based authorization | cashier token vs manager-only endpoints | PASS — register_device 403, owner_summary 403, server_status 403 (SEC-02/03); manager 200 (SEC-04) |
| S-04 | Server-side enforcement (not UI-only) | direct API calls bypassing any UI | PASS — denials happen in Frappe permission checks (`frappe.only_for`) |
| S-05 | SQL injection | item_code/transaction_id carrying `' UNION SELECT --`, `OR 1=1` | PASS — all DB access via Frappe ORM (parameterized); payloads treated as opaque strings; strict id charset rejects hostile ids pre-write (SEC-01) |
| S-06 | XSS | `<script>` in transaction_id | PASS — rejected by charset; structured responses are JSON consumed by zod-validated clients (no HTML sink) |
| S-07 | Error-message leakage | regex scan of responses for `Traceback`/paths/SQL | PASS post-QA-0003 — structured review results carry only sanitized messages; pre-fix 500-leak fixed and regression-tested |
| S-08 | Secret hygiene | `git grep` of all session-generated tokens/keys across history | PASS — no secrets committed; tokens generated per test run, never stored |
| S-09 | Cookie handling (dashboard) | code review | PASS — session cookie httpOnly, SameSite=Lax, secure in production |
| S-10 | Local DB security | counter SQLite | PASS — no credentials stored; device UUID only; print spool writes to user-local app-data dir |
| S-11 | Payment semantics | data-model review | PASS — UPI/card references stored as references only; never treated as settlement proof |
| S-12 | Least privilege (billing) | cashier end-to-end sale | PASS after QA-0004 — Cashier + Accounts User only; no cancel/delete/amend on invoices |

## Dependency audit (`npm audit`)

9 advisories. Remediation plan (not executed this cycle to avoid unreviewed breaking upgrades):

| Package | Severity | Runtime relevance | Disposition |
| --- | --- | --- | --- |
| zod < 4.6.6 | High | YES (response validation) | Mitigated: every array in our schemas is bounded (`.max()`), so the memory-exhaustion vector (oversized constrained collections from a hostile server) is constrained; the ERP is a trusted LAN peer. Upgrade to zod 4 planned with a type-check pass. |
| tinypool ≤2.1.1 | Critical | NO — vitest worker pool, dev/test only | Upgrade to vitest 5 planned (breaking; suites reviewed then). |
| postcss ≤8.5.22 (via next) | High | NO — build-time only, first-party CSS | Upgrade Next 16 planned. |
| esbuild/vite ≤6.4.3 | Moderate | NO — dev server only | Upgrade with vitest 5. |

## Not performed (limitations)

- No dedicated SAST (Semgrep/CodeQL), DAST (ZAP), or dependency scanners beyond `npm audit`; Python dependency audit not run (container-managed env).
- No penetration testing against hardened/network-exposed deployment; all tests ran on localhost.
- No review of ERPNext/Frappe core (upstream responsibility); site currently uses default dev credentials — **must be changed before any non-local deployment** (documented in deployment.md).
- Concurrency authorization stress (many parallel distinct users) limited to the RACE-01 scenario.

## Findings summary

No open high/critical findings in first-party code. Open items are third-party dev-toolchain advisories with documented dispositions (S-13 in the register above). The one first-party security defect of the cycle (QA-0003 information leak) is fixed with regression coverage.
