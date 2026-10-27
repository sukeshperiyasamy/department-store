# Database and Migration Governance Policy

## 1. Governance Principles & Strict Constraints

The Departmental Store SaaS utilizes ERPNext/Frappe on MariaDB 11.8 as its authoritative central business kernel, combined with local SQLite databases on Windows POS billing counters. Because tenant stores conduct real-time billing and maintain official GST tax registers, all database migrations must satisfy strict governance rules:

1. **ERPNext Business Logic Primacy**:
   - Never write raw SQL updates directly to `tabSales Invoice`, `tabGL Entry`, or `tabStock Ledger Entry`. All financial and inventory mutations must invoke Frappe/ERPNext document lifecycles.
2. **Expand-and-Contract Architecture**:
   - Destructive schema modifications (column deletions, renames, type tightening) are prohibited in single-step deployments.
3. **Tenant-by-Tenant Canary Isolation**:
   - Do not run an unmanaged migration across every tenant site simultaneously. Migrations must proceed in controlled cohorts starting with an isolated canary tenant.
4. **Automated Migration Locking**:
   - A distributed lock must be held per tenant during migration to prevent concurrent execution by background schedulers or parallel deployments.
5. **Immediate Halt on Failure**:
   - If any site fails migration, execution stops immediately. Remaining tenants remain untouched on the existing stable schema.

---

## 2. The Expand-and-Contract Migration Workflow

When schema or contract modifications are required, engineers must follow the five-phase expand-and-contract pattern:

```
[Phase 1: Expand Schema]
- Add new fields/DocTypes as nullable or with defaults.
- Deploy migration to backend.
- Old clients continue reading/writing original fields without error.

[Phase 2: Dual-Read / Dual-Write Code Rollout]
- Deploy updated application code.
- Application reads new fields, falling back to legacy fields if null.
- Writes populate both old and new representations.

[Phase 3: Backfill Data Migration]
- Run safe, chunked data backfill script in background worker.
- Validate data consistency and idempotency across historical records.

[Phase 4: Client Upgrade & Verification]
- Upgrade Windows POS counters and dashboards to modern version.
- Verify all active clients are communicating via updated contract.

[Phase 5: Contract Schema]
- In a subsequent scheduled release (minimum 30 days later), remove deprecated fields and drop legacy tables.
```

---

## 3. Migration Runner & Canary Protocol

Tenant migrations are orchestrated using [`scripts/tenant_migration_runner.py`](file:///scripts/tenant_migration_runner.py).

### 3.1 Step-by-Step Execution Sequence
1. **Pre-Migration Snapshot**:
   - Execute [`deployment/backup/run_backup.ps1`](file:///deployment/backup/run_backup.ps1) to generate a cryptographic point-in-time backup of MariaDB and tenant databases.
2. **Site Discovery & Lock Acquisition**:
   - The runner detects all sites under `sites/` and acquires an exclusive lock at `/tmp/migration_lock_<site>.lock`.
3. **Maintenance Mode Activation**:
   - `bench --site <site> set-maintenance-mode on` is invoked, returning a friendly HTTP 503 "Maintenance in Progress" to incoming web traffic.
4. **Canary Cohort Execution**:
   - The canary site (e.g. `frontend` or dedicated pilot store) executes `bench --site <site> migrate`.
   - Post-migration health checks verify database responsiveness (`SELECT 1`), docstatus integrity, and API ping.
5. **Observation Window**:
   - A 5-second health verification pause ensures no deadlocks, crashed workers, or uncommitted transactions.
6. **General Tenant Rollout**:
   - Upon canary success, remaining tenant sites are migrated sequentially or in controlled batches of 3.
7. **Failure Halt & Recovery**:
   - If an error occurs:
     - The current site's maintenance mode is released.
     - Execution immediately aborts.
     - The operator receives diagnostic logs and instructions for point-in-time recovery.

---

## 4. SQLite POS Client Migration Governance

Billing counters maintain local SQLite databases storing catalog cache, cashier sessions, and the offline transaction outbox.

1. **No Destructive Drops**:
   - Local SQLite upgrades must use `ALTER TABLE ... ADD COLUMN` or create new tables. Existing tables (especially `outbox` and `offline_sales`) must NEVER be dropped or re-created during application startup.
2. **Offline Outbox Preservation**:
   - A POS application upgrade must verify that all pending outbox records (`PENDING`, `SYNCING`) remain intact across upgrades.
3. **Version Stamp Verification**:
   - The POS local database stores `schema_version`. On startup, migrations execute sequentially in an atomic SQLite transaction (`BEGIN TRANSACTION ... COMMIT`).
