#!/usr/bin/env bash
# ERP backup + offsite-style copy for the departmental store docker deployment.
# Designed for Windows Task Scheduler (or cron on Linux). Idempotent and safe:
# backup runs INSIDE the container; files are copied out; old backups pruned.
#
# Schedule (proposed, not yet registered — see BACKUP_AND_DISASTER_RECOVERY.md):
#   daily 02:00 IST full backup; keep 14 daily / 8 weekly / 6 monthly.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deployment/erpnext/pwd.yml}"
PROJECT="${PROJECT:-departmental-erp}"
DEFAULT_BASE="${USERPROFILE:-${HOME:-/tmp}}"
BACKUP_ROOT="${BACKUP_ROOT:-$DEFAULT_BASE/departmental-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

echo "[backup] running bench backup inside container..."
MSYS_NO_PATHCONV=1 docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T backend \
  bash -c "bench --site frontend backup --with-files"

echo "[backup] copying out of container..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" cp \
  backend:/home/frappe/frappe-bench/sites/frontend/private/backups/. "$DEST/"

echo "[backup] verifying artifacts..."
ls "$DEST" | grep -q "database.sql.gz" || { echo "[backup] FAILED: no database dump"; exit 1; }

echo "[backup] integrity check (gzip -t)..."
for f in "$DEST"/*-database.sql.gz; do gzip -t "$f"; done

echo "[backup] pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

# Verification hash for the restore runbook
( cd "$DEST" && sha256sum * > SHA256SUMS.txt )

echo "[backup] OK: $DEST"
