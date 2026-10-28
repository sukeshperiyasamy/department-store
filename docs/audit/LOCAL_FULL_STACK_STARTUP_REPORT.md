# Local Full Stack Startup & Deployment Audit Report

**Product:** Department Store ERP / Multi-Tenant SaaS Platform  
**Repository Path:** `c:\Users\COMPUTER\Downloads\sukesh\departmental`  
**Git Commit SHA:** `653d8135a1efc20c212175cbe3f3ebca7ea02648` (`main`)  
**Docker Compose Configuration:** [`deployment/erpnext/pwd.yml`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/erpnext/pwd.yml)  
**Execution Date:** October 28, 2026  
**Status:** **OPERATIONAL & RUNNING (100% HEALTHY)**

---

## 1. Executive Summary

This report documents the local startup, container orchestration, application service initialization, and operational verification of the complete Department Store ERP & Multi-Tenant SaaS platform.

All components—including the 9-container ERPNext/Frappe micro-service stack, the Next.js multi-tenant dashboard and public marketing engine, and the Vite/Tauri Windows POS cashier shell—have been successfully launched, verified for inter-service connectivity, and validated against local endpoints.

```
========================================================================================================
TIER                            SERVICE / COMPONENT             PORT / BINDING          OPERATIONAL STATE
========================================================================================================
Authoritative ERP Backend       departmental-erp-frontend-1     localhost:8080          RUNNING (Healthy)
Database Engine                 departmental-erp-db-1           localhost:3306 (int)    RUNNING (Healthy)
Cache & Lock Manager            departmental-erp-redis-cache-1  localhost:6379 (int)    RUNNING (Healthy)
Queue Broker                    departmental-erp-redis-queue-1  localhost:6379 (int)    RUNNING (Healthy)
Asynchronous Queue (Short)      departmental-erp-queue-short-1  Internal Worker         RUNNING (Healthy)
Asynchronous Queue (Long)       departmental-erp-queue-long-1   Internal Worker         RUNNING (Healthy)
Job Scheduler                   departmental-erp-scheduler-1    Internal Cron           RUNNING (Healthy)
Realtime WebSockets             departmental-erp-websocket-1    Internal Socket         RUNNING (Healthy)
Frappe Gunicorn Backend         departmental-erp-backend-1      localhost:8000 (int)    RUNNING (Healthy)
Next.js Owner Dashboard & Web   apps/dashboard (Next.js 14)     localhost:3100          RUNNING (HTTP 200)
Windows POS Web Interface       apps/pos (Vite / React TS)      localhost:1420          RUNNING (HTTP 200)
========================================================================================================
OVERALL STACK STATUS: 11 / 11 SERVICES RUNNING & HEALTHY
========================================================================================================
```

---

## 2. Docker Compose Infrastructure (`pwd.yml`)

The ERPNext authoritative backend stack runs using Docker Compose under the project namespace `departmental-erp`:

- **Compose Specification:** `deployment/erpnext/pwd.yml`
- **Configuration Validation:** Validated via `docker compose -f deployment/erpnext/pwd.yml config --quiet` (Exit Code: `0`).
- **Container Network:** `departmental-erp_default` (Docker bridge network).
- **Persistent Data Volume:** `departmental-erp_db_data` (Stores MariaDB relational tables and ERPNext sites).
- **Persistent Site Assets:** `departmental-erp_sites` (Stores Frappe bench sites and public assets).

### Container Inventory & Inspection

