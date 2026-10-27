# Deployment Orchestration and Progressive Rollout Guide

## 1. Multi-Tenant Shared Application Architecture

In this deployment topology, multiple tenant sites (`frontend`, `site_alpha`, `site_beta`) run atop a shared Frappe Bench container stack (`departmental-erp-backend-1`, `departmental-erp-frontend-1`) backed by a shared MariaDB 11.8 service and Redis queues.

Because a code change deployed to the custom app container impacts all tenant sites simultaneously, code releases and database migrations must follow a strict, gated orchestration process.

```
+----------------------------------------------------------------------------------------------------+
| STAGE 1: CI & ARTIFACT PACKAGING                                                                  |
| - Automated GitHub Actions CI Gates pass (.github/workflows/ci.yml)                                |
| - Immutable Release Manifest generated with SHA256 checksums                                       |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| STAGE 2: STAGING PREFLIGHT & DRY-RUN                                                               |
| - Staging environment preflight check (tests/integration/staging_preflight_check.mjs)              |
| - Automated tenant backup snapshot (deployment/backup/run_backup.ps1)                              |
| - Dry-run canary migration verification (scripts/tenant_migration_runner.py --dry-run)             |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| STAGE 3: APPLICATION IMAGE UPDATE & RESTART                                                        |
| - Pull pinned Frappe and Dashboard container images                                                |
| - Zero-downtime rolling restart of backend and frontend workers                                    |
| - Verify container health: docker ps & /api/method/frappe.ping                                     |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| STAGE 4: CANARY TENANT MIGRATION & SMOKE TESTS                                                     |
| - Execute migration on canary tenant (frontend or pilot store)                                     |
| - Run automated smoke tests against canary site                                                    |
| - Evaluate error rate, p95 latency, and worker queue depths                                         |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| STAGE 5: GENERAL TENANT PROGRESSIVE ROLLOUT                                                        |
| - Migrate remaining tenants in sequential batches                                                  |
| - Automatic halt on any failure; operator alert dispatched                                         |
| - Post-rollout regression suite verification                                                       |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Progressive Rollout & Health Gates

### 2.1 Staging Smoke Test Verification
Prior to executing any tenant migration, the deployment engineer executes the staging preflight suite:
```bash
node tests/integration/staging_preflight_check.mjs
```
This suite verifies:
1. Reverse proxy routing to Traefik.
2. MariaDB InnoDB connection pool health.
3. Redis cache and queue responsiveness.
4. Liveness endpoints (`/api/method/departmental_store.api.health.liveness`).

### 2.2 Canary Observation Window
The canary cohort runs for a minimum of 15 minutes in staging (or 2 hours in production) under simulated cashier traffic. The release is halted if:
- Ingress HTTP 5xx error rate exceeds 0.5%.
- Sale submission p95 latency exceeds 500ms.
- Any deadlock or `tabSeries` lock error is logged.

### 2.3 Automatic & Operator-Triggered Halts
- **Automated Halt**: Built into [`scripts/tenant_migration_runner.py`](file:///scripts/tenant_migration_runner.py) — any unhandled exception or failed post-migration health check immediately aborts migration of subsequent tenants.
- **Operator Halt**: An operator can trigger an immediate release abort by running:
  ```bash
  touch /tmp/ABORT_MIGRATION
  ```
  The runner checks for this flag between every tenant cohort.

---

## 3. Rollback & Forward-Fix Procedures

### 3.1 Persistent Volume Protection
To prevent catastrophic data loss, database volumes (`db-data`), site file storage (`sites/`), and Redis queue volumes are protected by:
1. Docker Compose `external: true` or named volume configuration that prevents `docker compose down -v` from destroying user data.
2. Mandatory pre-migration backup tarballs stored in `/var/backups/departmental/` with SHA256 checksums.

### 3.2 Rollback Runbook (Code-Only Issue)
If code defects are discovered after deployment but no schema migrations were performed:
1. Re-deploy the previous container image tag.
2. Restart workers: `docker compose restart backend frontend queue-short queue-long`.
3. Verify site health via `node tests/integration/staging_preflight_check.mjs`.

### 3.3 Forward-Fix vs. Database Restore
If a migration was completed:
- **Preferred Path (Forward-Fix)**: Because schema changes follow expand-and-contract, existing columns are intact. Deploy a forward-fix patch release to rectify application bugs without altering table structures.
- **Disaster Recovery (Point-in-Time Restore)**: If data corruption occurred on a specific tenant site, restore only that tenant's database dump:
  ```bash
  bench --site <tenant_site> restore /var/backups/departmental/<tenant_site>-pre-migration.sql.gz
  ```
