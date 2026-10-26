# KNOWN_ISSUES_AND_TODO

Last updated: 2026-10-27. Full defect register: `docs/testing/BUG_REPORT.md`.

## Open issues

### ISSUE-01 — STOCK-01 availability mismatch with india_compliance (Medium, under investigation)
- Sale of exactly the seeded race qty (2; Bin shows 2.0) rejected claiming 1.0 unit short.
- Only occurs with india_compliance installed; equivalent multi-counter MC-03 passes.
- Suspect: `get_stock_availability` interaction (reservation / UOM / batch settings).
- Next: instrument `erpnext/stock/get_stock_availability` on the test site; check
  `Sales Taxes and Charges Template`-independent stock settings and Batch expiry reservations.

### ISSUE-02 — regional catalog seeding blocked by apps.txt/module-map churn (Medium)
- `sites/apps.txt` and redis `app_modules`/`installed_app_modules` repeatedly lose installed
  apps after interrupted bench operations → "Module … not found" everywhere.
- Workaround implemented: `bench --site frontend execute departmental_store.install.ensure_app_registered`
  (+ `clear-cache` + backend restart). Root cause of the rewriter still unknown.
- Consequence: `regional_catalog.seed` (160 products) is written but not yet executed on the
  test site. Run self-heal → seed → verify counts + Tamil alias search.

### ISSUE-03 — server error messages contain raw HTML (Low, cosmetic)
- ERPNext validation messages (e.g. stock shortfall) include `<strong>/<a>` markup which the
  POS result dialog renders as literal text. Strip HTML in `departmental_store.api.*`
  responses or render as rich text client-side.

### ISSUE-04 — remaining `bench` console quirks (Low, environment)
- IPython heredocs swallow multiline output; bench kwargs break through Git Bash quoting.
- Mitigation in place: no-arg seed wrappers; prefer `bench execute` return values.

## TODO — prioritized

1. **Regional catalog seed execution** — self-heal (`ensure_app_registered`) → `regional_catalog.seed`
   → verify item counts, Tamil alias search, QA-profile sales. Doc: docs/catalog/ (to write).
2. **STOCK-01 investigation** (ISSUE-01).
3. **Settings UI page** on Manager Console reading `get_settings` / writing `set_flag`.
4. **Tamil voice assistant**: deterministic parser + transcript fixtures → Ctrl+Space +
   speech provider (Vosk/Whisper decision) → flag `voice_assistant_enabled` gating.
5. **Camera/OCR batch capture** per spec (flags `camera_product_capture_enabled`).
6. **NSIS installer** on MSVC CI runner; narrow HTTP capability scope to the store's server.
7. **Accountant GST sign-off** → real GSTIN/HSN data; then evaluate e-invoicing/e-waybill.
8. **Physical printer + camera validation** when hardware arrives.
9. **Backup scheduler registration** on the store server (script + runbook ready).
10. **k6 load test** + 20k-item catalog performance pass.
11. **Returns screen** exercise in the packaged exe (API verified; UI pending device test).

## Rules reminders (from AGENTS.md — still binding)

- No direct DB writes; ERPNext lifecycle only. No force-push. No secrets in git
  (credentials: gitignored `docs/local-demo-credentials.md`). Demo barcodes are
  synthetic in-store range `20…`. Never claim unverified hardware/tax/accuracy results.
