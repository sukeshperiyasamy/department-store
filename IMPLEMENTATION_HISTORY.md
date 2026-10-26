# IMPLEMENTATION_HISTORY

Chronological build record. Every claim links to evidence in docs/testing/ or git history.

## 2026-10-26 — Session 1: Foundation (commit 3bcedc9)
- Repo init; AGENTS/rules; docs scaffold.
- ERPNext v16 docker stack deployed (`deployment/erpnext/pwd.yml`).
- `departmental_store` Frappe app: idempotent `submit_pos_sale` (claim-based via
  POS Sale Sync Log), `check_transaction`, `catalog_snapshot`, devices, reporting.
- **11 bench tests passing**; HTTP path verified (login → submit → structured verdicts).

## 2026-10-26 — Session 2: POS + offline core (commit 8bf99bd)
- `packages/shared-types` (zod API contracts), POS domain (money/cart/outbox/sync-engine/
  catalog/receipt), SQLite persistence (atomic sale+outbox, guarded states), transport,
  billing/payment/sync UI, Tauri 2 shell. 69 vitest tests; tsc strict; vite build.

## 2026-10-26 — Session 3: Manager Console (commit 0a8e00f)
- Next.js dashboard (KPIs, charts, counter health) verified against live ERP (₹1,029 / 3 bills);
  seeds (`seeds.py`); dashboard service user; demo dataset posted through the idempotent API.

## 2026-10-26 — Session 4: QA cycle (commit 2dbd156 + 32007f3)
- 24-check HTTP integration/security/perf suite; reliability check; DR restore rehearsal.
- Fixed: QA-0002 (critical — HTTP sales with `occurred_at` crashed on tz compare),
  QA-0001 (incremental catalog missed price-only changes), QA-0003 (500 leak on bad
  transaction_id), QA-0004 (cashier perms). Full reports in docs/testing/.

## 2026-10-26 — Session 5: UI/UX redesign (commit e484d5e)
- Premium light theme across Manager Console + POS; app shell, new Catalog/Sales/
  Inventory pages; POS boot bugs fixed (UI-0001 null context, UI-0002 unexported Shell);
  14 screenshots; feature-flag groundwork. Incident: tok.tmp/tok.env briefly committed →
  removed 8466a05, tokens rotated + verified dead.

## 2026-10-26/27 — Session 6: Windows, GST, returns, multi-counter (commit 51d86d9)
- **Windows exe built** (rustup-gnu + MSYS2; no admin) and launched; E2E sale flow verified.
  Fixed WIN-001 sql ACL, WIN-002 CORS (tauri-plugin-http), WIN-003 SQLite lock contention,
  WIN-004 silent checkout errors, WIN-005 apps.txt/module-map self-heal.
- **Returns/refunds**: `submit_pos_return` + `get_original_invoice` + POS Returns screen;
  10 bench tests (30 total).
- **India Compliance v16** installed; GST templates; validation cases incl. real POS path
  (₹100 → CGST 9 + SGST 9 = ₹118).
- **Multi-counter suite** (2 independent SQLite counters): 9/9 PASS incl. final-unit race,
  offline, backend restart, concurrent refunds. Fixed MC-D1 naming-series deadlock (server
  retry) and MC-D3 manager-only device registration (cashier-readable `get_device`).
- Label builders (ZPL/TSPL) + tests; backup script + DR rehearsal; STOCK-01 opened (open).

## 2026-10-27 — Session 7: Security hardening + handoff docs (commits f9508fd, e3ddacd, 6db0a81, 490ce1b, 5027fa2)
- Credentials audit: leaked tok.env/tok.tmp untracked, exposed token **rotated + verified
  dead (401)**, local-only `docs/local-demo-credentials.md` (gitignored), history scanned.
- `DATABASE_AND_API.md`, `PROJECT_OVERVIEW.md`, `HANDOFF.md` + pointer docs.

## 2026-10-27 — Session 8: Feature flags + regional catalog (commit 6db0a81 → this HEAD)
- `Departmental Store Settings` single doctype: 10 feature flags + expiry windows;
  `get_settings`/`set_flag`/`require_flag` (System Manager writes, audit-logged) — deployed
  and verified live; `ensure_default_settings` install hook.
- `regional_catalog.py`: 160-product Southern-TN demo seed (19 categories, Tamil/Tanglish
  aliases, synthetic in-store 20-prefix EAN barcodes, HSN records, idempotent). Seeding on
  the test site BLOCKED by the recurring apps.txt/module-map churn (self-heal documented).
- HANDOFF.md + pointer docs (PROJECT_STATUS/ARCHITECTURE/IMPLEMENTATION_SUMMARY/
  TESTING_REPORT/KNOWN_GAPS/NEXT_STEPS), DATABASE_AND_API.md, FEATURE_STATUS.md,
  IMPLEMENTATION_HISTORY.md, KNOWN_ISSUES_AND_TODO.md, TESTING_AND_DEPLOYMENT.md.
