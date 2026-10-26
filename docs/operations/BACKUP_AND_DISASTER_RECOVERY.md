# Backup and Disaster Recovery

Status: **IMPLEMENTED_AND_VERIFIED** (script executed for real on 2026-10-27; restore into a scratch site rehearsed same day; offsite copy + scheduled registration remain operational tasks for the store)

## Strategy

| Layer | Mechanism | Schedule (proposed) |
| --- | --- | --- |
| ERP database + files | `bench --site frontend backup --with-files` inside the container | nightly 02:00 |
| Copy-out + integrity + retention | `deployment/backup/run_backup.sh` (gzip -t every dump, SHA256SUMS, prune >14 days) | immediately after each backup |
| Counter SQLite | each counter's bills are synced to the ERP (authoritative); local DB is a queue — back up only for forensics | on app close, optional |
| Offsite | copy `C:\Users\<user>\departmental-backups\<stamp>\` to cloud storage (rclone) or an external disk | weekly minimum |

## Executed evidence (2026-10-27)

1. `bash deployment/backup/run_backup.sh` → **OK**:
   - dump `20261027_014340-frontend-database.sql.gz` + files tars copied to
     `C:\Users\COMPUTER\departmental-backups\20261027_014340\`
   - `gzip -t` integrity check passed; SHA256SUMS.txt written.
2. **Restore rehearsal** into an isolated scratch site (never production):
   `bench new-site test-dr-restore.local …` →
   `bench --site test-dr-restore.local restore <dump> --db-root-username root --db-root-password admin`
   → verified: app list intact, submitted Sales Invoice count, POS Sale Sync Log
   rows, PERF-* item catalog all present → scratch site dropped.
   (Earlier rehearsal 2026-10-26: same procedure, results recorded in
   docs/testing/TEST_EXECUTION_LOG.md.)

## Scheduling (operational task for the store)

- Windows Task Scheduler (store server, admin PowerShell):
  `schtasks /create /tn "DepartmentalERP Backup" /tr "wsl bash -c 'cd /mnt/c/.../departmental && bash deployment/backup/run_backup.sh'" /sc daily /st 02:00`
- Failure notification: the script exits non-zero on any failure — wrap with an
  email/Telegram alert or surface the last-run status on the Manager Console
  (planned: backup status widget reading the backup directory mtime).

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
