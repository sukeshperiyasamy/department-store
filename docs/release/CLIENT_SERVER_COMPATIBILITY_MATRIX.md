# Client-Server Compatibility Matrix & Deprecation Policy

## 1. Supported Client Version Matrix

To ensure that billing counters, owner dashboards, and mobile devices can operate smoothly across progressive server rollouts, the platform guarantees **backward compatibility for at least N-1 minor client versions**.

| Client Application | Client Version | Backend API Version | Compatibility Status | Support Window | Action on Incompatible Request |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows POS** | `1.0.x` | `v1` | **Fully Supported** (Active) | Current GA | Normal processing |
| **Windows POS** | `0.1.x` | `v1` | **Supported** (Legacy) | Rollout grace period (90 days) | Normal processing; warning logged |
| **Windows POS** | `< 0.1.0` | Legacy | **Unsupported** | Deprecated | HTTP 426 Upgrade Required; offline queue preserved |
| **Owner Dashboard** | `1.0.x` | Next.js Server Actions | **Fully Supported** | Bundled with release | Normal processing |
| **Owner Dashboard** | `0.1.x` | Next.js Server Actions | **Supported** | Compatible | Normal processing |
| **Mobile Companion**| `0.1.x` | `v1` | **Supported** | Current Beta | Normal processing |

---

## 2. Windows POS Offline Queue Preservation Protocol

Windows billing counters operate in physical stores where internet connectivity is intermittent. A counter may take an update while containing pending offline sales in its local SQLite database.

```
+----------------------------------------------------------------------------------------------------+
| 1. Windows POS App Upgrade Initiated (NSIS Installer)                                              |
| - Installer preserves existing SQLite database file at %LOCALAPPDATA%/DepartmentStorePOS/pos.db   |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 2. New POS Binary Starts & Opens Existing Database                                                 |
| - Inspects PRAGMA user_version                                                                     |
| - Executes non-destructive migrations: ALTER TABLE ... ADD COLUMN                                  |
| - Verifies outbox table has untouched PENDING / SYNCING transactions                               |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 3. Sync Engine Resumes Offline Reconciliation                                                      |
| - Sync worker reads existing queued transactions                                                   |
| - Submits transactions with original stable transaction_id                                         |
| - Backend idempotency engine recognizes transaction or creates official Sales Invoice             |
| - Outbox status transitions to SYNCED; local transaction marked SERVER_COMMITTED                   |
+----------------------------------------------------------------------------------------------------+
```

### Critical Durability Guarantees
- **No Database Truncation**: Installers and application boot routines MUST NOT execute `DROP TABLE`, `VACUUM INTO`, or file replacements that destroy the existing SQLite database.
- **Transaction Idempotency**: Resubmitted offline sales carry their original UUID and counter ID. The backend responds with the existing `invoice_id` if already committed, guaranteeing zero duplicate ledger entries.
- **Clear Error Messaging**: If a backend update requires a mandatory client upgrade, the API returns:
  ```json
  {
    "error_code": "CLIENT_UPGRADE_REQUIRED",
    "message": "This billing counter version (0.0.9) is no longer supported. Please run the updater. Your offline queued transactions (12 bills) are safely stored and will sync automatically after update."
  }
  ```
  The POS does not delete or purge the queue upon receiving this error.

---

## 3. Server-Side Contract Evolution Rules

1. **Additive Changes**:
   - New fields added to `SubmitSalePayload` or `CatalogItem` must be optional in TypeScript types and have safe server-side fallbacks.
2. **Field Deprecation**:
   - Fields marked for removal must be deprecated with warnings for at least two minor release cycles before removal.
3. **Strict Validation at Trust Boundary**:
   - API endpoints use Zod validators (`packages/shared-types`) to parse payloads before invoking ERPNext business logic, discarding unknown keys without rejecting the entire transaction.
