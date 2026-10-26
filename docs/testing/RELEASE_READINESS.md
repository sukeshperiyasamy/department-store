# Release Readiness — release gate checklist

Commit: `76813d8` + QA fixes (QA-0001/0002/0003/0004) · Date: 2026-10-26

## ERP-specific release gates (from the master QA brief)

| # | Gate | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A finalized sale cannot be duplicated by retrying a request | **PASS** | bench BI-01; HTTP IDEMP-01; RELY-03/04 (across backend restart) |
| 2 | Finalized transactions use supported ERPNext/Frappe workflows | **PASS** | Sales Invoice (is_pos) via standard lifecycle; bench BI-07/08; no direct table writes (code review + custom API surface) |
| 3 | Stock and accounting effects consistent with the transaction | **PASS** | bench BI-08 (SLE 10→6, GL entries), demo data cross-checks |
| 4 | No direct DB write bypasses validation | **PASS** | custom code uses whitelisted methods + document lifecycle only |
| 5 | Offline transactions remain durable and visible until reconciled | **PASS** (logic) / **PARTIAL** (real shell) | SQLite suite (atomic outbox, restart, crash recovery); desktop-shell soak blocked |
| 6 | Sync retries never lose transactions or duplicate finalized sales | **PASS** | sync-engine suite; RACE-01 (1 commit / 2 surfaced conflicts) |
| 7 | Concurrent counter conflicts handled explicitly | **PASS** | RACE-01; REQUIRES_REVIEW queue + dashboard review view |
| 8 | Cashier permissions enforced server-side | **PASS** | SEC-02/03/04 + QA-0004 fix |
| 9 | Refunds/discounts/price overrides respect permissions | **PARTIAL** | rate override gate tested (client rate ignored; manager override audited); **returns/refunds not implemented in custom API yet** |
| 10 | Backup and recovery documented and tested | **PASS** | backup → scratch-site restore verified; schedule not yet operationalized |
| 11 | System never invents official tax/government identifiers | **PASS** | no IRN/QR generation anywhere; offline bills print "(pending sync)" |
| 12 | Uncertain payments not shown as successful | **PASS** | references stored as references; UI wording; no gateway confirmation |
| 13 | Secrets and customer data protected | **PASS** | secret scan clean; .env.example placeholders; demo data only |
| 14 | Critical test evidence available and reproducible | **PASS** | docs/testing/* + artifacts; suites re-runnable (TEST_ENVIRONMENT.md) |

## Additional readiness items

| Item | Status |
| --- | --- |
| TypeScript strict typecheck + production builds | PASS |
| Dependency audit advisories (dev toolchain) | OPEN (documented dispositions) |
| GST/India Compliance configuration + accountant sign-off | **NOT DONE** (production blocker) |
| Offline invoice numbering legal design | **NOT DONE** (production blocker) |
| Tauri desktop build (Rust/MSVC) | **BLOCKED** on this machine |
| Hardware validation (printer/scanner/drawer) | **BLOCKED** (no devices) |
| k6 load test | NOT RUN (provisional latency measurements only) |
| Multi-counter soak with real desktop app | NOT RUN (needs desktop build) |

## Recommendation

**CONDITIONAL GO** — internal pilot on one supervised counter with test/demo data is supported by the evidence (core billing, idempotency, offline durability, authorization, backup restore all verified).

**NO-GO for production revenue use** until: (a) Tauri app built and counter E2E validated on real hardware, (b) GST configuration with India Compliance reviewed by a qualified accountant, (c) a legally validated offline invoice numbering strategy exists, (d) backup schedule operationalized, (e) load test on production-scale catalog. Owners for (a)–(e): store engineering team; see docs/known-limitations.md and docs/project-status.md "Exact next actions".
