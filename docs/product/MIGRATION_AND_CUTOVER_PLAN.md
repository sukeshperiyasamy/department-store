# Migration and Cutover Plan

## 1. Safety rule

The current ERPNext application and its data are preserved. Do not delete,
overwrite, reset or directly edit the legacy database as part of the new
product build.

## 2. Migration stages

1. Inventory current users, products, barcodes, prices, suppliers, customers,
   stock, invoices, returns, payments and settings.
2. Export a read-only, checksummed source snapshot.
3. Map legacy fields to the new schema and document every lossy conversion.
4. Import master data into an isolated staging database.
5. Import historical records as immutable history or verified opening balances;
   never fabricate official invoice numbers.
6. Reconcile counts, totals, tax summaries, supplier dues and customer balances.
7. Run the full pilot using the new system in parallel with the legacy system.
8. Compare daily sales, payments and stock for an agreed observation period.
9. Freeze legacy writes during the final cutover window.
10. Take a final backup, import the delta, verify, then enable the new system.

## 3. Rollback

Rollback means disabling new clients and returning to the preserved legacy
workflow using the recorded cutover checkpoint. It does not mean deleting new
data. Any transactions created after cutover must be exported and reconciled
before retrying the migration.

## 4. Cutover acceptance

- Product/barcode import counts match the signed source report.
- Opening stock is verified by physical count or documented adjustment.
- Supplier dues and cash opening balances are signed off.
- User roles and counter devices are tested.
- Backup restore succeeds.
- Receipt, tax and payment samples are approved by the owner/accountant.
- A rollback owner and time window are documented.
