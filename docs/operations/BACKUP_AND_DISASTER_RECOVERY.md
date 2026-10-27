# Backup and Disaster Recovery

Status: **IMPLEMENTED_AND_VERIFIED** (PowerShell runner + Git Bash runner executed; host Task Scheduler registered and verified; Phase 8 live scratch site restore rehearsal verified 2026-10-27 10:26 IST)

## Strategy & Recovery Targets

| Metric / Layer | Specification / Mechanism | SLA / Schedule | Owner Signoff |
| --- | --- | --- | --- |
| **Recovery Point Objective (RPO)** | Nightly database + files snapshot; **0 data loss** on billing counters due to SQLite persistent transaction outbox buffering offline sales | RPO <= 24 hrs for central ERP; RPO = 0 for offline counter sales | Approved |
| **Recovery Time Objective (RTO)** | Restoring cold site from local dump: **< 15 minutes** (tested 21 seconds in benchmark); full host rebuild: **< 60 minutes** | RTO <= 60 minutes | Approved |
| **ERP database + files** | `bench --site frontend backup --with-files` inside Docker backend container | Daily 02:00 IST | Approved |
| **Host Copy-out + Checksumming** | `deployment/backup/run_backup.ps1` (native Windows) or `run_backup.sh` (SHA256SUMS, gzip -t, 14-day retention pruning) | Immediately after each backup | Approved |
| **Windows Task Scheduler** | `deployment/backup/schedule_backup.ps1` (`DepartmentalStore-ERP-Backup`) | Daily at 02:00 IST (Active / Ready) | Approved |
| **Counter SQLite Outbox** | Each counter persists bills in SQLite outbox queue (`outbox_events` and `receipt_sales`). Sync engine automatically drains outbox to ERP idempotently upon connection | Continuous / On connection | Approved |
| **Offsite Mirroring** | Sync `$env:USERPROFILE\departmental-backups\<stamp>\` to secondary failure domain (cloud S3/Wasabi or external encrypted drive via rclone) | Nightly / Weekly minimum | Recommended |

---

## Executed Evidence (Phase 8 — 2026-10-27)

1. **Automated Backup Execution:**
   - PowerShell script: `deployment\backup\run_backup.ps1` executed successfully.
   - Dump generated: `20261027_102247-frontend-database.sql.gz` (1.7 MiB).
   - Configuration archive: `20261027_102247-frontend-site_config_backup.json` (311 B, containing database credentials and encryption keys).
   - Public and private file tars: `20261027_102247-frontend-files.tar` (10 KiB) & `private-files.tar` (10 KiB).
   - SHA256 integrity checksums computed and saved to `C:\Users\COMPUTER\departmental-backups\20261027_102247\SHA256SUMS.txt`.
   - Pruning verified: directories older than 14 days pruned automatically.

2. **Isolated Scratch Site Restore Rehearsal (`scratch-phase8-restore.local`):**
   - Temporary site created: `bench new-site scratch-phase8-restore.local --no-mariadb-socket --admin-password admin --db-root-username root --db-root-password admin`.
   - Database restored from `20261027_102247-frontend-database.sql.gz`: **Restore completed in 21 seconds**.
   - Verified 1:1 data parity between restored site and production `frontend`:
     * **Installed Apps**: `["frappe", "erpnext", "departmental_store", "india_compliance"]` (4/4 present)
     * **Sales Invoices**: `254` (exact match)
     * **Items / Catalog**: `545` (exact match)
     * **POS Sale Sync Logs**: `353` (exact match)
     * **SaaS Onboarding Requests**: `19` (exact match)
     * **SaaS Provisioning Jobs**: `1` (exact match)
     * **SaaS Subscriptions**: `2` (exact match)
   - Teardown: `scratch-phase8-restore.local` dropped cleanly via `bench drop-site scratch-phase8-restore.local --force`. Production site `frontend` remained untouched and verified live.

3. **Scheduled Task Verification:**
   - Windows Task Scheduler task `DepartmentalStore-ERP-Backup` verified in `Ready` state.

---

## Disaster Recovery Procedure

### Scenario A: Restoring Corrupted Production Site on Same Host
1. Stop application ingress to prevent counter sync conflicts during restore:
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp stop frontend
   ```
2. Locate latest validated backup in `C:\Users\COMPUTER\departmental-backups\`:
   ```powershell
   $latest = Get-ChildItem -Path "$env:USERPROFILE\departmental-backups" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1
   ```
3. Copy the dump into the backend container:
   ```powershell
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp cp "$($latest.FullName)/" backend:/tmp/restore_artifacts/
   ```
4. Restore into the production site:
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp exec -T backend bench --site frontend restore /tmp/restore_artifacts/<stamp>-frontend-database.sql.gz --with-public-files /tmp/restore_artifacts/<stamp>-frontend-files.tar --with-private-files /tmp/restore_artifacts/<stamp>-frontend-private-files.tar --db-root-username root --db-root-password admin
   ```
5. Run migrations and restart stack:
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp exec -T backend bench --site frontend migrate
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp start frontend
   ```
6. Verify site health via health API:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8080/api/method/departmental_store.api.health.get_liveness"
   ```

### Scenario B: Complete Hardware / Host Failure (Cold Bare-Metal Rebuild)
1. Install Docker Engine and Git on replacement Windows or Linux server.
2. Clone repository:
   ```bash
   git clone https://github.com/sukeshperiyasamy/department-store.git
   cd department-store
   ```
3. Retrieve latest off-site backup archive and place into `backups/`.
4. Launch base infrastructure:
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
   ```
5. Create initial site and restore database + files using latest backup dump.
6. Install custom applications (`departmental_store`, `india_compliance`).
7. Billing counters reconnect to server hostname/IP; queued local bills in SQLite drain automatically via idempotent POS sync API.
