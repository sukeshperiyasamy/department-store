# departmental_store

Custom Frappe app for the departmental store ERP.

Provides:
- Idempotent POS sale submission (`departmental_store.api.sales.submit_pos_sale`)
- Catalog snapshot API for counter SQLite caching (`departmental_store.api.catalog.catalog_snapshot`)
- Counter device registration (`departmental_store.api.devices.register_device`)
- Transaction status lookup for lost-response recovery (`departmental_store.api.sales.check_transaction`)
- Owner summary report API (`departmental_store.api.reports.owner_summary`)
- `POS Device` and `POS Sale Sync Log` DocTypes

All business documents (POS/Sales Invoices, stock movements, accounting entries) are created
through the standard ERPNext document lifecycle. This app never writes directly to ERPNext tables.

## Install (inside a bench)

```bash
bench get-app $PATH_TO_THIS_REPO/erpnext-app/departmental_store
bench --site <site> install-app departmental_store
```

Python tests require a bench with a site:

```bash
bench --site <site> run-tests --app departmental_store
```
