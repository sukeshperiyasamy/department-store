# Off-Site Backup Specification and Disaster Recovery Audit

**Document Version:** 1.0 (Phase 15 Disaster Recovery & Off-Site Replication)  
**Date:** 2026-10-27  
**Auditor:** Automated Disaster Recovery & SRE Verification Agent  
**Repository:** `sukeshperiyasamy/department-store`  
**Replication Utility:** `deployment/backup/replicate_offsite.py`  
**Restoration Validator:** `deployment/backup/test_restore_scratch.py`  
**Primary Backup Scripts:** `deployment/backup/run_backup.ps1` / `run_backup.sh`

---

## 1. Executive Summary & Strategy Overview

A robust departmental-store SaaS management system requires strict separation between:
1. **Local Backup Snapshots:** Rapid recovery on the local host in the event of minor database corruption or botched migrations.
2. **Off-Site Object Storage Replication:** Cold disaster recovery safeguarding against complete host failure, physical disaster, datacenter loss, or catastrophic ransomware.

> [!IMPORTANT]
> A local backup copy is **NEVER** proof of successful off-site disaster recovery. Off-site replication requires verifiable transmission across a distinct failure domain to encrypted object storage.

### Disaster Recovery Verdict
**`CONDITIONAL — Local preparation and remote CI verified; external cloud storage bucket unprovisioned`**

- **Remote CI/CD Quality Gates:** **PASS** (Commit `617bdd0` verified green on GitHub Actions run `40524872536`, all 6 jobs passed)
- **Local Backup Generation & Checksum Validation:** **PASS** (12 files verified with SHA-256)
- **Isolated Scratch Site Restoration Drill:** **PASS** (Restored in 70.59s with balanced GL entries and 1:1 data parity)
- **Provider-Independent Replication & Retrieval Tool:** **PASS** (AWS SigV4, AES256, SHA-256 dry-run and atomic download verified; 20 unit tests PASS)
- **Live Cloud Object Storage Replication:** **NOT TESTED / BLOCKED** (Awaiting Owner provisioned S3 / Cloudflare R2 bucket credentials)

---

## 2. Recovery Objectives: RPO & RTO

| Metric | Target Specification | Measured Benchmark | Verification Methodology |
| :--- | :--- | :--- | :--- |
| **Recovery Point Objective (RPO)** | **Central ERP Database:** <= 24 hours (Nightly snapshot).<br>**Billing Counters:** **0 data loss** (buffered in counter SQLite outbox). | Confirmed architectural invariant | Counter SQLite outbox queues offline sales atomically; sync engine drains upon server reconnection. |
| **Recovery Time Objective (RTO)** | **Site Database Restore:** < 15 minutes (900 seconds).<br>**Complete Bare-Metal Host Rebuild:** < 60 minutes. | **70.59 seconds** (database restore into isolated scratch environment) | Automated drill via `deployment/backup/test_restore_scratch.py` executing `bench restore`. |

---

## 3. Off-Site Replication Architecture (`replicate_offsite.py`)

### 3.1 Design Principles
Implemented in [`deployment/backup/replicate_offsite.py`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/backup/replicate_offsite.py):
1. **Provider-Independent Compatibility:**
   - Adheres to AWS S3 REST API specifications using AWS Signature Version 4 (SigV4).
   - Fully compatible with Amazon S3, Cloudflare R2, MinIO, Wasabi, and Backblaze B2.
   - Requires zero heavy third-party CLI binaries (`rclone` or `aws-cli` optional, not mandatory).
2. **Encryption in Transit & at Rest:**
   - **In Transit:** Mandatory HTTPS / TLS encryption across all network transfers (plain HTTP strictly blocked except `localhost` / `127.0.0.1`).
   - **At Rest:** Enforces server-side encryption via `x-amz-server-side-encryption: AES256` (or `aws:kms`). Note: Client-side pre-encryption is not configured.
