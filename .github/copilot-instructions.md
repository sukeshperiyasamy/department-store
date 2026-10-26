# GitHub Copilot Instructions — Department Store ERP

Build a departmental-store ERP for one store with 2–3 Windows POS counters.

## Architecture
- ERPNext/Frappe is the authoritative business backend for finalized inventory, sales, purchasing, and accounting.
- Use MariaDB as supported by ERPNext; do not substitute PostgreSQL into the ERPNext deployment.
- The desktop POS is Tauri + React + TypeScript.
- Each counter has SQLite for cache, drafts, and durable offline outbox.
- A custom Frappe app contains store-specific server-side behavior.
- Do not write directly to ERPNext database tables or bypass document lifecycle methods.

## Critical correctness
- Use server-enforced idempotency for sales synchronization.
- Persist local transaction and outbox event atomically.
- Never mark a sale committed before server confirmation.
- Preserve pending bills and expose conflicts for review.
- Do not assume global stock availability while counters are disconnected.
- Do not fabricate official invoice numbers, IRNs, or government QR payloads.
- Use ERPNext's approved tax/accounting workflows.

## Code quality
- TypeScript strict mode for new TS code.
- Validate all external input.
- Enforce permissions server-side.
- Add tests for business rules, error paths, retries, and offline recovery.
- Do not commit secrets or real store/customer data.
- Keep changes small and update documentation when behavior or API contracts change.
