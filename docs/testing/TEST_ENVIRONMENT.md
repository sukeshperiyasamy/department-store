# Test Environment

Reproducible setup for the entire QA cycle. Everything runs against a **local test stack with synthetic demo data** — never against production.

## 1. ERP stack (Docker)

```bash
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
# first boot creates site "frontend" (ERPNext v16) — wait for create-site to finish
curl http://localhost:8080/api/method/ping   # expect 200
```

## 2. Custom app + demo data

```bash
# copy the app into the container (or bench get-app from git), then inside the container:
bench --site frontend install-app departmental_store
bench --site frontend set-config allow_tests true

# synthetic dataset (idempotent): company, tax-capable fixtures, 5 items with valid
# EAN-13 barcodes, batch item, opening stock, POS profile + shift, device "counter-1"
bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"

# bulk scale data for performance work (optional)
bench --site frontend execute departmental_store.seeds.make_perf_items --kwargs "{'n': 300}"

# per-run API tokens (printed to stdout; NEVER commit them)
bench --site frontend execute departmental_store.seeds.make_cashier_user
bench --site frontend execute departmental_store.seeds.make_dashboard_user
```

`api_suite.mjs` generates its own tokens and race items automatically at start.

## 3. TypeScript suites

```bash
npm install                      # workspaces
npm run typecheck                # strict TS, 3 workspaces
npm run test                     # 84 tests (POS 73 incl. jsdom UI, shared-types 10, dashboard 1)
npm run test:pos -- --coverage   # coverage table
npm run build -w @departmental/windows-pos
npm run build -w @departmental/owner-dashboard
```

## 4. HTTP integration / security / performance suite

```bash
node tests/integration/api_suite.mjs            # 24 checks; writes docs/testing/artifacts/api-suite-results.json
node tests/integration/reliability_check.mjs    # stops/starts the backend container (test stack only!)
```

The suite is safe to rerun: it uses unique transaction ids, non-stock PERF items, and creates fresh race items per run.

## 5. Bench (ERPNext-integration) tests

```bash
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp exec backend \
  bench --site frontend run-tests --app departmental_store
# 20 tests: test_sales_api.py (16) + test_catalog_api.py (4)
```

## 6. Backup / restore rehearsal (disposable)

```bash
bench --site frontend backup --with-files
bench new-site test-restore.local --mariadb-root-password admin --admin-password admin --no-mariadb-socket
bench --site test-restore.local restore <backup>.sql.gz --with-public-files <files.tar> \
      --db-root-username root --db-root-password admin
# verify: list-apps, invoice/sync-log counts, owner_summary — then drop it:
bench drop-site test-restore.local --root-password admin --force
```

## 7. Resetting the test database safely

- Soft reset (keep site): rerun `seeds.demo` (idempotent) and delete generated transactions via the Desk UI, or recreate the site from scratch: `bench drop-site frontend --root-password admin --force` → `docker compose ... down -v` → `up -d` (full clean rebuild, ~5 min).
- The suites never require a reset: they generate unique ids and clean fixtures per run.

## 8. Reproducing the QA defects of this cycle

- QA-0002: submit a sale with `occurred_at: "<ISO with Z>"` against the pre-fix code (git show 76813d8:erpnext-app/...) → INVOICE_POSTING_FAILED TypeError.
- QA-0001: change only an Item Price, pull `catalog_snapshot` with the old checkpoint → item absent.
- QA-0003: submit `transaction_id` containing quotes/HTML → HTTP 500 (pre-fix).
