# New Store Platform — Product Requirements Document

**Version:** 1.0
**Status:** Approved for greenfield implementation
**Date:** 30 October 2026
**Initial deployment:** One departmental store with 2–3 Windows counters
**Primary locale:** India; INR and GST configuration are store-specific

## 1. Product vision

Give a store owner one trustworthy digital store diary. Billing, purchases,
stock, cash, supplier dues, expenses and reports are recorded automatically so
the owner does not need separate notebooks, spreadsheets or manual totals.

The product wins through speed and clarity, not by reproducing a large ERP.
The owner sees what happened today, what needs attention and the evidence for
each recommendation. The cashier sees only the few actions required to serve a
customer.

## 2. Primary promise

> Bill quickly, never lose a saved transaction, find any bill in seconds and
> understand today's store without maintaining a separate diary.

The following are design targets, not claims until measured in pilot testing:

- A new cashier completes common billing tasks after 15 minutes of guided
  training.
- A normal five-item sale completes in under 15 seconds at a local counter.
- A saved bill remains recoverable after application restart, power loss or
  network loss.
- A bill can be found in under two seconds on normal hardware.
- A normal cash close completes in under three minutes.

## 3. Users and jobs

### Owner

Needs one screen for sales, margin, cash, digital collections, stock risks,
supplier dues, expenses and approvals. Needs remote read access and alerts
without learning accounting terminology.

### Manager

Runs shifts, approves discounts/refunds/adjustments, receives purchases,
resolves sync conflicts, closes cash and investigates exceptions.

### Cashier

Scans, searches, holds, resumes, takes payment, prints or sends a receipt and
performs permitted returns. The cashier must not edit posted history or tax
configuration.

### Inventory operator

Receives stock, captures batches and expiry, counts by barcode, records damage
and prepares reorder requests.

### Accountant

Reviews the automatically created financial records, reconciles collections,
reviews supplier/customer balances and exports records. The product does not
force the accountant's terminology onto cashiers.

## 4. Release scope

### Release 1 — Operational core (must ship)

- Store setup, users, roles and counter registration
- Product catalogue, categories, units and multiple barcodes
- MRP, selling price, purchase price and controlled price history
- Scan-first POS with hold/resume bills
- Cash, card, UPI and split payments
- Printed and digital receipts
- Returns tied to original bills
- Local offline persistence and durable sync
- Stock ledger, stock counts and approved corrections
- Purchase orders, goods receiving and shortages
- Supplier invoices, returns, dues and partial payments
- Batch/expiry capture and write-offs with reasons
- Opening cash, expenses, withdrawals and daily closing
- Payment reconciliation and duplicate/missing reference review
- Owner Today dashboard and core reports
- Audit trail, backups, restore procedure and health status

### Release 2 — Owner leverage

- Owner PWA with approvals and alerts
- Customer history, consent-based digital receipts and optional loyalty
- Reorder recommendations using transparent formulas
- Expiry Rescue recommendations
- Cash Leak Shield anomaly alerts with evidence
- Import/export templates and guided onboarding
- Android stock counting and secondary mobile billing pilot

### Explicitly out of initial scope

- Payroll, manufacturing, full HR or a general-purpose ERP
- Ecommerce marketplace and delivery fleet management
- Automatic supplier payment execution
- Automatic purchase orders without human approval
- AI-generated accounting entries
- Customer credit unless the store explicitly enables and controls it
- Multi-store transfer workflows before the single-store product is stable

## 5. Core workflows

### Sale

1. Cashier scans or searches products.
2. POS shows item, unit, price, discount and running total.
3. Cashier optionally attaches a customer.
4. Customer pays using one or more allowed methods.
5. POS saves the bill and outbox event atomically before printing.
6. Receipt shows local/pending status when the server has not confirmed it.
7. Sync posts the authoritative sale when connected.

### Hold and resume

The cashier can name or identify a held cart, serve another customer and resume
without losing lines, quantities or customer context. Held carts are drafts,
not sales, and do not change stock or cash.

### Receiving

The operator selects a purchase order, records received quantities, shortages,
batch and expiry, attaches the supplier document and submits for approval when
required. The system preserves ordered, received and outstanding quantities.

### Cash close

The system calculates expected cash from opening cash, cash sales, withdrawals,
expenses, refunds and paid-outs. The user enters counted denominations, sees the
difference and supplies a reason plus manager approval when policy requires it.

### Return

The user finds the original bill, selects permitted quantities, records a reason
and chooses refund/exchange/store credit according to policy. Posted records are
reversed through supported workflows; they are never edited in place.

## 6. Owner Today dashboard

The first screen must answer:

- What sold today, after returns and discounts?
- What is the estimated gross margin and what definition produced it?
- What cash should exist and what was counted?
- Do UPI/card collections match recorded payments?
- Which bills, counters or sync records need review?
- Which products are low, slow, damaged or expiring?
- Which supplier invoices are due?
- Which staff actions require approval?

Every number links to the underlying bills or ledger events. Recommendations
must show evidence, confidence/limitations and a reversible action.

## 7. Product principles

- Scan-first, keyboard-first and touch-friendly.
- Plain language: “Receive stock”, not “post a GRN” for ordinary users.
- One clear primary action per screen.
- No hidden pending bills or silent failures.
- Every financial or stock-changing action is explainable and auditable.
- Offline status is visible without alarming the cashier.
- Customer data is optional unless legally or operationally required.
- Tamil and English can be enabled without changing business rules.

## 8. Success metrics and acceptance gates

Release 1 cannot be called production-ready until:

- POS, server, database and printer workflows pass their release tests.
- Crash/restart/network-loss tests lose zero locally committed bills.
- Duplicate retries create one server sale at most.
- Permission tests reject unauthorized discounts, returns and corrections.
- Backup restore succeeds on a clean environment.
- Tax and price behavior is reviewed by the store's accountant.
- At least one physical printer and one scanner model pass a hardware test.
- Accessibility checks meet the project target in
  [SECURITY_AND_ACCESSIBILITY.md](./SECURITY_AND_ACCESSIBILITY.md).
- Pilot users complete the critical journeys without unresolved P0 defects.
