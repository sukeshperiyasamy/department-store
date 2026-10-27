# Database and Application Reliability Audit

**Document Version:** 1.0.0  
**Phase:** Phase 8 — Production Hardening & Reliability  
**Target Architecture:** ERPNext/Frappe v16 + MariaDB 11.8 + Redis 6.2 + Windows POS SQLite  

---

## 1. Database Connection Management & Limits

| Parameter | Configuration | Production Rationale |
| --- | --- | --- |
| **Engine** | MariaDB 11.8 (InnoDB) | Full ACID compliance, row-level locking for high-concurrency transactions |
| **Max Connections** | Default 151 (Configurable via `my.cnf` up to 500) | Sized for 10-20 concurrent POS counters + web workers without thrashing RAM |
| **Connection Pooling** | Gunicorn worker reuse + Python DB connection lifecycle | Persistent within worker thread lifetime, closed cleanly on request completion |
| **Network Boundary** | Docker internal `frappe_network` | `3306/tcp` is strictly unexposed to host or public internet |

### Query & Lock Contention Controls
- Provisioning jobs and tenant state updates utilize row-level locking (`SELECT ... FOR UPDATE`) within explicit transactions.
- Long-running reporting queries (e.g., historical sales summaries) are capped to specified date ranges or offloaded to read replicas if scale demands.
- ERPNext background workers execute on dedicated `queue-short` and `queue-long` containers, isolating heavy batch jobs from real-time POS submission traffic.

---

## 2. Migration Ordering and Rollback Strategy

1. **Ordering Discipline:**
   - App migrations execute in dependency order: `frappe` -> `erpnext` -> `india_compliance` -> `departmental_store`.
   - Structural schema migrations are additive where possible (new nullable columns, new indices, separate extension tables like `tabSaaS Tenant Registry`).
2. **Rollback Policy:**
   - **Destructive migrations are never executed automatically.**
   - In the event of a failed migration during deployment:
     * Retain MariaDB transaction state.
     * Restore from pre-migration backup snapshot if schema modification corrupted data.
     * Never drop tenant tables or alter posted accounting entries (`tabSales Invoice`, `tabGL Entry`).

---

## 3. Background Job Reliability & Worker Isolation

```
+-------------------------------------------------------------+
|                      Redis Queue Engine                     |
+-------------------------------------------------------------+
       |                                              |
       v                                              v
+-----------------------+                    +-----------------------+
|  queue-short worker   |                    |  queue-long worker    |
|  - POS Sync Claim     |                    |  - Database Backups   |
|  - Token Verification |                    |  - Provisioning Jobs  |
|  - Webhook Dispatch   |                    |  - Heavy Reports      |
+-----------------------+                    +-----------------------+
```

- **Timeout Boundaries:**
  * `queue-short`: Maximum execution time 300 seconds (5 minutes).
  * `queue-long`: Maximum execution time 1500 seconds (25 minutes).
- **Stale Job Reclamation:**
  * Provisioning jobs claimed by a crashed worker are automatically detected after 10 minutes and returned to `pending` status or marked for review (capped at 3 retry attempts).

---

## 4. POS Offline Operation & Outbox Guarantees

The Windows POS is decoupled from central server uptime to ensure retail operations continue during internet or server outages.

### Outbox Durability Lifecycle:
1. **Local Persist:** Cashier tenders sale; bill is saved to local SQLite tables (`receipt_sales`, `outbox_events`) in a single ACID transaction.
2. **Offline Resilience:** POS remains 100% operational offline. Cashier can print local receipts, tender cash/UPI QR, and complete sales.
3. **Idempotent Sync:**
   - When network connectivity returns, `sync-engine` drains pending events to `/api/method/departmental_store.api.sales.submit_pos_sale`.
   - Central server checks `tabSaaS POS Sale Sync Log` for the transaction UUID.
   - If already submitted (duplicate retry), server returns previously committed invoice without re-posting.
   - If new, server atomically posts `Sales Invoice`, updates inventory, and creates `Payment Entry`.
4. **Failure Boundary:**
   - In case of item pricing discrepancy or validation error, the bill is placed into `requires_review` queue in ERP desk, ensuring no sale is silently dropped or lost.

---

## 5. Resource Exhaustion & Graceful Shutdown

- **Disk Full Protection:**
  - Health endpoint monitors available disk space (`disk_free_gb`, `disk_used_percent`).
  - Automated backups prune snapshots older than 14 days, preventing unbounded disk growth.
- **Graceful Shutdown:**
  - Docker Compose uses standard SIGTERM handling (`stop_grace_period: 30s`) allowing workers to finish in-flight requests before exiting.
