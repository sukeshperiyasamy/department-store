# KNOWN_ISSUES_AND_TODO

Last updated: 2026-10-27 (fresh-stack validation pass). Full defect register: `docs/testing/BUG_REPORT.md`.

## Resolved issues (evidence in docs/testing/)

### ISSUE-05 — dev-container DB contention — RESOLVED 2026-10-27 by full environment reset
- Backup `20261027_035610` verified (gzip -t + SHA256SUMS) before `docker compose down -v`.
- Fresh stack: MariaDB 11.8 + ERPNext v16.52.1/Frappe v16.53.0 site `frontend`, both custom apps
  reinstalled (`departmental_store` 0.1.0, `india_compliance` 16.11.0 version-16), reseeded
  (demo users, QA POS profile, 160-item regional catalog idempotent, GST templates, 300 PERF items).
- **Zero deadlocks after the full validation pass**: `Innodb_deadlocks = 0` (queried via
  `mariadb` in the db container), 0 "deadlock" matches in backend + queue-worker logs across
  api_suite (concurrent RACE-01), multi_counter (two-counter races, concurrent refunds) and
  reliability_check. The prior contention did not reproduce on the fresh volumes.
- The MC-D1 single-retry safety net stays in `submit_pos_sale` as defense in depth.
- Production sizing/indexing review remains a TODO before go-live.

### ISSUE-01 / STOCK-01 — RESOLVED as QA-0005 (real product defect, not environment)
- True root cause found during the fresh-stack run: `_posting_date` converted tz-aware
  `occurred_at` with Python `datetime.astimezone()`, which follows the **container TZ (UTC)**,
  while Frappe posts stock entries in the **site timezone (Asia/Kolkata fallback — the fresh site
  shipped with an empty `time_zone`)**. The posting date landed on the previous calendar day, so
  any receipt posted minutes earlier sat "in the future" of the sale and stock validation failed
  with NegativeStockError ("2.0 units of RACE-ITEM-… needed…") even though the bin had the stock.
  Non-stock PERF items masked the bug (no stock validation), which is why suites mostly passed.
- Fix: `_posting_date` now converts via `frappe.utils.convert_utc_to_timezone(occurred,
  get_system_timezone())`; new `ensure_site_timezone` pins `System Settings.time_zone = Asia/Kolkata`
  on install. Regression tests: `test_posting_date_converts_to_site_timezone_not_process_tz`
  (deterministic) and `test_utc_aware_timestamp_uses_site_timezone_date` (end-to-end).
- Post-fix evidence: api_suite STOCK-01 PASS (`full=SERVER_COMMITTED`, oversell blocked),
  RACE-01 PASS with correct semantics (`committed=1 review=2` for 1 unit).

### ISSUE-02 — RESOLVED 2026-10-27 at the infrastructure layer (second root cause found)
- New mechanism discovered: the one-shot `configurator` service (`ls -1 apps > sites/apps.txt`)
  **re-runs on every `docker compose start backend`** (compose re-runs exited
  `service_completed_successfully` dependencies), and the configurator container only has
  frappe/erpnext baked in — so every backend restart wiped the custom apps from apps.txt.
  Warm gunicorn/redis module caches masked it; fresh bench processes (e.g. `bench run-tests`)
  then failed with "Module GST India not found".
- Permanent fix: the configurator command in `deployment/erpnext/pwd.yml` now MERGES its baked
  app list into sites/apps.txt (`sort -u` union) instead of overwriting. Proven: `stop backend`
  + `start backend` re-ran the configurator (StartedAt 23:07:33Z) and apps.txt retained all 4
  apps. `ensure_app_registered` (union self-heal) and `tests/integration/apps_txt_guard.mjs`
  remain as defense in depth; multi_counter/reliability restart steps now self-heal explicitly.
- Test-layer fixes in the same pass: `check_module_map`/`ensure_app_registered` reported a
  never-true assertion (probed app names as module keys — frappe has no module "frappe",
  erpnext none "erpnext", india_compliance none "india_compliance"); diagnostics now probe real
  module keys (`departmental_store`, `income_tax_india`, `gst_india`, `accounts`).

### Seed/QA fixes bundled with the fresh stack (2026-10-27)
- **HSN on all seed/test items**: india_compliance enforces HSN on sales items (length-validated
  against GST Settings) and links Item Tax rows via the GST HSN Code master. Demo items now carry
  plausible HSN codes (toothpaste 330610, rice 100600, milk 040110, biscuit 190531, shampoo 330510);
  race/PERF/test items use synthetic `999999`; all reference records are created by
  `seeds._ensure_demo_hsn`. Keep `validate_hsn_code` ON — the GST validation suite needs it.
