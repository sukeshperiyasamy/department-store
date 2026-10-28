# Local Service URLs, Ports & Operational Status

**Product:** Department Store ERP / Multi-Tenant SaaS Platform  
**Repository Path:** `c:\Users\COMPUTER\Downloads\sukesh\departmental`  
**Git Commit SHA:** `653d8135a1efc20c212175cbe3f3ebca7ea02648` (`main`)  
**Execution Date:** October 28, 2026  
**Status:** **ALL SERVICES RUNNING & VERIFIED**

---

## 1. Complete Service Inventory

| Service | Technology / Framework | Start Command | Docker Compose Service | Local URL / Port | Dependencies | Health Check / Readiness | Status |
|---|---|---|---|---|---|---|---|
| **Marketing Website** | Next.js 14.2 / TypeScript | `npm run dev:dashboard` | N/A (Host Node.js) | [http://localhost:3100/](http://localhost:3100/) | None | HTTP GET `/` (Status 200) | **RUNNING** |
| **Pricing & Plans** | Next.js 14.2 / TypeScript | `npm run dev:dashboard` | N/A (Host Node.js) | [http://localhost:3100/pricing](http://localhost:3100/pricing) | None | HTTP GET `/pricing` (Status 200) | **RUNNING** |
| **Owner Dashboard** | Next.js 14.2 / React 18 | `npm run dev:dashboard` | N/A (Host Node.js) | [http://localhost:3100/login](http://localhost:3100/login) | ERPNext API (Port 8080) | HTTP GET `/api/health` | **RUNNING** |
| **Self-Service Registration**| Next.js 14.2 / React 18 | `npm run dev:dashboard` | N/A (Host Node.js) | [http://localhost:3100/register](http://localhost:3100/register) | ERPNext API (Port 8080) | HTTP GET `/register` (Status 200) | **RUNNING** |
| **Lead Demo Request** | Next.js 14.2 / React 18 | `npm run dev:dashboard` | N/A (Host Node.js) | [http://localhost:3100/request-demo](http://localhost:3100/request-demo) | ERPNext API (Port 8080) | HTTP GET `/request-demo` (Status 200) | **RUNNING** |
| **Windows POS Web Interface**| Vite 5 / React 18 / TS | `npm run dev:pos` | N/A (Host Node.js) | [http://localhost:1420/](http://localhost:1420/) | Local SQLite + Backend | Root index.html HTTP 200 | **RUNNING** |
| **ERPNext Web Desk & API** | Frappe / ERPNext v15 / Nginx | `docker compose up -d` | `departmental-erp-frontend-1` | [http://localhost:8080/app](http://localhost:8080/app) | Gunicorn, MariaDB, Redis | HTTP GET `/api/method/frappe.ping` | **RUNNING** |
| **Frappe Backend Gunicorn** | Python 3.11 / Frappe Bench | `docker compose up -d` | `departmental-erp-backend-1` | Internal `backend:8000` | MariaDB, Redis | Docker container health | **RUNNING** |
| **MariaDB Relational Database**| MariaDB 10.6 | `docker compose up -d` | `departmental-erp-db-1` | Internal `db:3306` | Docker storage volume | `mysqladmin ping -h localhost` | **RUNNING** |
| **Redis Cache Manager** | Redis 6.2 Alpine | `docker compose up -d` | `departmental-erp-redis-cache-1` | Internal `redis-cache:6379` | Docker memory limits | `redis-cli ping` | **RUNNING** |
| **Redis Queue Broker** | Redis 6.2 Alpine | `docker compose up -d` | `departmental-erp-redis-queue-1` | Internal `redis-queue:6379` | Docker memory limits | `redis-cli ping` | **RUNNING** |
| **Background Queue (Short)** | Python RQ Worker | `docker compose up -d` | `departmental-erp-queue-short-1`| Internal Worker | Redis Queue | Process supervisor | **RUNNING** |
| **Background Queue (Long)** | Python RQ Worker | `docker compose up -d` | `departmental-erp-queue-long-1` | Internal Worker | Redis Queue | Process supervisor | **RUNNING** |
| **Cron Job Scheduler** | Python Frappe Scheduler | `docker compose up -d` | `departmental-erp-scheduler-1` | Internal Daemon | Redis Queue, MariaDB | Process supervisor | **RUNNING** |
| **Realtime WebSockets** | Node.js Frappe SocketIO | `docker compose up -d` | `departmental-erp-websocket-1` | Internal `websocket:9000`| Redis Queue | Socket handshake | **RUNNING** |

---

## 2. Local Endpoint & Health Check Quick Reference

### Central Health Check
```powershell
# Frappe Backend Ping
curl.exe -s http://localhost:8080/api/method/frappe.ping -H "Host: frontend"
# Output: {"message":"pong"}

# Owner Dashboard Health Check
curl.exe -s http://localhost:3100/api/health
# Output: {"status":"healthy","timestamp":"2026-10-28T...","uptime":...}
```

### Routing & Host Headers
- The ERPNext backend evaluates requests by the HTTP `Host` header. For the primary local test site, requests use `Host: frontend` or `localhost`.
- The Next.js dashboard communicates with the backend via its internal loopback proxy or server actions.

---

## 3. Account Access Note
For security reasons, actual passwords and API secrets are stored strictly in the gitignored file:
`LOCAL_TEST_LOGIN_HANDOFF.md`
