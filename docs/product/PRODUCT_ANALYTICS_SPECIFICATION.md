# Product Analytics Specification & Privacy Policy

## 1. Principles & Objectives
The Departmental Store SaaS collects **operational and reliability telemetry** strictly to ensure service availability, detect counter synchronization delays, diagnose database anomalies, and guide customer-driven product refinements.

### Strict Privacy & Non-Surveillance Guardrails
1. **Zero External Ad/Tracker Scripts:** No third-party tracking scripts (Google Analytics, Mixpanel, Hotjar, Facebook Pixel) are injected into the owner dashboard or Windows POS.
2. **Zero PII or Financial Exposure:** Customer phone numbers, Aadhaar/PAN, employee PINs, secret tokens, and individual customer basket items are **strictly excluded** from analytics events.
3. **Operational Telemetry ≠ Authoritative Accounting:** Product telemetry measures system health and feature usage; official financial, tax, and inventory figures reside solely in central ERPNext ledger tables.
4. **Tenant Isolation:** Platform-level aggregates (e.g. provisioning failure rates) never expose tenant-specific sales amounts or distributor names. Tenant-level metrics are accessible only by authorized store managers of that tenant.

---

## 2. Core Operational Metrics Catalog

| Metric ID | Metric Name | Category | Objective / Business Question | Measurement Frequency | Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MET-001** | Onboarding Funnel Completion Rate | Onboarding | What % of registered leads successfully complete email/phone verification and tenant provisioning? | Weekly Aggregate | Platform Admin |
| **MET-002** | Time to First Successful Store Setup (TTFSS) | Onboarding | How many minutes elapse between tenant provisioning and the first item being scanned or POS bill saved? | Per Onboarding Event | Platform Admin |
| **MET-003** | POS Sync Delay & Lag Window | POS Reliability | How long do offline transactions sit in counter SQLite outboxes before syncing to central ERPNext? | Continuous (p50, p95, p99) | Tenant Dashboard & POS |
| **MET-004** | POS Sync Error & Review Rate | POS Reliability | What % of synced bills require manager review due to barcode/stock/pricing discrepancies? | Daily Aggregate | Tenant Dashboard & POS |
| **MET-005** | Provisioning Failure & Rollback Rate | Platform Health | What proportion of automated site creation jobs fail and trigger safe teardown? | Real-time Alerting | Platform Admin |
| **MET-006** | Support Incident Frequency (SIF) | Operations | How many support tickets are submitted per active shop per month, grouped by category? | Monthly Aggregate | Platform Admin |
| **MET-007** | Low-Stock Replenishment Export Frequency | Feature Adoption | How often do shop owners export low-stock reorder lists for supplier replenishment? | Weekly Event Count | Tenant Dashboard |
| **MET-008** | Multi-Counter Claim Contention Rate | Concurrency | How often do concurrent counter sync claims encounter contention or stale lock timeouts? | Real-time Telemetry | Tenant Dashboard & Tech Team |

---

## 3. Data Schema & Redaction Specification

### Event Envelope
```json
{
  "event_id": "evt_01J9Z5P3X8Q...",
  "timestamp": "2026-10-27T10:15:30.120Z",
  "metric_id": "MET-003",
  "tenant_id": "site_sri_amman",
  "source_component": "windows-pos",
  "device_id": "pos-counter-01",
  "app_version": "0.1.0",
  "properties": {
    "sync_lag_ms": 1420,
    "batch_size": 3,
    "network_mode": "online",
    "retry_attempt": 0
  }
}
```

### Prohibited Attributes
Under no circumstances may an analytics payload contain:
- Customer phone number, name, address, or payment card digits.
- Line-item prices, GST breakdown amounts, or basket total value (belongs in `POS Invoice` ledger).
- Frappe session secrets (`sid`), API keys, JWTs, or passwords.
- Cashier employee personal PIN or biometric data.

---

## 4. Platform vs. Tenant Access Boundaries

| Role | Tenant-Specific Analytics | Platform-Wide Aggregates | Access Method |
| :--- | :--- | :--- | :--- |
| **Store Owner / Manager** | Own store sync delay, active counters, review queue count, reorder exports | None | Owner Dashboard (`/settings`, `/overview`, `/inventory`) |
| **Cashier / POS Terminal** | Local counter outbox count, local sync status, last sync timestamp | None | Windows POS Status Bar |
| **Platform Administrator** | Redacted diagnostic snapshots submitted via explicit support tickets | Global onboarding rate, provisioning latency, cluster health, total active shops | Platform Admin Console (`/admin`) |
| **Third Parties** | Strictly None | Strictly None | Not Permitted |

---

## 5. Retention & Deletion Schedule

1. **High-Frequency Diagnostic Events (Sync pings, ping latency):**
   - Retained in SQLite / local log files for **14 days**.
   - Automatically truncated via rotating log policy (max 10MB per counter).
2. **Aggregated Operational Metrics (Daily review counts, weekly setup latency):**
   - Retained in platform metrics tables for **90 days**.
3. **Customer Support Tickets & Attached Diagnostics:**
   - Retained for **180 days** after ticket resolution to analyze recurring hardware/network failure patterns.
   - Deleted immediately upon tenant offboarding or explicit customer account purge request (`right-to-be-forgotten`).

---

## 6. Audit & Compliance
- Telemetry collection can be inspected by store owners via `10. Customer Support & Diagnostics -> System Diagnostics & Telemetry`.
- Store owners can copy the exact JSON payload transmitted to platform support, verifying that all customer information and credentials remain 100% redacted.
