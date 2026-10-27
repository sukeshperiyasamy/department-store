# Backup and Restore Readiness Audit

**Document Version:** 1.0 (Phase 13 Independent Verification)  
**Date:** 2026-10-27  
**Auditor:** Automated Release Verification Agent (Phase 13)  
**Target Repository:** [sukeshperiyasamy/department-store](https://github.com/sukeshperiyasamy/department-store)  
**Primary Runbook:** `docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`  

---

## 1. Executive Summary

This independent audit assesses the disaster recovery (DR), automated backup schedule, archive integrity, and tenant restoration capabilities of the Department Store SaaS platform.

### Readiness Summary

| Capability | Local Implementation | Live Off-Site Verification | Gate Verdict |
| :--- | :--- | :--- | :--- |
| **Local Automated Backup** | Native PowerShell `run_backup.ps1` & Bash `run_backup.sh` | Task Scheduler `DepartmentalStore-ERP-Backup` status is `Ready` | **PASS** |
| **Archive Completeness** | Database (`.sql.gz`), public files (`.tar`), private files (`.tar`), config (`.json`) | Present in host backup archive | **PASS** |
| **Checksum Integrity** | SHA-256 calculated & recorded for all archive artifacts | Cryptographic verification passes | **PASS** |
| **Tenant-by-Tenant Restoration** | `bench --site <site> restore` | Tested via isolated scratch site restore | **PASS** |
| **File Restoration** | `tar -xf` into public/private file folders | Rehearsed in container | **PASS** |
| **Zero Data Leakage / Isolation** | Isolated scratch site dropped cleanly | Production site untouched | **PASS** |
| **Off-Site Storage Replication** | S3 / R2 / rclone replication scripts specified | **No cloud bucket provisioned** | **BLOCKED (Owner Action)** |
| **Encryption-at-Rest for Archives** | Plain GZIP compression | **KMS/GPG key management not configured** | **BLOCKED (Owner Action)** |

---

## 2. Backup Schedule, Scope & Integrity Verification

### 2.1 Host Automation & Schedule
- **PowerShell Runner:** [`deployment/backup/run_backup.ps1`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/backup/run_backup.ps1)
- **Task Scheduler Status:**
  ```powershell
  Get-ScheduledTask -TaskName "DepartmentalStore-ERP-Backup"
  # TaskPath: \
  # TaskName: DepartmentalStore-ERP-Backup
  # State: Ready (Daily at 02:00 AM IST)
  ```
- **Pruning & Retention:** Automatically prunes local backup sets older than 14 days based on filesystem creation timestamp.

### 2.2 Backup Set Artifact Inspection
Inspection of latest host backup at `C:\Users\COMPUTER\departmental-backups\20261027_102247`:

```
Artifact Name                                      Size (Bytes)   Status
-------------------------------------------------  ------------   ------
20261027_102247-frontend-database.sql.gz           1,772,182      VERIFIED (gzip -t OK)
20261027_102247-frontend-files.tar                 10,240         VERIFIED (tar -t OK)
20261027_102247-frontend-private-files.tar         10,240         VERIFIED (tar -t OK)
20261027_102247-frontend-site_config_backup.json   311            VERIFIED (JSON parse OK)
SHA256SUMS.txt                                     1,308          VERIFIED (Hashes match)
```

The backup set is **complete**, containing both database schema/records, tenant uploaded media, private customer files, and Frappe cryptographic secrets (`encryption_key` in `site_config.json`).

---

## 3. Restoration Rehearsal & Data Parity Evidence

### 3.1 Historical Scratch-Site Restoration Rehearsals
The platform has undergone two isolated end-to-end disaster recovery rehearsals:

1. **Rehearsal 1 (Single-Store Baseline, 2026-10-27 02:30 IST):**
   - Restored into `scratch-restore.local`.
   - Verified 4 apps (`frappe`, `erpnext`, `departmental_store`, `india_compliance`).
   - 95 Sales Invoices, 501 catalog items, 134 POS sync logs restored.
   - Scratch site dropped cleanly with zero impact on production `frontend`.
2. **Rehearsal 2 (Multi-Tenant & Security Hardening, 2026-10-27 10:25 IST):**
   - Restored into `scratch-phase8-restore.local` in **21 seconds**.
   - Verified 1:1 record parity: 254 Sales Invoices, 545 catalog items, 353 POS sync logs, and 10 feature flags.
   - Verified control-plane tables (`tabSaaS Tenant Registry`, `tabSaaS Subscription`) restored intact.
   - Dropped scratch site cleanly.

---

## 4. Outstanding Production Disaster Recovery Blockers

> [!WARNING]
> **Disaster Recovery Rule:**  
> A successful local SQL restore proves database syntax and schema compatibility, but **does NOT prove disaster recovery**. If the hosting server or local storage volume suffers catastrophic hardware failure, localized backups are lost in the same failure domain.

### 4.1 Blocker Details: Off-Site Replication (BLK-OPS-01)
1. **Failure Domain Separation:** Currently, backups reside on the same physical NVMe drive as the Docker host volumes (`C:\Users\COMPUTER\departmental-backups`).
2. **Required Action:**
   - Platform Owner must provision an isolated cloud storage target (e.g., AWS S3 Glacier, Cloudflare R2, or Backblaze B2) in a separate geographical region.
   - `rclone` or AWS CLI sync script must be configured to copy new backup tarballs immediately after generation.
   - Cloud storage must enforce **Object Lock (WORM - Write Once Read Many)** for at least 30 days to defend against ransomware.

### 4.2 Blocker Details: Encryption at Rest & Key Isolation
1. **Current State:** Backups are compressed using standard `gzip`, but not encrypted with an external public GPG key before leaving the database container.
2. **Required Action:**
   - Establish asymmetric encryption (e.g. `gpg --encrypt --recipient backup@departmentstore.in`) before exporting archives.
   - Store the private decryption key in an isolated external secrets manager (AWS KMS / HashiCorp Vault), strictly separated from the production database server.

---

## 5. Audit Conclusion

The local backup automation, archive completeness, and restoration procedures are **VERIFIED and FUNCTIONAL**.

However, **Public Commercial Launch is BLOCKED on Off-Site Cloud Storage Replication (BLK-OPS-01)**. Supervised pilot operations in 1–3 local stores may proceed provided local daily backups are copied manually to a secondary physical medium (e.g., an external drive) after each business day.
