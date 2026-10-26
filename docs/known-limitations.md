# Known Limitations & Unverified Dependencies

Honest register of what is NOT verified, and what must happen before this
system touches real money or real tax authorities.

## Hardware (unverifiable without physical devices)

- **Receipt printers**: ESC/POS bytes are generated and unit-tested, but no
  thermal printer was available. `print_raw` spools to
  `%APPDATA%/departmental-pos/print_queue/`. Real delivery needs the actual
  printer model (USB/Ethernet ESC/POS passthrough or vendor SDK). A print
  failure never blocks or loses a sale (reprint flow).
- **Barcode scanners**: assumed USB-HID keyboard-wedge (standard). The billing
  input handles burst-typing heuristics; needs testing with the actual scanner.
- **Label printers**: not implemented yet (ZPL/TSPL adapter planned after the
  model is confirmed). No manufacturer barcodes are fabricated — internal
  codes are clearly internal.
- **Cash drawer**: not implemented (printer kick interface pending printer).

## Legal / compliance (require qualified human validation)

- **GST**: engine = ERPNext tax workflows (+ India Compliance app when
  installed). No IRNs, signed QR codes, or government responses are fabricated.
  E-invoicing/e-waybill applicability is deliberately unimplemented. Production
  tax configuration and reports MUST be validated by a qualified accountant.
- **Offline invoice numbering**: offline bills deliberately do not get official
  numbers (they print "(pending sync)" + UUID). A legally valid numbering
  strategy for offline sales must be designed before production.
- **UPI/card payment confirmation**: typed references are NOT settlement
  proof. Automatic confirmation requires a payment-gateway integration.

## Environment gaps on this workstation

- **Rust + MSVC Build Tools missing** → the Tauri desktop binary was not
  compiled. All frontend logic is nevertheless built and tested; the shell is
  standard Tauri 2 scaffolding.
- **India Compliance app not installed** in the dev container.
- **Multi-counter concurrency** with the real desktop app unexercised (server
  idempotency itself is bench-tested).

## Deliberate non-goals in v1

- No competing accounting/GST engine in the POS: totals are display-only.
- No direct writes to ERPNext tables: all posting through whitelisted methods
  and the standard document lifecycle.
- No PostgreSQL, no extra microservices, no second authoritative ledger.
- No mock data in production paths; the demo seed is an explicit, named module
  (`departmental_store.seeds`) for dev sites.
