# Release and Change Audit Trail Specification

## 1. Audit Policy and Core Objectives

The Departmental Store SaaS maintains an immutable, tamper-resistant audit trail across all critical operational and administrative events. The audit system fulfills three essential requirements:
1. **Traceability**: Every release, configuration change, migration, and tenant lifecycle transition can be linked to an authenticated actor and correlation ID.
2. **Privacy & Credential Redaction**: Access tokens, private keys, database passwords, and customer payment details are strictly redacted before emission.
3. **Tenant Immutability**: Platform-wide audit records are owned by the SaaS control plane. Tenant administrators and cashiers have zero authority to modify, truncate, or overwrite platform audit logs.

---

## 2. Audited Event Types and Schema

All audit records conform to a standardized JSON structure written to the structured logger (`frappe.logger("departmental_store")`) and mirrored to Frappe `tabActivity Log`.

```json
{
  "timestamp": "2026-10-27T18:00:00.123Z",
  "correlation_id": "req-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "actor": "admin@departmental.local",
  "actor_role": "Platform Administrator",
  "action": "TENANT_MIGRATION_COMPLETED",
  "target": "site_pilot_mart",
  "target_type": "FrappeSite",
  "outcome": "SUCCESS",
  "details": {
    "duration_seconds": 4.12,
    "pre_migration_backup_id": "bak-20261027-020000",
    "schema_version": "1.0.0"
  }
}
```

### 2.1 Audited Operations Catalog

| Action Identifier | Triggering Event | Mandatory Target | Logged Attributes |
| :--- | :--- | :--- | :--- |
| `RELEASE_DEPLOYED` | New application release deployed to cluster | Cluster / Release ID | Git commit SHA, image tag, migration flag |
| `MIGRATION_STARTED` | Tenant migration runner begins site update | `site_<slug>` | Cohort name (Canary vs General), lock file |
| `MIGRATION_COMPLETED` | Site schema migration succeeded | `site_<slug>` | Elapsed time, schema version |
| `MIGRATION_FAILED` | Migration command raised error | `site_<slug>` | Error traceback, exit code, halt flag |
| `FEATURE_FLAG_CHANGED` | Operator modified setting via `set_flag()` | `Departmental Store Settings` | Flag name, old value, new value |
| `TENANT_SUSPENDED` | Tenant suspended due to billing/abuse | `tabSaaS Tenant` | Reason code, suspension timestamp |
| `TENANT_REACTIVATED` | Suspended tenant restored to active status | `tabSaaS Tenant` | Invoice reference, operator user |
| `BACKUP_INITIATED` | Database dump or snapshot started | Database / Volume | Target path, backup type |
| `BACKUP_COMPLETED` | Backup dump completed and verified | Database / Volume | File size (MB), SHA256 checksum |
| `RESTORE_EXECUTED` | Database restore from backup archive | `site_<slug>` | Source backup SHA256, duration |
| `EMERGENCY_ROLLBACK` | Operator aborted migration or reverted code | Cluster / Container | Previous image tag, rollback reason |
| `SECURITY_CONFIG_CHANGED`| Ingress TLS or rate limit policy modified | Traefik / Middleware | Rate limit threshold, rule name |

---

## 3. Redaction and Masking Rules

The platform logging framework automatically strips forbidden keys before serialization:
- **Masked Keys**: `password`, `secret`, `api_secret`, `token`, `authorization`, `private_key`, `card_number`, `cvv`.
- **Masking Format**: Replaced with `[REDACTED]` or preserved only as high-entropy prefix/suffix (e.g. `rzp_live_...48F9`).
- **Personal Data**: Customer phone numbers and emails are masked in platform logs (`9876****10`, `o***r@domain.com`) to comply with India Digital Personal Data Protection Act (DPDPA 2023).

---

## 4. Log Storage, Retention & Immutability

1. **Storage Location**:
   - Application logs: `/home/frappe/frappe-bench/logs/departmental_store.log`
   - Ingress access logs: `/var/log/traefik/access.log`
2. **Retention Policy**:
   - Stored on host disk for 90 days with daily rotation (`logrotate`).
   - Compressed archives (`.gz`) replicated to immutable offsite cloud cold storage retained for 1 year for tax audit compliance (GST Rule 56(16)).
3. **Tenant Access Boundaries**:
   - Multi-tenant tenant users only see their own local POS cashier shift logs or store-level sales registers. Control-plane and migration logs are inaccessible via the tenant dashboard.
