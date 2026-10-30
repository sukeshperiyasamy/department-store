# Security, Privacy and Accessibility Requirements

## 1. Security baseline

- Enforce authorization in the API and database command handlers, not only in
  the UI.
- Use Argon2id for passwords and secure, HttpOnly, SameSite session cookies.
- Rate-limit authentication and sensitive endpoints.
- Register each counter device and allow revocation.
- Use least-privilege roles: Owner, Manager, Cashier, Inventory Operator and
  Accountant.
- Require manager authorization for exceptional discounts, refunds, stock
  corrections, cash differences and configuration changes.
- Never log passwords, tokens, payment credentials, full customer data or
  supplier secrets.
- Encrypt transport with HTTPS and protect local secrets using the OS secure
  storage where available.
- Validate and size-limit all external input at API and file-upload boundaries.
- Use parameterized queries and migrations; no direct string SQL from requests.
- Keep dependencies pinned and run secret/vulnerability checks in CI.

## 2. Audit requirements

Audit events are required for login failures, role changes, price changes,
discount approvals, returns, refunds, stock adjustments, cash closing overrides,
payment reconciliation decisions, exports, device registration and backup
administration.

Audit records contain actor, role, store, device, action, target ID, timestamp,
reason and safe metadata. They are append-only to ordinary users.

## 3. Privacy

- Customer phone numbers and names are optional for ordinary cash sales.
- Explain the purpose before collecting customer information.
- Support consent withdrawal for digital receipts and loyalty messages.
- Restrict customer history to authorized roles.
- Provide export and retention procedures for store-owned data.
- Redact personal data from support diagnostics and test fixtures.

## 4. Accessibility and UX quality

Target WCAG 2.2 AA for the owner web application and practical equivalent for
the Tauri counter application:

- keyboard navigation for all workflows;
- visible focus and minimum 44px interactive targets;
- high-contrast text and controls;
- text/icon/status combinations rather than colour alone;
- scalable text without clipped totals or tables;
- screen-reader names for inputs, buttons and error messages;
- reduced motion option;
- clear error recovery with preserved input;
- Tamil and English translation-ready labels;
- plain language and consistent terms: Bill, Counter, Cashier, Receive stock;
- no destructive action without confirmation and explanation.

Accessibility checks are part of release acceptance, not a post-release polish
task.