- `regional_catalog.seed` and `check_module_map` now return dicts (bench `execute` prints dicts as
  clean JSON; json.dumps strings get repr-escaped and break script parsing).
- `multi_counter.ts` `record(id, name, status, detail)` signature fixed — verdicts previously
  landed in `detail`, so the summary could never count PASS/FAIL and the script always exited 0.
- Old aware-occurred_at test fixture sent site-local wall time mislabeled as UTC; it now sends
  true UTC (what a real counter sends) — under the QA-0005 contract the old fixture is
  legitimately 5.5h ahead and goes to review.

### ISSUE-03 — server error messages contain raw HTML (Low, cosmetic, OPEN)
- ERPNext validation messages (e.g. stock shortfall) include `<strong>/<a>` markup which the
  POS result dialog renders as literal text. Strip HTML in `departmental_store.api.*`
  responses or render as rich text client-side.

### ISSUE-04 — remaining `bench` console quirks (Low, environment, OPEN)
- IPython heredocs swallow multiline output; bench kwargs break through Git Bash quoting.
- `bench --site X pip install` is invalid (pip is bench-level: `bench pip install -e ./apps/app`).
- `bench execute` falls back to `eval` of the method string when the call raises, masking the
  real exception with a confusing NameError — debug via `bench console` when a seed "fails".
- Mitigation in place: no-arg seed wrappers (`demo_run`, `seed_run`, `setup_run`, …); prefer
  `bench execute` return values.

### Manager Console Settings Page — RESOLVED 2026-10-27
- Responsive Settings interface at `/settings` on Manager Console matching light theme (white cards, soft grey background, teal accents).
- 9 categorized sections: Store Profile, Regional Preferences (Tamil Nadu), GST Configuration, POS Counters & Devices, Feature Flags, Printers, Inventory & Expiry, Voice & AI Integration, and System Health.
- Live persistence via Next.js Server Action invoking `set_flag(flag, value)`; server authorization enforced (System Manager required; 403 surfaced with clear error feedback and state rollback).
- Honest status indicators for unavailable/pending hardware features (e-invoicing exempt, speech engine unconfigured, physical printer validation pending, GST accountant sign-off pending).
- Test suites: 5 bench tests (`TestSettingsApi`), 8 unit/component tests in owner-dashboard, 4 shared-types contract tests, Next.js production build PASS.

## Open issues
- ISSUE-03 (HTML in error messages) and ISSUE-04 (bench quirks) above.

## TODO — prioritized

1. **Tamil voice assistant**: deterministic parser + transcript fixtures → Ctrl+Space +
   speech provider (Vosk/Whisper decision) → flag `voice_assistant_enabled` gating.
2. **Camera/OCR batch capture** per spec (flags `camera_product_capture_enabled`).
3. **NSIS installer** on MSVC CI runner; narrow HTTP capability scope to the store's server.
4. **Accountant GST sign-off** → real GSTIN/HSN data; then evaluate e-invoicing/e-waybill.
5. **Physical printer + camera validation** when hardware arrives.
6. **Backup scheduler registration** on the store server (script + runbook ready).
7. **k6 load test** + 20k-item catalog performance pass.
8. **Returns screen** exercise in the packaged exe (API verified; UI pending device test).
9. **Production DB sizing/indexing review** (deferred from ISSUE-05; dev stack is clean).


## Fresh-stack provisioning notes (for reproducibility)

- `bench pip` is bench-level, not site-level. App install order on a fresh stack:
  `bench pip install -e ./apps/departmental_store` → write full `sites/apps.txt` →
  `bench --site frontend install-app departmental_store` → `bench get-app india_compliance …
  --branch version-16` → `bench --site frontend install-app india_compliance` → migrate →
  run all `ensure_*` helpers → seeds. If `bench get-app`'s dir rename races, remove the
  orphaned duplicate dir and fix apps.txt before migrating (done once this session).
- After installing/updating apps inside the backend container, RESTART backend + queue workers +
  scheduler (long-lived processes don't re-read `.pth` files), then restart frontend so its
  nginx re-resolves the backend IP (`stop/start` of backend also re-runs the configurator —
  now safe with the merge fix).
- Seeding is idempotent; the guard (G-03) asserts catalog re-seed is a no-op.

## Rules reminders (from AGENTS.md — still binding)

- No direct DB writes; ERPNext lifecycle only. No force-push. No secrets in git
  (credentials: gitignored `docs/local-demo-credentials.md`). Demo barcodes are
  synthetic in-store range `20…`. Never claim unverified hardware/tax/accuracy results.
