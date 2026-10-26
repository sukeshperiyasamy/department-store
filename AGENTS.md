# Department Store ERP — Repository Instructions

## Product goal
Build a reliable departmental-store management system for one store with 2–3 Windows billing counters. ERPNext/Frappe is the authoritative business backend. The custom Windows POS is Tauri + React + TypeScript, with SQLite for local caching and durable offline transaction queues.

## Architecture rules
- Reuse ERPNext DocTypes and business workflows wherever they meet requirements.
- Never write directly to ERPNext database tables from the POS or integration services.
- Use supported Frappe APIs or custom server-side methods that invoke the normal ERPNext business lifecycle.
- Central ERPNext is authoritative for finalized stock, accounting, and official invoice records.
- Counter SQLite is authoritative only for local drafts and pending local operations.
- Cloud/mobile layers are clients/reporting layers, not a second authoritative inventory or accounting ledger.
- Do not add microservices, databases, queues, or infrastructure without a concrete requirement.

## Critical transaction rules
- Every locally created transaction must have a stable unique ID.
- Server-side idempotency must prevent duplicate finalized sales when requests are retried.
- Persist local transaction and outbox event atomically in SQLite.
- Persist server-side idempotency record and business result atomically where possible.
- Never mark a transaction `SERVER_COMMITTED` before the server confirms it.
- Distinguish local saved, pending sync, syncing, server committed, failed, and requires-review states.
- Never silently discard a pending bill or silently hide a stock conflict.
- Do not assume disconnected counters can guarantee global stock availability.
- Do not invent official invoice numbers, IRNs, or government QR payloads offline.
- Invoice numbering and offline-sales policy require an explicit documented design.

## Financial and inventory rules
- Posted sales, returns, payments, and stock movements must use validated ERPNext workflows.
- Never edit or delete posted financial records to reverse a transaction; use supported return, credit-note, cancellation, or reversal workflows.
- Keep tax calculations in the approved ERP tax workflow; do not duplicate a separate GST engine in the POS.
- A recorded UPI/card reference is not proof of payment success unless confirmed by an authorized integration.
- Every stock adjustment requires a reason and authorized user.
- Historical invoices must not change when current product prices change.
- Reports must distinguish revenue, taxes, discounts, refunds, gross margin, and net profit.

## Security
- Enforce authorization on the server, not only in the UI.
- Never commit credentials, tokens, production data, or private keys.
- Do not expose MariaDB directly to the internet.
- Use least-privilege credentials and secure remote access.
- Avoid logging secrets, payment credentials, or unnecessary customer personal data.
- Audit sensitive actions and approval decisions.

## Engineering practices
- TypeScript strict mode for new TypeScript code.
- Validate external/API input at trust boundaries.
- Use migrations for schema changes; do not rely on manual production database edits.
- Add tests for new business rules and failure paths.
- Prefer small, reviewable changes over broad rewrites.
- Document assumptions and unresolved decisions rather than inventing requirements.
- Pin compatible versions and test ERPNext/Frappe app compatibility before upgrades.
- Do not claim a command, test, deployment, or integration succeeded unless it was actually run and verified.

## Definition of done
A change is done only when:
1. Relevant tests pass or unrun tests are clearly reported.
2. Failure and retry behavior are considered.
3. Authorization and audit needs are addressed.
4. Documentation/configuration is updated where necessary.
5. The change does not bypass ERPNext business logic or compromise offline transaction durability.
