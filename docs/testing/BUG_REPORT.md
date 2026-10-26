# Bug Report — consolidated defect register

All defects below were found during the 2026-10-26 QA cycle, fixed, and covered by regression tests that were executed (PASS) after the fix.

---

## QA-0002 — Every HTTP sale with `occurred_at` crashed before posting

- **Severity:** Critical · **Priority:** P0 · **Status:** FIXED + regression tests
- **Module:** `erpnext-app/departmental_store/.../api/sales.py` (`_posting_date`)
- **Preconditions:** POS submits a sale with an ISO `occurred_at` including a timezone offset (the normal case for the real client).
- **Repro:** `POST /api/method/departmental_store.api.sales.submit_pos_sale` with payload `{"occurred_at": "2026-10-26T18:56:00.000Z", ...}` → response `status: REQUIRES_REVIEW, error.code: INVOICE_POSTING_FAILED, message: "TypeError: can't compare offset-naive and offset-aware datetimes"`.
- **Expected:** SERVER_COMMITTED with the counter's business date.
- **Root cause:** `get_datetime(iso)` yields a tz-aware datetime; `now_datetime()` is naive → comparison raises TypeError. Escaped the original bench suite because its payloads never set `occurred_at`.
- **Impact:** every real POS submission would have failed (found by the HTTP integration suite before any release).
- **Fix:** convert aware timestamps to server-local naive time before comparing; invalid/out-of-window timestamps still go to review, never crash.
- **Regression tests:** `TestOccurredAtHandling` (3 bench tests: aware ISO commits; far-future → review; stale → review) — PASS. HTTP suite CONTRACT-01/RECOVERY-01/IDEMP-01 — PASS.
- **Remaining risk:** none known; counters should send ISO timestamps with offset (documented).

## QA-0001 — Price-only changes never reached counters via incremental catalog sync

- **Severity:** High · **Priority:** P1 · **Status:** FIXED + regression tests
- **Module:** `erpnext-app/departmental_store/.../api/catalog.py`
- **Repro:** full snapshot → change only an Item Price → `catalog_snapshot(since=checkpoint)` returned no items for that item; checkpoint also lagged price changes.
- **Expected:** incremental snapshot re-sends the changed-price item with its current price; checkpoint covers price modifications.
- **Root cause:** incremental item selection filtered only on `Item.modified`; prices were fetched only for re-sent items; checkpoint = max(Item.modified) only.
- **Impact:** counters would keep selling at stale prices between full refreshes.
- **Fix:** incremental selection = items changed OR having a selling price changed after `since`; re-sent items carry present-day prices; checkpoint = max(Item.modified, ItemPrice.modified).
- **Regression tests:** `test_catalog_api.py` (4 bench tests) — PASS; HTTP PERF-02 (incremental returns exactly 1 item) — PASS.

## QA-0003 — Malformed transaction_id caused HTTP 500 with internal stack trace

- **Severity:** High · **Priority:** P1 · **Status:** FIXED + regression tests
- **Module:** `api/sales.py` (`_claim_transaction`, input validation)
- **Repro:** submit with `transaction_id` = `"x' OR 1=1 --;<script>alert(1)</script>"` → HTTP 500, response contains Frappe traceback (`exc` field).
- **Expected:** safe structured rejection; no internal details.
- **Root cause:** the idempotency claim insert ran outside the try/except; non-duplicate insert exceptions (e.g. invalid document name characters) escaped as unhandled errors; no input charset validation.
- **Fix:** strict `transaction_id` charset `^[A-Za-z0-9_\-\.]{1,100}$` validated before any write; claim insert failures are contained, logged server-side, and returned as a structured retryable review result (nothing posted).
- **Regression tests:** `TestTransactionIdValidation` (2 bench tests) — PASS; HTTP SEC-01 — PASS.

## QA-0004 — Cashier role could not bill over HTTP (configuration gap)

- **Severity:** Medium · **Priority:** P1 · **Status:** FIXED
- **Module:** `install.py` (permissions), `seeds.py` (test user)
- **Repro:** submit a sale with a Cashier-role token → `PermissionError: User don't have permissions to select/read this account` (GL posting requires account access the role lacked).
- **Fix:** installer creates a least-privilege Custom DocPerm for Cashier on Sales Invoice (read/write/create/submit — no cancel/delete/amend); test/deployment convention documented: billing users also hold ERPNext's standard "Accounts User" role. Reporting and device registration remain manager-only (verified by SEC-02/03/04).
- **Regression:** HTTP CONTRACT-01 now runs as cashier end-to-end — PASS.

