# Project Status

Updated: 2026-10-26 (first implementation session, autonomous run)

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
| Tauri shell | Scaffolded | Cargo project, sqlite plugin, print_raw spool command, icons, capabilities (not compiled — no Rust toolchain on this machine) |
| Owner dashboard | Verified live | rendered ₹1,029 gross / 3 bills / avg ₹343 / Counter 1 Enabled / review queue clear from live ERP via least-privilege token |
| Demo dataset | Seeded | 5 items w/ valid EAN-13 barcodes, batch item, stock receipt, POS profile + opening entry, 3 sales posted SERVER_COMMITTED through the API |

## Implemented but not hardware/production-verified

- Receipt printing: ESC/POS byte generation is unit-tested; `print_raw` queues
  bytes to a spool directory. Real thermal printers require vendor model
  confirmation (ESC/POS vs ZPL/TSPL) — not possible without hardware.
- GST: tax templates flow through ERPNext's standard engine and are included in
  the catalog snapshot; India Compliance app is NOT installed yet; no CGST/SGST
  scenario tests yet (requires accountant-approved expected values).
- Purchasing/supplier flows: reuse standard ERPNext documents (no customization
  was needed); not exercised end-to-end in this session.
- Voice assistant: design only (see known-limitations.md), not started.

## Known limitations (blocking production)

1. **Offline invoice numbering** — offline bills print "(pending sync)"; a
   legally validated numbering strategy is required before production.
2. **No Rust/MSVC toolchain on this machine** — Tauri desktop binary can't be
   compiled here; CI or a dev box with VS Build Tools + rustup needed.
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
