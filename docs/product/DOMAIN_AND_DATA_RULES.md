# Domain and Data Rules

These rules are non-negotiable. They protect the store from duplicate sales,
unexplained stock changes and unreliable financial reports.

## 1. Identity and time

- Every local operation has a UUID generated before persistence.
- Every server record has a stable ID and an immutable created timestamp.
- Local occurrence time and server acceptance time are stored separately.
- Server rejects or reviews timestamps outside the configured clock-skew window.
- Human-readable receipt numbers are assigned only by the authoritative server.

## 2. Money

- Store money as integer minor units or PostgreSQL `numeric`; never binary
  floating point.
- Store currency explicitly on financial records.
- Round only at documented tax/line boundaries.
- Historical invoices keep their original rates, discounts and tax results.
- Reports define whether values include tax, returns, discounts and expenses.

## 3. Sales and returns

- A sale is saved locally with its outbox event atomically.
- A sale is not marked server-committed until the server confirms it.
- Server idempotency is keyed by the client transaction UUID.
- A retry returns the original result and cannot create a second sale.
- A posted sale is never edited or deleted to correct it.
- Returns reference the original sale and record reason, quantity, operator and
  authorization.
- A refund is not proof of payment settlement until its payment action is
  confirmed or reconciled.

## 4. Inventory

- Stock changes occur through typed movements: sale, return, receipt, transfer,
  count correction, damage, theft, expiry or supplier return.
- Every adjustment has a reason, actor, timestamp and approval when policy
  requires it.
- A product's current price cannot alter historical transactions.
- Batch and expiry are captured when the product requires them.
- Offline stock is advisory; the server validates availability at submission.
- Stock reports distinguish physical, reserved, available and incoming units.

## 5. Purchasing and suppliers

- Ordered, received, invoiced, returned and paid quantities are separate.
- Partial receipts preserve outstanding quantities.
- Supplier invoices reference receipts where possible.
- Supplier returns reverse the appropriate stock and payable effects.
- Partial supplier payments retain the remaining due and payment history.
- Due dates and payment terms are stored on the supplier bill, not inferred from
  a current supplier setting.

## 6. Cash and payments

- A cash session has opening cash, operator, counter and opening time.
- Cash sales, withdrawals, expenses, refunds and paid-outs are separate events.
- Expected cash is calculated from events, never typed as a free-form total.
- Counted cash records denominations and the person who counted it.
- Differences require a reason; over-tolerance differences require approval.
- A typed UPI/card reference is only a reference until confirmed/reconciled.
- Duplicate payment references are flagged for review, never silently merged.

## 7. Audit and deletion

- Sensitive actions append an audit event with actor, role, device, reason and
  before/after summary where safe.
- Posted financial and stock records are immutable to ordinary users.
- Deactivation is preferred to deletion for master data referenced by history.
- Customer personal data is minimized and access is role-controlled.
- Exports, backups and support diagnostics must redact secrets and unnecessary
  personal data.