## QA-0005 — API suite flakiness from shared demo stock

- **Severity:** Low (test infrastructure) · **Status:** FIXED
- **Detail:** repeated suite runs consumed the demo biscuit stock until sales failed with insufficient stock. Suite now uses non-stock PERF items for idempotency/latency cases and creates dedicated race items per run.

## QA-0006 — Backend stopped but proxy up returns 502 HTML (Informational)

- **Status:** Accepted behavior, documented. The POS transport classifies this as a server error and retries with bounded backoff; the reliability check proves no false commit and exactly-once commit after recovery. The sync badge keeps the transaction visible.

## QA-0007 — Duplicate barcodes are rejected globally by ERPNext (Informational, positive)

- **Status:** Confirmed integrity behavior: ERPNext rejects assigning a barcode already used by another item ("Barcode … already used in Item …"), so the counter's last-wins barcode conflict scenario cannot arise from normal ERP entry.

---

### Not defects (investigated and cleared)

- Payment split showing tendered vs allocated cash — corrected in the previous cycle (reports.py reduces cash rows by invoice change_amount); verified again this cycle via owner_summary output.
- `UNBOUNDLOCAL` crash on fresh sites (frappe/locale.py v16.53) — upstream Frappe bug; platform works around it by setting the site language in `install.py` and seeds.


---

## 2026-10-27 addendum (Windows/GST/multi-counter phase)

### WIN-001..005 — Windows bring-up defects (all FIXED, see docs/release/WINDOWS_BUILD_AND_INSTALLATION.md)
- WIN-001 sql ACL missing execute (FIXED); WIN-002 CORS blocked webview (FIXED via tauri-plugin-http);
  WIN-003 SQLite lock contention sync-loop vs checkout (FIXED via WAL + serialization);
  WIN-004 silent checkout failures (FIXED, errors surfaced); WIN-005 stale apps.txt/module map
  (FIXED via ensure_app_registered self-heal).

### MC-D1 — naming-series deadlock under two-counter concurrency (FIXED)
- Severity: Medium · Repro: two counters POST sales in the same instant →
  QueryDeadlockError on tabSeries · Fix: single safe retry in submit_pos_sale ·
  Regression: multi_counter MC-02 (PASS).

### QA-MC-001 (OPEN, under investigation) — STOCK-01 availability mismatch with india_compliance enabled
- Severity: Medium · Symptom: sale of exactly the raced qty (2 seeded, bin=2.0) rejected
  claiming 1.0 units short, only when india_compliance is installed · Equivalent MC-03 passes ·
  Next: instrument get_stock_availability path (reservation/UOM) on the test site.

## 2026-10-27 addendum #2 — fresh-stack reset: QA-0005 resolves STOCK-01; ISSUE-02 infra root cause

### QA-0005 — posting-date timezone split fails stock validation (CRITICAL, FIXED)
- Severity: Critical (every stock-item HTTP sale posted within seconds/minutes of a stock receipt
  failed with NegativeStockError when container TZ ≠ site TZ; the historical "STOCK-01" and
  ISSUE-01 investigation traced here)
- Root cause: `_posting_date` used `datetime.astimezone()` (container TZ = UTC) while Frappe posts
  stock entries in the site timezone (fresh sites ship `System Settings.time_zone` EMPTY → Frappe
  falls back to Asia/Kolkata). The sale's posting date landed on the previous calendar day, so the
  receipt SLE sat "in the future" of the sale and the running balance was 0 → "2.0 units needed"
  with a full bin. Non-stock PERF items (no stock validation) masked the defect in most checks.
- Fix: convert via `frappe.utils.convert_utc_to_timezone(dt, get_system_timezone())` in
  `_posting_date`; `install.ensure_site_timezone` pins Asia/Kolkata on fresh sites.
- Regression: `test_posting_date_converts_to_site_timezone_not_process_tz` (deterministic),
  `test_utc_aware_timestamp_uses_site_timezone_date` (end-to-end). Post-fix: api_suite 24/24,
  STOCK-01 `full=SERVER_COMMITTED` + oversell blocked; RACE-01 `committed=1 review=2`.

### ISSUE-02 (infrastructure root cause — configurator re-run) — FIXED
- `docker compose start backend` re-runs the exited one-shot `configurator` service
  (compose satisfies `service_completed_successfully` deps), whose `ls -1 apps > sites/apps.txt`
  overwrote apps.txt with the baked-only app list (frappe/erpnext) — wiping custom apps on every
  backend restart. Fresh bench processes then lost module discovery ("Module GST India not found").
