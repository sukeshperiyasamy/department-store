# Backup and Restore Runbook

## What to back up

| Component | What | Where |
| --- | --- | --- |
| ERP database | `bench --site frontend backup` (SQL dump) | container: `sites/frontend/private/backups` |
| ERP files | attachments/public files (`--with-files`) | same |
| Counter SQLite | `pos.db` (+ WAL) while the POS app is closed | `%APPDATA%` per counter Tauri app-data dir |
| Configuration | `.env` values (dashboard), compose overrides | repo-external secret store |

## Schedule (proposed — to be scheduled before go-live)

- ERP: nightly full backup 02:00 IST, retained 30 days daily / 12 monthly;
  encrypted (`openssl enc` or age) and copied offsite via rclone.
- Counters: on app close, copy DB to a network share; note the ERP already holds
  every finalized bill, so the counter DB is only for pending/review forensics.

## Restore procedure (ERP — rehearse quarterly in a test environment)

1. `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp down` (or the production equivalent).
2. Start only db + redis; restore SQL:
   `bench --site frontend restore <dump.sql.gz> --with-public-files <files.tgz> --with-private-files <private.tgz>`
3. Reinstall/verify `departmental_store` app version matches the backup era
   (`bench --site frontend list-apps`), run `bench migrate`.
4. Bring the full stack up; verify: login works, owner_summary returns
   plausible numbers, POS Sale Sync Log review queue matches the last known
   state, a test POS bill posts and moves stock.
5. Counters: on first connect, catalog re-syncs from the ERP (checkpoint
   reset). Pending counter bills are replayed by the sync engine — server
   idempotency prevents duplicates.

## Verification of backups

A backup is only real after a restore: after each scheduled backup, run an
automated restore into a scratch site monthly, and a manual full rehearsal
quarterly. Record the result in docs/project-status.md.
