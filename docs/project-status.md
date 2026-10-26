# Project Status

Updated: 2026-10-27 (evening — feature flags, regional catalog, docs consolidation)
Previous: 2026-10-26 (first implementation session)

## Completed and verified (executed, observed)

| Area | Status | Evidence |
| --- | --- | --- |
| ERPNext v16 stack (Docker) | Running | containers healthy; site `frontend` created |
| Custom Frappe app installed | Yes | `departmental_store 0.1.0` on site |
| Idempotent sale API | Verified | 11/11 bench tests: duplicate submission returns same invoice; price enforcement; review codes; stock movement (Bin 10→6); GL entries; change amount |
| HTTP path | Verified | login → REST submit → structured verdicts through nginx |
| Lost-response recovery | Verified | `check_transaction` returns recorded verdicts; engine test proves no blind resubmit |
| POS domain logic | Verified | 69 vitest tests: cart, money (minor units), state machine, backoff, catalog search, ESC/POS receipt bytes |
| Counter SQLite durability | Verified | real-SQLite tests: atomic sale+outbox, rollback, restart durability, duplicate delivery guard, crash recovery (stale SYNCING), guarded transitions |
| POS transport | Verified | zod contract validation, timeout→recovery mapping, auth errors |
| POS UI + build | Built | billing (barcode-first, F2/F4/F8), payment (split/change), sync/review screen; tsc strict clean; vite build clean |
| Tauri shell + Windows exe | **Built & launched** | `windows-pos.exe` 8.2 MB; login/catalog/cart/payment/sync E2E via OS automation; see docs/release/ |
| Owner dashboard | Verified live | rendered ₹1,029 gross / 3 bills / avg ₹343 / Counter 1 Enabled / review queue clear from live ERP via least-privilege token |
| Demo dataset | Seeded | 5 items w/ valid EAN-13 barcodes, batch item, stock receipt, POS profile + opening entry, sales posted SERVER_COMMITTED through the API |
| Returns/refunds workflow | **Verified** | 10 bench tests + HTTP MC-08 (concurrent refunds ≤1 commit); POS Returns screen implemented |
| GST (india_compliance v16) | **Verified (software)** | templates + POS-path tax case (₹100 → CGST 9 + SGST 9 = ₹118); synthetic GSTIN; accountant sign-off pending |
| Feature flags (10 modules) | **Verified** | settings doctype + get_settings/set_flag/require_flag deployed on test site |
| Multi-counter/offline suite | **Verified** | 9/9 scenarios (2 independent SQLite counters, race/offline/restart/duplicates/refunds) |
| Windows exe E2E | **Verified** | login → catalog → cart → payment → local save → sync → honest verdict, via real exe (screenshots) |
| Backup + DR restore | **Verified** | run_backup.sh (gzip -t + SHA256) + scratch-site restore rehearsals 10-26 & 10-27 |
| Regional TN catalog (160 products, Tamil/Tanglish) | **Implemented, seeding blocked** | regional_catalog.py complete; site seeding blocked by apps.txt/module-map churn (ISSUE-02) |

## Implemented but not hardware/production-verified

- Receipt printing: ESC/POS byte generation is unit-tested; `print_raw` queues
  bytes to a spool directory. Real thermal printers require vendor model
  confirmation (ESC/POS vs ZPL/TSPL) — not possible without hardware.
- GST: india_compliance v16 installed and templates verified (see
  docs/compliance/GST_IMPLEMENTATION_AND_VALIDATION.md); accountant sign-off and
  real GSTIN still required before production.
- Purchasing/supplier flows: reuse standard ERPNext documents (no customization
  was needed); not exercised end-to-end in this session.
- Voice assistant: design only (see known-limitations.md), not started.

## Known limitations (blocking production)

1. **Offline invoice numbering** — offline bills print "(pending sync)"; a
   legally validated numbering strategy is required before production.
2. **Windows exe built via GNU toolchain** (no MSVC needed); NSIS installer still
   requires an MSVC CI runner. See docs/release/WINDOWS_BUILD_AND_INSTALLATION.md.
3. **Printing hardware integration** — spool-watcher/printer binding pending
   actual printer models.
4. **India Compliance app** — install + configure + test GST scenarios with an
   accountant before real sales.
5. **Payment gateway** — UPI/card references are records, not settlement proof.
6. **Backups/restore rehearsal** — scripts documented, not yet scheduled.
7. **Multi-counter concurrency** — server idempotency tested; two simultaneous
   counters running the actual app has not been exercised (needs the desktop
   build).

## Exact next actions

1. Install Rust + MSVC on a build machine; `cargo tauri build`; run the POS
   against the live ERP at localhost:8080; bill, print, kill network, bill
   offline, restore network, watch sync commit without duplicates.
2. Install `india_compliance` on the site; configure company GSTIN and tax
   templates; add bench tests with accountant-approved expected results.
3. Wire the print spool watcher to the actual receipt printer; add label
   printing (ZPL/TSPL) adapter once the model is known.
4. Add returns/exchange UI flow in POS (server path exists: ERPNext returns).
5. Dashboard: stock valuation, low stock, expiry, supplier dues pages using
   ERPNext report APIs; add notification preferences.
6. Schedule bench backups + offsite copy; rehearse restore.
7. Two-counter concurrency soak test.


## 2026-10-27 (evening) additions

- Feature-flag settings doctype + API deployed (10 modules; System Manager writes, audit-logged).
- Regional TN catalog seed written (160 products, Tamil/Tanglish aliases, synthetic in-store
  barcodes) — execution blocked by apps.txt churn (ISSUE-02); self-heal first.
- Known open defect: STOCK-01 availability mismatch under india_compliance (BUG_REPORT).
- Docs consolidated: HANDOFF.md, README refresh, DATABASE_AND_API.md, PROJECT_OVERVIEW.md,
  FEATURE_STATUS.md, IMPLEMENTATION_HISTORY.md, KNOWN_ISSUES_AND_TODO.md, TESTING_AND_DEPLOYMENT.md.