- Fix: pwd.yml configurator now MERGES (`sort -u` union) baked apps into apps.txt. Proven:
  backend restart re-ran configurator and apps.txt retained all 4 apps. Test scripts self-heal via
  `ensure_app_registered` after restarts.

### TEST-DEFECT — multi_counter.ts verdict counting (FIXED)
- `record(id, status, detail)` received 4 args from every call site: verdicts landed in `detail`,
  summary always 0/0, exit code always 0 (suite could never fail a build). Signature corrected to
  `(id, name, status, detail)`; truthful result: 11/11 PASS.

### Resolved diagnostics + seed compliance (same pass)
- `ensure_app_registered`/`check_module_map` asserted app names as module keys (never true for
  frappe/erpnext/india_compliance) → fixed to probe real module keys.
- india_compliance enforces HSN on sales items and links Item Tax rows via GST HSN Code master
  records: demo items now carry plausible HSNs; synthetic `999999` (master record created) for
  race/PERF/test items via `seeds._ensure_demo_hsn`.
- `regional_catalog.seed`/`check_module_map` return dicts (bench `execute` prints strings
  repr-escaped, which broke script JSON parsing).

### ISSUE-05 — resolved by environment reset (not a product defect)
- After `down -v` + full reseed + entire validation matrix: `Innodb_deadlocks = 0` and zero
  deadlock matches in backend/queue logs. Prior contention did not reproduce; MC-D1 retry remains
  as defense in depth. Production sizing/indexing review still recommended pre-go-live.

### QA-MC-001 → CLOSED (superseded by QA-0005 fix)

---

## 2026-10-27 addendum #3 — Post-implementation audit of Settings Console

### AUDIT-001 — Duplicate HTML input IDs across Settings sections (Accessibility/DOM, FIXED)
- **Severity:** Medium · **Priority:** P2 · **Status:** FIXED + regression tests
- **Module:** `apps/owner-dashboard/src/components/SettingsClient.tsx`
- **Symptom:** In "All Settings" default view, feature flags rendered in domain sections (Section 2 Regional, Section 6 Printers, Section 7 Inventory, Section 8 Voice) and again in Section 5 (Central Flags). Both occurrences rendered `<input id={`toggle-${meta.key}`} />` and `<label htmlFor=...>`, violating HTML uniqueness and causing label clicks to bind incorrectly.
- **Fix:** Added `idPrefix` parameter to `SettingRow` (`regional`, `central`, `printers`, `inventory`, `voice`). Input IDs are now globally unique: `toggle-${idPrefix}-${meta.key}`. Added `role="switch"` and `aria-checked={enabled}` for WCAG switch pattern compliance.
- **Regression:** `SettingsClient.test.tsx` verified unique section input IDs and accessible switch attributes — PASS.

### AUDIT-002 — Operational health was not querying real-time database status (FIXED)
- **Severity:** Low · **Priority:** P2 · **Status:** FIXED + regression tests
- **Module:** `erpnext-app/departmental_store/.../api/reports.py` (`server_status`)
- **Symptom:** Manager console System Health section displayed static text for MariaDB version and deadlock counter rather than real live engine metrics.
- **Fix:** Enhanced `server_status()` to execute `SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'` and `SELECT VERSION()`. Added `DatabaseStatusSchema` to `@departmental/shared-types`. SettingsClient now dynamically renders live `database.version` and `database.innodb_deadlocks` (confirmed 0 deadlocks).
- **Regression:** `test_server_status_database_health` in `test_settings_api.py` — PASS.

### AUDIT-003 — Single DocType setter deprecation warning in Frappe v16 (FIXED)
- **Severity:** Low (Code quality) · **Status:** FIXED
- **Module:** `erpnext-app/departmental_store/.../api/settings.py` (`set_flag`)
- **Fix:** Switched from `frappe.db.set_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, ...)` to `frappe.db.set_single_value(SETTINGS_DOCTYPE, flag, new_value)`. Deprecation warning eliminated.

### AUDIT-004 — Demo GSTIN safety banner (Compliance Guard, FIXED)
- **Severity:** Medium · **Priority:** P1 · **Status:** FIXED
- **Module:** `apps/owner-dashboard/src/components/SettingsClient.tsx`
- **Fix:** Added prominent, unmistakable callout banner in Section 3 and alert badge marking `33AAAAA0000A1Z5` as synthetic test data and specifying accountant sign-off as mandatory before production billing.