| Container Name | Service Name | Image / Tag | Bound Host Port | Internal Port | Health Status |
|---|---|---|---|---|---|
| `departmental-erp-frontend-1` | `frontend` | `frappe/erpnext:v15.82.0` | `0.0.0.0:8080` | `8080/tcp` | `healthy` |
| `departmental-erp-backend-1` | `backend` | `frappe/erpnext:v15.82.0` | None (Internal) | `8000/tcp` | `healthy` |
| `departmental-erp-db-1` | `db` | `mariadb:10.6` | None (Internal) | `3306/tcp` | `healthy` |
| `departmental-erp-redis-cache-1` | `redis-cache` | `redis:6.2-alpine` | None (Internal) | `6379/tcp` | `healthy` |
| `departmental-erp-redis-queue-1` | `redis-queue` | `redis:6.2-alpine` | None (Internal) | `6379/tcp` | `healthy` |
| `departmental-erp-queue-short-1` | `queue-short` | `frappe/erpnext:v15.82.0` | None (Internal) | Background | `healthy` |
| `departmental-erp-queue-long-1` | `queue-long` | `frappe/erpnext:v15.82.0` | None (Internal) | Background | `healthy` |
| `departmental-erp-scheduler-1` | `scheduler` | `frappe/erpnext:v15.82.0` | None (Internal) | Background | `healthy` |
| `departmental-erp-websocket-1` | `websocket` | `frappe/erpnext:v15.82.0` | None (Internal) | `9000/tcp` | `healthy` |

### Security Boundary Verification
- Neither MariaDB (`3306`) nor Redis (`6379`) is exposed to the public internet or external host network interfaces. They communicate exclusively within `departmental-erp_default`.
- Nginx reverse proxy binds to host port `8080` and proxies traffic to the Frappe Gunicorn cluster and socket servers.

---

## 3. Frontend Applications

### A. Next.js Owner Dashboard & Marketing Portal
- **Workspace:** `apps/dashboard`
- **Framework:** Next.js 14.2 (App Router, React 18, TypeScript Strict)
- **Start Command:** `npm run dev:dashboard` (`next dev -p 3100`)
- **Bound Port:** `http://localhost:3100/`
- **Health Endpoint:** `http://localhost:3100/api/health` -> `{"status":"healthy","timestamp":"...","uptime":...}`
- **Validated Routes:**
  - `http://localhost:3100/` (Marketing Homepage) - HTTP 200
  - `http://localhost:3100/pricing` (Public Pricing & Tier Plans) - HTTP 200
  - `http://localhost:3100/login` (Store Manager & Admin Authentication) - HTTP 200
  - `http://localhost:3100/register` (Self-Service Tenant Registration) - HTTP 200
  - `http://localhost:3100/request-demo` (Lead Capture Form) - HTTP 200

### B. Windows POS Desktop / Web Shell
- **Workspace:** `apps/pos`
- **Framework:** Vite 5, React 18, TypeScript Strict Mode, SQLite Outbox
- **Start Command:** `npm run dev:pos` (`vite --host 0.0.0.0 --port 1420`)
- **Bound Port:** `http://localhost:1420/`
- **Validated Title:** `<title>Department Store POS</title>`
- **Rendering Verification:** Loads React root `#root`, POS counter toolbar, barcode search, category filter ribbons, and shift opening/closing controls (`F3`).

---

## 4. Local Database & Tenant Initialization

The authoritative site `frontend` is active in Frappe Bench:
- **Site Name:** `frontend`
- **Database Schema:** `_5d32c992bf9e2cc2`
- **Custom Application:** `departmental_store` installed and synced.
- **Authoritative Business Company:** `Demo Departmental Store` (Abbreviation: `DEMO`).
- **Default POS Profile:** `Counter 1` linked to warehouse `Goods In Transit - DEMO` / `Stores - DEMO`.
- **Payment Modes:** `Cash`, `Card`, `UPI`.

---

## 5. Startup, Shutdown & Restart Runbook

### A. How to Start the Stack
```powershell
# 1. Start Docker ERPNext containers
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml up -d

# 2. Start Next.js Owner Dashboard on Port 3100
npm run dev:dashboard

# 3. Start Windows POS Interface on Port 1420
npm run dev:pos
```

### B. How to Stop the Stack Safely (Preserving All Data)
```powershell
# 1. Stop Docker containers without removing volumes
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml stop

# 2. Stop Node processes
Get-Process node | Stop-Process -Force
```

> [!CAUTION]
> Never run `docker compose down -v` or `docker system prune --volumes`. The persistent MariaDB volume contains the authoritative ledger and tenant configuration.
