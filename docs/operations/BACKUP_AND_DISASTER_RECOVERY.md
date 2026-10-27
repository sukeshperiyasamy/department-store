# Backup and Disaster Recovery

Status: **IMPLEMENTED_AND_VERIFIED** (PowerShell runner + Git Bash runner executed; host Task Scheduler registered and verified; scratch site restore rehearsal verified 2026-10-27)

## Strategy

| Layer | Mechanism | Schedule |
| --- | --- | --- |
| ERP database + files | `bench --site frontend backup --with-files` inside the container | nightly 02:00 IST |
| Copy-out + integrity + retention | `deployment/backup/run_backup.ps1` (native Windows) or `run_backup.sh` (gzip -t / SHA256SUMS, prune >14 days) | immediately after each backup |
| Windows Task Scheduler | `deployment/backup/schedule_backup.ps1` (`DepartmentalStore-ERP-Backup`) | daily at 02:00 IST (Active / Ready) |
| Counter SQLite | each counter's bills are synced to the ERP (authoritative); local DB is a queue — back up only for forensics | on app close, optional |
| Offsite | copy `$env:USERPROFILE\departmental-backups\<stamp>\` to cloud storage (rclone) or an external disk | weekly minimum |

## Executed evidence (2026-10-27)

1. **Backup Automation Execution:**
   - PowerShell runner: `powershell -NoProfile -ExecutionPolicy Bypass -File deployment\backup\run_backup.ps1` → **OK**:
     dump `20261027_060127-frontend-database.sql.gz` + files tars copied to `C:\Users\COMPUTER\departmental-backups\20261027_060127\`.
     SHA256SUMS.txt generated; 14-day retention pruning verified.
   - Git Bash runner: `"C:\Program Files\Git\bin\bash.exe" deployment/backup/run_backup.sh` → **OK** (`gzip -t` passed).
2. **Host Task Scheduler Registration:**
   - Registered task via `deployment\backup\schedule_backup.ps1`.
   - Verified via `Get-ScheduledTask -TaskName "DepartmentalStore-ERP-Backup"`: state is `Ready`, trigger is daily at 02:00 AM IST.
3. **Restore rehearsal** into an isolated scratch site (`scratch-restore.local`):
   - Dump `20261027_055810-frontend-database.sql.gz` restored into `scratch-restore.local`.
   - Verified: all 4 apps present (`frappe`, `erpnext`, `departmental_store`, `india_compliance`).
   - Verified records: 95 Sales Invoices, 501 Items, 134 POS Sale Sync Logs, all 10 feature flags matching.
   - Scratch site dropped cleanly via `bench drop-site scratch-restore.local --force`. Production site `frontend` remained completely untouched.

## Scheduling Commands (for store administrator)

- Register daily backup job (PowerShell administrator prompt):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File deployment\backup\schedule_backup.ps1
  ```
- Trigger on-demand backup:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File deployment\backup\run_backup.ps1
  ```

## Recovery procedure (condensed; full steps in docs/testing/TEST_ENVIRONMENT.md §6)

1. Stop app writes (counters keep queueing locally — no data loss).
2. Provision/repair the stack; create an empty site.
3. `bench --site <site> restore <dump> --db-root-username root --db-root-password admin`
4. Verify: app list, invoice counts, sync-log review queue, one test bill posts
   and moves stock.
5. Counters reconnect and catalog-sync automatically; pending local bills replay
   through the idempotent sync (server claim prevents duplicates).

## Rules honored

- Restore tested in an isolated site only; production data never touched.
- Backup integrity verified mechanically (gzip -t + hashes), not assumed.
