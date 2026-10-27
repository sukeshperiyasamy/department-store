# Staging & Production Operational Incident Runbooks

**Document Version:** 1.0 (Phase 15 Operational Readiness)  
**Date:** 2026-10-27  
**Audience:** Site Reliability Engineers, System Operators, Platform Administrators  
**Repository:** `sukeshperiyasamy/department-store`

---

## Safety & Governance Rules (Strict Enforcement)

> [!CAUTION]
> 1. **Zero Automated Destructive Actions:** Never configure scripts or automation that unilaterally delete tenant data, cancel customer subscriptions, or drop databases without explicit human operator confirmation.
> 2. **Zero Plaintext Credentials in Logs:** Never dump environment variables, connection strings, or authorization headers into issue trackers or public logs.
> 3. **Preserve Forensic Evidence:** Always capture diagnostic bundles, container logs, and database snapshots before restarting or recycling unhealthy services.

---

## Index of Operational Incident Runbooks

| Runbook ID | Incident Scenario | Severity | Initial Response Time |
| :--- | :--- | :---: | :---: |
| **RUN-01** | [Application Outage (Frontend / Next.js / Gunicorn Down)](#run-01-application-outage) | **CRITICAL** | < 15 minutes |
| **RUN-02** | [Tenant-Routing Failure (Misrouted Subdomain / 404 / 403)](#run-02-tenant-routing-failure) | **HIGH** | < 30 minutes |
| **RUN-03** | [Database Failure (MariaDB Crash / Locked Tables / Corruption)](#run-03-database-failure) | **CRITICAL** | < 15 minutes |
| **RUN-04** | [Redis / Background Worker Failure (Queue Stalled / OOM)](#run-04-redis-or-background-worker-failure) | **HIGH** | < 30 minutes |
| **RUN-05** | [Failed Provisioning Job (Worker Stuck / Subprocess Error)](#run-05-failed-provisioning-job) | **HIGH** | < 60 minutes |
| **RUN-06** | [Payment Webhook Backlog / Reconciliation Failure](#run-06-payment-webhook-backlog-or-reconciliation-failure) | **HIGH** | < 60 minutes |
| **RUN-07** | [Backup Failure / Checksum Mismatch](#run-07-backup-failure) | **HIGH** | < 2 hours |
| **RUN-08** | [Suspected Cross-Tenant Data Exposure](#run-08-suspected-cross-tenant-data-exposure) | **CRITICAL** | < 15 minutes |
| **RUN-09** | [Failed Deployment & Release Rollback](#run-09-failed-deployment-and-rollback) | **CRITICAL** | < 15 minutes |
| **RUN-10** | [Disaster Recovery & Site Restoration](#run-10-disaster-recovery-and-restoration) | **CRITICAL** | < 30 minutes |

---

## RUN-01: Application Outage

### 1. Detection Signals
- Synthetic HTTP probe failure on `https://staging.departmentstore.in/api/health` or `/api/method/departmental_store.api.health.get_liveness`.
- Ingress returning `HTTP 502 Bad Gateway` or `HTTP 504 Gateway Timeout`.

### 2. First Diagnostic Checks
```bash
# Check container status
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp ps
docker compose -f deployment/ingress/docker-compose.traefik.yml ps

# Inspect Gunicorn and Nginx logs
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp logs --tail=100 backend frontend
docker compose -f deployment/ingress/docker-compose.traefik.yml logs --tail=100 traefik
```

### 3. Safe Containment Actions
- If Gunicorn is unresponsive, send `HUP` signal to reload workers without dropping active connections:
  ```bash
  docker exec departmental-erp-backend-1 kill -HUP 1
  ```
- If container has crashed with exit code 137 (OOM), inspect memory limits (`free -m`, `docker stats`) before restarting.

### 4. Evidence to Preserve
- Tail of container stderr and stdout: `docker logs departmental-erp-backend-1 > /var/log/incident_gunicorn_$(date +%s).log`.
- Current memory and swap utilization: `free -m > /var/log/incident_mem_$(date +%s).txt`.

### 5. Escalation Criteria
- Service remains unresponsive after 15 minutes or multiple worker crash loops. Escalate to Lead Backend Engineer.

---

## RUN-02: Tenant-Routing Failure

### 1. Detection Signals
- Customer report: "Store dashboard shows 404 Not Found or Access Denied."
- Ingress logs showing `ADMIN_ON_SUBDOMAIN_DENIED` or `UNRESOLVED_TENANT`.

### 2. First Diagnostic Checks
```bash
# Test hostname resolution via Frappe API
docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.tenant.resolve_tenant_by_host --args "['<shop-slug>.staging.departmentstore.in']"

# Check tenant registry status in MariaDB
docker exec departmental-erp-backend-1 bench --site frontend execute frappe.db.get_value --args "['SaaS Tenant Registry', {'slug': '<shop-slug>'}, ['tenant_id', 'lifecycle_status', 'primary_hostname']]"
```

### 3. Safe Containment Actions
- If tenant is in `SUSPENDED` status, verify if suspension was intentional (billing dispute/admin hold) or erroneous before altering state.
- If hostname normalization failed, verify DNS CNAME points to Traefik edge ingress.

### 4. Evidence to Preserve
- Incoming request headers from Traefik: `Host`, `X-Forwarded-Host`, `X-Real-IP`.

### 5. Escalation Criteria
- Multiple unrelated tenants fail resolution simultaneously (indicates Traefik dynamic router reload failure). Escalate to SRE.

---

## RUN-03: Database Failure

### 1. Detection Signals
- Database connection refused (`OperationalError: (2002, "Can't connect to server")`).
- `docker ps` shows `departmental-erp-db-1` in `Restarting` or unhealthy state.

### 2. First Diagnostic Checks
```bash
# Inspect MariaDB error log
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp logs --tail=100 db

# Check disk space on database mount volume
df -h
docker system df
```

### 3. Safe Containment Actions
- **Do NOT delete the database volume (`-v`).**
- If disk space is exhausted (>95%), prune dangling Docker build caches and rotated logs:
  ```bash
  docker image prune -f
  journalctl --vacuum-time=3d
  ```
- If InnoDB tables are corrupted, start MariaDB with `innodb_force_recovery=1` in read-only mode to extract a salvage dump before restoring.

### 4. Evidence to Preserve
- MariaDB error log: `docker logs departmental-erp-db-1 > /var/log/incident_mariadb.log`.

### 5. Escalation Criteria
- Data corruption detected on core tables (`tabSales Invoice`, `tabGL Entry`). Escalate immediately to Principal Database Architect.

---

## RUN-04: Redis or Background-Worker Failure

### 1. Detection Signals
- Background jobs not processing (`tabSaaS Provisioning Job` or scheduled reconciliation delayed).
- `bench --site frontend execute frappe.utils.background_jobs.get_queue_length` reports growing backlog.

### 2. First Diagnostic Checks
```bash
# Check Redis connectivity
docker exec departmental-erp-redis-queue-1 redis-cli ping
docker exec departmental-erp-redis-cache-1 redis-cli ping

# Inspect queue worker container logs
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp logs --tail=100 queue-short queue-long
```

### 3. Safe Containment Actions
- Restart hung worker processes:
  ```bash
  docker compose -f deployment/erpnext/pwd.yml -p departmental-erp restart queue-short queue-long
  ```
- If Redis is out of memory, verify `maxmemory` eviction policy in `redis.conf` (`volatile-lru`).

### 4. Evidence to Preserve
- Redis memory stats: `docker exec departmental-erp-redis-cache-1 redis-cli info memory`.

---

## RUN-05: Failed Provisioning Job

### 1. Detection Signals
- Onboarding console displays job status `PROVISIONING_FAILED` or `TIMEOUT`.
- Store owner reports: "Store creation failed after approval."

### 2. First Diagnostic Checks
```bash
# Inspect provisioning job error log
docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.provisioning.get_onboarding_detail --args "['<request_id>']"

# Check provisioning worker lock in Redis
docker exec departmental-erp-redis-queue-1 redis-cli keys "*provisioning*"
```

### 3. Safe Containment Actions
- Check retry count: if retry count < 3, click "Retry Job" in Platform Admin Console or invoke:
  ```bash
  docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.provisioning.retry_provisioning_job --args "['<job_id>']"
  ```
- Do **NOT** delete the tenant record; inspect sanitized subprocess error output in `tabSaaS Provisioning Audit Log`.

### 4. Evidence to Preserve
- Audit trail entries: `SELECT * FROM tabSaaS Provisioning Audit Log WHERE request_id = '<request_id>'`.

---

## RUN-06: Payment Webhook Backlog or Reconciliation Failure

### 1. Detection Signals
- Razorpay Dashboard alerts: "Webhook delivery failure rate > 5%".
- Store owner reports paid invoice still showing "Payment Pending".

### 2. First Diagnostic Checks
```bash
# Check webhook events table for failures
docker exec departmental-erp-backend-1 bench --site frontend execute frappe.db.sql --args "['SELECT event_id, status, error_message, creation FROM \`tabSaaS Webhook Event\` WHERE status = \"FAILED\" ORDER BY creation DESC LIMIT 10']"

# Validate payment gateway configuration
docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.billing.validate_payment_gateway_mode
```

### 3. Safe Containment Actions
- If webhooks failed due to temporary network downtime, trigger on-demand reconciliation:
  ```bash
  docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.billing.reconcile_subscription_payments --args "['<tenant_id>', True]"
  ```
- Never manually mark an invoice `PAID` without verifying settlement in the Razorpay banking dashboard.

### 4. Evidence to Preserve
- Raw webhook payloads and HMAC signature headers from failed entries in `tabSaaS Webhook Event`.

---

## RUN-07: Backup Failure

### 1. Detection Signals
- Alert from Task Scheduler or Cron: `run_backup.ps1 / run_backup.sh exited with code 1`.
- `staging_preflight_check.mjs` reports `FAIL [BAK-FRESH-01]: Latest local backup is > 72 hours old`.

### 2. First Diagnostic Checks
```bash
# Run manual integrity check on latest backup
python3 deployment/backup/replicate_offsite.py --verify-only

# Check backup disk space
df -h "$HOME/departmental-backups"
```

### 3. Safe Containment Actions
- If previous backup was interrupted, execute manual backup immediately:
  ```bash
  ./deployment/backup/run_backup.sh
  ```
- Verify `database.sql.gz` passes `gzip -t` and `SHA256SUMS.txt` is populated.

### 4. Evidence to Preserve
- Backup execution stderr logs.

---

## RUN-08: Suspected Cross-Tenant Data Exposure

### 1. Detection Signals
- Security telemetry alert: `Cross-tenant query rejected server-side`.
- Customer report stating they observed another store's item or sales data.

### 2. Immediate Containment Actions (CRITICAL)
- **Step 1:** Suspend affected tenant account immediately from Platform Console to halt unauthorized access:
  ```bash
  docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.provisioning.suspend_tenant --args "['<tenant_id>', 'Urgent containment: suspected data exposure']"
  ```
- **Step 2:** Invalidate all active sessions for the involved users:
  ```bash
  docker exec departmental-erp-backend-1 bench --site frontend execute frappe.sessions.clear_all_sessions
  ```
- **Step 3:** Restrict proxy routing to the affected subdomain.

### 3. Evidence to Preserve
- Traefik access logs with exact IP, timestamp, headers (`Host`, `X-Forwarded-Host`, `Cookie`), and URL path.
- MariaDB audit log for `tabSales Invoice` and `tabItem`.

### 4. Escalation Criteria
- Confirmed cross-tenant data leak constitutes a statutory DPDPA 2023 security incident. Notify Data Protection Officer and Legal Counsel within 2 hours.

---

## RUN-09: Failed Deployment & Release Rollback

### 1. Detection Signals
- New release fails `bench migrate` with syntax error or schema conflict.
- Post-deployment smoke tests fail (`HTTP 500` on dashboard).

### 2. Safe Containment & Rollback Procedure
1. Halt Ingress to prevent corrupted data entry:
   ```bash
   docker compose -f deployment/ingress/docker-compose.traefik.yml stop
   ```
2. Restore pre-migration backup dump:
   ```bash
   LATEST_BACKUP=$(ls -td $HOME/departmental-backups/*/ | head -1)
   docker cp "$LATEST_BACKUP" departmental-erp-backend-1:/tmp/restore/
   docker exec departmental-erp-backend-1 bench --site frontend restore /tmp/restore/*-database.sql.gz --db-root-username root --db-root-password admin
   docker exec departmental-erp-backend-1 rm -rf /tmp/restore/
   ```
3. Checkout previous Git commit:
   ```bash
   git checkout <PREVIOUS_COMMIT_SHA>
   ```
4. Restart backend and ingress:
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp restart backend
   docker compose -f deployment/ingress/docker-compose.traefik.yml start
   ```

---

## RUN-10: Disaster Recovery & Site Restoration

### 1. Detection Signals
- Server host hardware failure, unrecoverable disk corruption, or datacenter loss.

### 2. Step-by-Step Recovery Procedure
1. Follow bare-metal restoration instructions in `docs/launch/OFFSITE_BACKUP_AND_DR_SPECIFICATION.md`.
2. Retrieve backup archive from off-site S3 / Cloudflare R2 bucket.
3. Validate archive SHA-256 integrity:
   ```bash
   python3 deployment/backup/replicate_offsite.py --backup-dir /var/backups/<stamp>/ --verify-only
   ```
4. Restore site database and files:
   ```bash
   docker exec departmental-erp-backend-1 bench --site frontend restore /tmp/restore/*-database.sql.gz --with-public-files /tmp/restore/*-files.tar --with-private-files /tmp/restore/*-private-files.tar --db-root-username root --db-root-password admin
   ```
5. Run migrations:
   ```bash
   docker exec departmental-erp-backend-1 bench --site frontend migrate
   ```
6. Verify liveness:
   ```bash
   curl -fsS http://localhost:8080/api/method/departmental_store.api.health.get_liveness
   ```
7. Announce recovery completion; counters automatically sync queued bills upon reconnection.
