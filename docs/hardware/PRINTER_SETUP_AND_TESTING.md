# Printer Setup and Testing

Status: **IMPLEMENTED_NOT_FULLY_TESTED** (byte-level formatting verified by automated tests; physical hardware NOT verified — no printer was connected)

## Receipt printing (ESC/POS)

- Builder: `apps/windows-pos/src/printing/` — `buildEscPosReceipt` (init, center
  header, item rows, subtotal/tax/total, payment rows + references, change,
  transaction UUID footer, full cut `GS V B 0`). Duplicate reprints are marked
  `*** DUPLICATE COPY ***`; bills not yet synced print "(pending sync)".
- Delivery: `print_raw` Tauri command writes bytes atomically to
  `%APPDATA%/departmental-pos/print_queue/<ts>.bin`. The receipt is retriable:
  `receipt_printed` is stored per transaction in counter SQLite and the Sync
  screen offers Reprint.
- Failure semantics (verified by design + tests): a print failure NEVER blocks or
  alters the sale — the sale remains saved/queued and the UI shows
  "Receipt printing failed — the sale is safe. Reprint from Sync view."

Tests (executed, PASS): `src/domain/receipt.test.ts` — framing (^XA…/^XZ, GS V B 0),
duplicate marker, alignment, payment references, pending-sync marker.

## Label printing (ZPL / TSPL)

- `buildZplLabel` (Zebra + compatibles) and `buildTsplLabel` (TSC/TSPL) — 50×25 mm
  @203 dpi default: item name, SKU, **Code 128 of the item's real barcode** (never a
  fabricated identifier), price + MRP, net quantity, optional batch/expiry.
- Injection-safe: `^`, `~` and control characters from data are sanitized
  (tested: ZPL/TSPL injection attempts render harmless dashes).

Tests (executed, PASS): `src/printing/labels.test.ts` (5 tests).

## Physical hardware procedure (BLOCKED — no device connected)

1. Confirm the receipt printer model supports ESC/POS (most 58/80 mm thermals do).
2. Connect via USB (vendor Windows driver usually creates a RAW spool port) or
   Ethernet (RAW 9100).
3. Replace the spool-watcher: point the queue directory at the vendor's RAW
   passthrough, or extend `print_raw` (src-tauri/src/lib.rs) to open the printer
   via the Windows Print Spooler API (documented extension point).
4. Print the built-in test receipt; verify: store header, bill number, item lines,
   totals, payment, transaction UUID, clean cut.
5. For labels: confirm the printer's language (ZPL for Zebra; TSPL for TSC),
   print a 50×25 label, verify scannability of the Code 128 barcode at the POS
   scanner, and confirm MRP/qty text fits the stock.

Physical verification remains **BLOCKED** — do not mark as verified until a real
receipt/label has been produced and inspected.
