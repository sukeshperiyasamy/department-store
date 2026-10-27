# Multi-Tenant Departmental Store SaaS — Scaled Workload Profiles

**Milestone:** Phase 10 — Scale Readiness, Performance Engineering, and Commercial Launch  
**Repository:** `https://github.com/sukeshperiyasamy/department-store`  
**Date:** 2026-10-27  
**Author:** Antigravity Performance & Reliability Engineering Agent  

---

## 1. Executive Workload Architecture

The Departmental Store SaaS platform serves two distinct functional tiers:
1. **Edge Retail Billing Tier (Windows POS & Cashier Counters):**
   - High-availability, zero-latency local billing against local SQLite cache (`apps/windows-pos`).
   - Asynchronous outbox queue synchronizing finalized transactions to ERPNext.
   - Resilient to network outages (bills are persisted atomically offline and drained upon reconnection).
2. **Central Cloud/Staging Control Plane Tier (ERPNext, MariaDB, Next.js, Mobile):**
   - Authoritative ledger for financial accounting (GL entries), official GST invoices (`Sales Invoice`), inventory movements (`Stock Ledger Entry`), and credit notes.
   - Platform administration console, automated tenant provisioning, and subscription billing.
   - Multi-tenant tenant resolution and isolated database workspaces.

---

## 2. Realistic Workload Profiles

### Profile A: Single Independent Shop (Baseline Production Target)
*Models a typical neighborhood departmental store with 2–3 billing counters operating 14 hours/day (08:00–22:00 IST).*

| Dimension | Specification | Notes & Behavior |
|---|---|---|
| **Retail Counters** | 2–3 Windows POS terminals | Active billing concurrently during open hours |
| **Catalog Size** | 2,500 active SKUs / barcodes | Packaged foods, FMCG, groceries, household items |
| **Daily Sales Volume** | 450–750 transactions / day | Average basket size: 4–7 items |
| **Peak Sales Velocity** | 1 bill every 15–25 seconds | Evening rush hour: 18:00–21:00 IST |
| **Returns & Exchanges** | 5–12 returns / week | Same-day cashier return or manager override |
| **POS Sync Rhythm** | 5-second interval | Flushes 1–3 bills per sync when online |
| **Offline Burst Scenario** | 60–100 bills queued | Occurs during 30–60 min broadband / fiber drop |
| **Store Management** | 1 Owner, 1 Manager | Daily review: morning stock check, night close |
| **Reporting Inquiries** | 10–25 queries / day | Sales summary, low-stock alerts, sync log review |

---

### Profile B: Small Supervised Cohort (1–5 Shops / Controlled Pilot)
*Models the immediate expansion target: 5 independent merchant tenants operating on shared SaaS cluster infrastructure.*

| Dimension | Specification | Notes & Behavior |
|---|---|---|
| **Active Tenants** | 5 distinct merchant stores | `shop-1.domain` ... `shop-5.domain` |
| **Total POS Counters** | 12–15 active billing counters | 2–3 counters per shop syncing concurrently |
| **Total SKUs** | ~15,000 aggregate items | Distinct items across tenant catalogs |
| **Daily Sales Volume** | 2,500–3,500 transactions / day | Total across all 5 stores |
| **Peak Sync Throughput** | 3–6 transactions / second | Coinciding evening shopping peak (19:00–20:30) |
| **Concurrent Offline Flushes** | 2 stores reconnecting simultaneously | ~150–200 pending bills flushed within 60s |
| **Manager Dashboards** | 5–8 active web sessions | Next.js server-rendered dashboard queries |
| **Shared Mobile App** | 10–15 store staff / owners | Quick inventory lookup and owner sales telemetry |
| **Background Jobs** | 2–5 provisioning/maintenance events/wk | Handled by Frappe `long` queue workers |
| **Nightly Reconciliation** | 5 automated batch reconciliations | Scheduled at 22:30 IST |

---

### Profile C: Scaled Commercial SaaS Cohort (50 Shops / Growth Stage)
*Models the 6-month growth target: 50 independent merchant tenants across a regional cluster.*

| Dimension | Specification | Notes & Behavior |
|---|---|---|
| **Active Tenants** | 50 distinct merchant stores | Multi-tenant MariaDB multi-site architecture |
| **Total POS Counters** | 120–150 active Windows terminals | Peak concurrent network connections to ingress |
| **Total SKUs** | 150,000+ SKUs across tenant catalogs | Average 3,000 SKUs per tenant |
| **Daily Sales Volume** | 30,000–45,000 transactions / day | Generating official Sales Invoices and GL entries |
| **Peak Sync Throughput** | 25–40 transactions / second | Weekend and festival shopping rush hours |
| **Regional Outage Surge** | 8–12 counters reconnecting at once | Up to 1,200 bills hitting sync endpoints in 2 mins |
| **Manager Dashboards** | 50–70 active web sessions | Peak traffic at 21:00–22:00 for cash balancing |
| **Shared Mobile App** | 100–150 active mobile sessions | Authenticated via JWT/session tokens |
| **Platform Provisioning** | 3–8 new tenant signups / day | Automated verification, site build, DNS setup |
| **Nightly Backup Horizon** | 50 databases dumped & verified | Off-site S3/B2 encrypted replication |

---

## 3. Critical Scaling Bottlenecks & Invariants

1. **Transactional Invariant (Zero Direct MariaDB Writes):**
   - The central system **MUST NEVER** bypass ERPNext business logic (Sales Invoice DocType lifecycle, GL Entry posting, Stock Ledger Entry) for raw SQL performance. Every sale must remain auditable and legally compliant.
2. **Idempotency Under Concurrent Load:**
   - Multiple counters retrying the exact same transaction UUID under network timeouts must never produce duplicate `Sales Invoice` or GL entries.
3. **Queue Backpressure & Review Safety:**
   - If a counter submits a bill with an item that was deleted or disabled on the server, the server must **NEVER** silently discard the bill or crash; it must safely record the transaction in `tabPOS Sale Sync Log` with status `Requires Review` for store manager review.
4. **Tenant Fairness:**
   - A single store experiencing a massive offline sync burst or generating large export reports must not exhaust the database connection pool or starve another store's live counters.
