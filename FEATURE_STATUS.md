# FEATURE_STATUS

Statuses: ✅ VERIFIED (executed with evidence) · 🟡 IMPLEMENTED_NOT_FULLY_TESTED · 🚧 PARTIAL · ⛔ BLOCKED · ⬜ NOT STARTED
Evidence pointers: docs/testing/, docs/artifacts/. Date of last verification: 2026-10-27.

## Core billing & backend

| Feature | Status | Evidence |
| --- | --- | --- |
| Idempotent sale submission (claim + unique txn id) | ✅ | bench BI-01, HTTP IDEMP-01, MC-06, RELY-03/04 |
| Server-side re-pricing (client rates ignored) | ✅ | bench BI-test, HTTP CONTRACT-01 |
| Stock + GL effects via ERPNext lifecycle | ✅ | bench BI-08 (SLE + GL), GST cases |
| Lost-response recovery (check_transaction) | ✅ | RECOVERY-01, RELY-03, engine tests |
| Deadlock retry (two-counter tabSeries race) | ✅ | MC-D1 fix, MC-02 |
| Returns/refunds (partial, full, authz, idempotent) | ✅ | 10 bench tests, MC-08, GUI screen |
| Catalog snapshot sync (items+prices checkpoint) | ✅ | bench catalog tests, PERF-02 |
| Device registration (manager-only) + status check | ✅ | SEC-02/03, MC-DEVICES |
| Feature flags (10 modules) + settings API | ✅ | settings doctype migrated + API verified live |
| Owner summary / stock alerts / recent invoices APIs | ✅ | HTTP-verified against live ERP |
| Backup + DR scratch-site restore | ✅ | run_backup.sh + rehearsal 10-26 & 10-27 |
| Audit logging (flag changes, overrides, sync events) | ✅ | logger calls; flag change test |

## POS client (Tauri 2 + React)

| Feature | Status | Evidence |
| --- | --- | --- |
| Login + device registration flow | ✅ | real exe E2E (WIN fixes) |
| Catalog sync to SQLite (v2 schema) | ✅ | repos tests, GUI verified |
| Barcode/search billing, cart, qty, remove | ✅ | GUI E2E + component tests |
| Payment (cash/UPI/card, split, change, shortfall guard) | ✅ | GUI E2E, unit tests |
| Durable local save + outbox (atomic) | ✅ | real SQLite tests incl. rollback |
| Sync engine (backoff, lost-response, crash recovery) | ✅ | sync-engine tests |
| Sync/review screen (retry, reprint) | ✅ | component + unit tests |
| Returns screen | 🟡 | implemented + typed; UI not yet exercised in the packaged exe |
| Receipt printing (ESC/POS bytes, duplicate marker) | ✅ builder / ⛔ physical device |
| Label printing (ZPL + TSPL, sanitization) | ✅ builder / ⛔ physical device |
| Feature-flag gating of POS modules | 🚧 | flags API live; POS screens not yet flag-gated |
| Tamil/Tanglish catalog search | ✅ | catalog tests (alias ranking) |
| Tamil voice assistant (Ctrl+Space, parser) | 🚧 | parser spec'd; engine unselected; not started |
| Camera/OCR batch capture | ⬜ | spec only |
| Shift open/close UI | 🚧 | SQLite repo exists, no screen |
| NSIS installer | ⛔ | MSVC CI runner needed |

## Manager Console (Next.js)

| Feature | Status | Evidence |
| --- | --- | --- |
| Dashboard (KPIs, charts, recent bills, counters) | ✅ | live-ERP screenshots |
| Catalog / Sales / Inventory alerts / Sync & Health pages | ✅ | live-ERP screenshots |
| Login (session) + service-token auth | ✅ | SEC matrix |
| Settings page (feature flags UI, 9 sections, live DB health, GST guard) | ✅ | /settings live, 10 flags persisted via set_flag, live MariaDB status, 9 vitest tests, 8 bench tests, WCAG switch accessible |
| Mobile responsive light theme | ✅ | 390/768/1366/1920 screenshots, settings layout tested |

## Backend platform

| Feature | Status |
| --- | --- |
| ERPNext v16 docker stack + seeds + self-heal | ✅ |
| India Compliance v16 + GST templates + POS-path GST | ✅ math / 🟡 accountant sign-off |
| Backup script + DR rehearsal | ✅ / scheduler registration pending |
| e-invoicing / e-waybill | ⬜ disabled pending legal determination |
| Tamil voice speech engine | ⬜ |
| MCP adapter (typed tool boundary only) | 🚧 |