3. **Immutable Timestamped Keying & Path Traversal Guards:**
   - Remote destination path: `{S3_PREFIX}/{timestamp}/{filename}`.
   - Strict bucket naming, region, and object key validation rejects path traversal (`..`, `\`, null bytes, or leading slashes).
4. **Pre-Upload, Post-Upload & Download Integrity:**
   - Verifies `SHA256SUMS.txt` against local files prior to transmission.
   - Injects SHA-256 digest into S3 object metadata (`x-amz-meta-sha256: <hash>`).
   - Distinguishes `UPLOAD_ACKNOWLEDGED` (HTTP 200 on PUT) from `REMOTE_VERIFIED` (post-upload `HEAD` probe confirms existence, byte count, and SHA-256 metadata).
   - `download_file()` streams S3 objects to `.part` files with real-time SHA-256 checksumming, renaming atomically only upon verified match.
5. **Credential Masking & Privacy:**
   - Access keys and tokens are masked in logs (e.g. `AKIA***`).
   - Secret keys and authorization signatures are **NEVER** logged or included in reports.
6. **Safe Pruning & Retention Guard:**
   - Supports configurable retention pruning via `evaluate_retention_pruning()`.
   - **Safety Invariant:** Guarantees that the newest backup set and minimum retained backups (at least 1) can **NEVER** be deleted, even if older than the retention cutoff.

### 3.2 Configuration Reference

```bash
# Set in secure environment file (e.g. /etc/departmental-store/backup.env)
OFFSITE_BACKUP_ENABLED=true
S3_BUCKET_NAME=department-store-backups-ap-south-1
S3_REGION_NAME=ap-south-1
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_PREFIX=department-store-backups/
S3_STORAGE_CLASS=STANDARD_IA
S3_SSE_ALGORITHM=AES256
S3_RETENTION_DAYS=30
```

### 3.3 Provider-Specific Architecture & Compatibility Matrix

| Feature / Setting | AWS S3 | Cloudflare R2 | MinIO (Self-Hosted) |
| :--- | :--- | :--- | :--- |
| **Endpoint Format** | `https://s3.<region>.amazonaws.com` (default) | `https://<account_id>.r2.cloudflarestorage.com` | `https://minio.internal:9000` |
| **URL Path Style** | Virtual-hosted or path-style supported | Path-style (`/<bucket>/<key>`) required | Path-style (`/<bucket>/<key>`) required |
| **Region Parameter** | Specific AWS region (e.g. `ap-south-1`, `us-east-1`) | `auto` (or `us-east-1` for SigV4 signing) | `us-east-1` (default) or custom |
| **Server-Side Encryption** | `x-amz-server-side-encryption: AES256` | Transparently encrypted; headers accepted | AES256 or KMS if configured |
| **Storage Class** | `STANDARD`, `STANDARD_IA`, `GLACIER_IR` | Standard (unified tier, zero egress fees) | Standard tier |
| **Egress Fees** | Standard AWS data egress rates | **Zero egress fees** (ideal for DR drills) | Zero egress fees |

---

## 4. Disaster Recovery Scratch Restoration Drill

### 4.1 Methodology
To guarantee that backup archives are genuinely recoverable without risking live tenant data, the automated validator [`deployment/backup/test_restore_scratch.py`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/backup/test_restore_scratch.py) executes a non-destructive drill:

```mermaid
flowchart TD
    A[Locate Latest Local Backup] --> B[Verify SHA-256 Checksums in SHA256SUMS.txt]
    B --> C[Verify Scratch Site Non-Existence Collision Guard]
    C --> D[Copy Database Dump to Backend Container /tmp]
    D --> E[Create Isolated Scratch Site: scratch-phase15-restore.local]
    E --> F[Execute bench restore Database Dump]
    F --> G[Measure RTO Duration: 70.59s]
    G --> H[Query Restored Parity & GL Ledger Balance]
    H --> I[Drop Scratch Site Cleanly: bench drop-site --force]
    I --> J[Confirm Production Site 'frontend' Remained Untouched]
```

### 4.2 Rehearsal Evidence (Executed 2026-10-27)

```
================================================================================
DISASTER RECOVERY SCRATCH RESTORATION DRILL SUMMARY
================================================================================
Test Classification: LOCAL_RESTORE_TEST
Description:         Local Backup Volume Disaster Recovery Rehearsal (Non-Destructive)
Status:              PASS
Backup Directory:    C:\Users\COMPUTER\departmental-backups\20261027_102247
Checksum Verified:   True
RTO Measured:        70.59s (Target: <900.0s)
RPO Target:          24 hours for central ERP database; 0 data loss for counter sales (buffered in SQLite)
Total Duration:      127.6s

Restored Data Parity & Financial Integrity:
  - app_availability: PONG
  - installed_apps: ['frappe', 'erpnext', 'departmental_store', 'india_compliance']
  - sales_invoices: 254 (exact match)
  - catalog_items: 545 (exact match)
  - pos_sync_logs: 353 (exact match)
  - saas_tenants: 0
  - saas_subscriptions: 2 (exact match)
  - saas_invoices: 2 (exact match)
  - gl_ledger_balanced: True (GL Entry debit - credit = 0.0)
  - gl_imbalance_amount: 0.0

Cleanup Status: Cleaned up automatically.
================================================================================
```

---

## 5. Bare-Metal Host Recovery Runbook (Total Datacenter Loss)

In the event of catastrophic hardware loss or server destruction:

1. **Provision Replacement Host:**
   - Launch Ubuntu 24.04 LTS instance with at least 4 vCPUs and 16 GB RAM.
   - Install Docker Engine, Docker Compose, Git, and Python 3.
2. **Clone Department Store Repository:**
   ```bash
   git clone https://github.com/sukeshperiyasamy/department-store.git /opt/department-store
   cd /opt/department-store
   ```
3. **Retrieve Latest Off-Site Backup:**
   ```bash
   # Download latest backup folder from S3 bucket using AWS CLI or replicate_offsite.py
   aws s3 cp s3://my-backup-bucket/department-store-backups/20261027_102247/ /var/backups/department-store/20261027_102247/ --recursive
   ```
4. **Validate Integrity Before Restoration:**
   ```bash
   python3 deployment/backup/replicate_offsite.py --backup-dir /var/backups/department-store/20261027_102247/ --verify-only
   ```
5. **Launch Base ERP Containers:**
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
   ```
6. **Restore Production Site:**
   ```bash
   docker cp /var/backups/department-store/20261027_102247/ departmental-erp-backend-1:/tmp/restore/
   docker exec departmental-erp-backend-1 bench --site frontend restore /tmp/restore/*-database.sql.gz --with-public-files /tmp/restore/*-files.tar --with-private-files /tmp/restore/*-private-files.tar --db-root-username root --db-root-password admin
   docker exec departmental-erp-backend-1 bench --site frontend migrate
   docker exec departmental-erp-backend-1 rm -rf /tmp/restore/
   ```
7. **Start Edge Ingress & Verify Site:**
   ```bash
   docker compose -f deployment/ingress/docker-compose.traefik.yml up -d
   curl -fsS http://localhost:8080/api/method/departmental_store.api.health.get_liveness
   ```
8. **Billing Counter Reconnection:**
   - Counters reconnect automatically to the restored server.
   - Any transactions that occurred while the server was down are stored safely in counter SQLite outbox tables and drain idempotently without data loss or duplicates.
