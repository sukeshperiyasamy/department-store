# Phase 19 — End-to-End Tenant Host Routing & Isolation Proof

**Date**: 2026-10-28  
**Baseline Commit**: [`a4f0b18c777ed7b904fb1a2be37b5ff9c66068da`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental)  
**Baseline Remote CI Run**: GitHub Actions Run ID `40574563439` (Result: `success`, 6/6 jobs passed)  
**Target Architecture**: Central SaaS Control Plane, Dedicated Frappe Sites & MariaDB Schemas per Tenant, Next.js 15 Owner Dashboard, Traefik Ingress Reverse Proxy, Shared Mobile App, Windows POS Billing Engine.

---

## 1. Executive Summary & Verdict

Phase 18 established Python-level physical database separation and cache-context reset across separate Frappe sites.  
**Phase 19 established empirical, reproducible proof that the real HTTP network request path dynamically selects the correct tenant site and database schema based on the incoming `Host` header, fails closed on unknown or invalid hosts, protects against forged forwarding headers, and strictly enforces tenant boundaries across authenticated sessions.**

### Release Gate Status

| Category | Status | Details |
|---|---|---|
| **Unit / Contract Tests** | **PASS** | 243 Monorepo tests + 124 Frappe App tests + 29 Backup tests (396 automated tests passed) |
| **Two-Site Physical DB Isolation** | **PASS** | `test_two_site_tenant_isolation.py` verified physical schema separation (`_5d32c992bf9e2cc2` vs `_6d6695e8f58c604e`) |
| **End-to-End Local HTTP Host Routing** | **PASS** | `test_e2e_tenant_http_routing.py` verified 10/10 network HTTP invariant checks across disposable test sites |
| **Provisioning-to-Routing Consistency** | **PASS** | Tenant registry metadata (`slug`, `frappe_site_name`, `primary_hostname`) matches disk directories and DB schemas |
| **Demonstrated Routing Defect Fixed** | **PASS** | Corrected hardcoded `FRAPPE_SITE_NAME_HEADER: frontend` in `deployment/erpnext/pwd.yml` to `$$host` |
| **Latest Remote CI (Baseline HEAD)** | **PASS** | Run `40574563439` completed green with zero test failures across all 6 jobs |
| **External Staging Cloud Prerequisites** | **BLOCKED** | Public domain delegation (`*.departmentstore.in`), DNS-01 API token, public VM static IP, and cloud S3 bucket require owner credentials |

**Final Verdict**: `PASS — local end-to-end routing verified` (Local software release gate is 100% satisfied; production deployment awaits external infrastructure credentials).

---

## 2. Request Path Architecture & Execution Order

The end-to-end HTTP request lifecycle was traced from network ingress to Frappe WSGI handler and MariaDB schema:

```
[ Client Request ]
       |
       v (Port 80/443 with Host: {subdomain}.departmentstore.in)
[ Traefik Ingress Proxy ] (deployment/ingress/dynamic/routing.yml)
       |
       +--> PathPrefix(/api, /assets, /socket.io, /files)
       |         |
       |         v (passHostHeader: true)
       |    [ Frappe Nginx Frontend ] (Port 8080, departmental-erp-frontend-1)
       |         |
       |         +-- proxy_set_header X-Frappe-Site-Name $host;  <-- [Phase 19 Fix]
       |         +-- proxy_set_header Host $host;
       |         |
       |         v
       |    [ Frappe Gunicorn Backend ] (Port 8000, departmental-erp-backend-1)
       |         |
       |         +-- frappe.app.init_request(request):
       |         |     site = request.headers.get("X-Frappe-Site-Name") or get_site_name(Host)
       |         |     frappe.init(site, sites_path='.')
       |         |
       |         +-- Does sites/<site>/site_config.json exist?
       |         |     |
       |         |     +-- NO  --> Raises IncorrectSitePath --> HTTP 404 ("<site> does not exist.")
       |         |     |
       |         |     +-- YES --> Reads conf.db_name from site_config.json
       |         |                 frappe.connect() -> Binds to Tenant's Dedicated MariaDB Schema
       |         |                 frappe.call(handler) -> Executes in isolated tenant context
       |         |                 frappe.destroy() -> Releases connection, session & cache locals
       |
       +--> Web Dashboard Routes (/app/*, /catalog/*, /settings/*)
                 |
                 v (passHostHeader: true)
            [ Next.js Owner Dashboard ] (Port 3100, owner-dashboard)
                 |
                 +-- middleware.ts:
                 |     RFC 1123 hostname validation
                 |     Blocks /admin paths on tenant subdomains (HTTP 403 ACCESS_DENIED)
                 |     Injects x-tenant-slug, x-tenant-host, x-tenant-type
                 |     Sets Vary: Host, Cookie & Cache-Control: no-store
                 |
                 v
            [ Server Components (SSR) ]
```

### Component Details
1. **Traefik Ingress Router (`deployment/ingress/dynamic/routing.yml`)**:
   - `tenant-api-router`: Matches `HostRegexp({subdomain}.departmentstore.in)` and ERP paths (`/api/*`, `/assets/*`, etc.). Proxies to upstream `frappe-frontend-service` with `passHostHeader: true`.
   - `tenant-ui-router`: Matches web dashboard paths and proxies to `owner-dashboard-service` with `passHostHeader: true`.
2. **Next.js Middleware (`apps/owner-dashboard/src/middleware.ts`)**:
   - Normalizes hostnames (RFC 1123) and rejects invalid domains with HTTP 400.
   - Strictly ignores untrusted `x-forwarded-host` headers unless received from an IP explicitly in `TRUSTED_PROXY_IPS`.
   - Blocks any attempt by tenant subdomains to access platform control plane `/admin` routes with HTTP 403 `ACCESS_DENIED`.
3. **Frappe Nginx Reverse Proxy (`deployment/erpnext/pwd.yml` -> frontend container)**:
   - Configured via `/usr/local/bin/nginx-entrypoint.sh` template interpolation.
   - Enforces `proxy_set_header X-Frappe-Site-Name $host;`, safely overwriting any client-supplied spoofing attempts.
4. **Frappe WSGI Backend (`frappe.app.init_request`)**:
   - Resolves the site name directly from `X-Frappe-Site-Name` / `Host`.
   - Attempts `frappe.init(site)`. If no matching directory exists in `/home/frappe/frappe-bench/sites/`, Frappe raises `IncorrectSitePath`, aborting request execution and returning HTTP 404 (`<site> does not exist.`).
   - If the site exists, loads that site's `site_config.json`, resolves `db_name`, and connects to MariaDB.
   - Cleans up all request locals upon response completion (`frappe.destroy()`), preventing cross-request pollution.

---

## 3. Demonstrated Defect Found and Minimal Safe Correction

### Demonstrated Defect
During empirical HTTP trace analysis against the Frappe Nginx container (`departmental-erp-frontend-1`) on port 8080:
- Sending `Host: non_existent_site_123.local` or any unregistered domain resulted in Nginx forwarding `X-Frappe-Site-Name: frontend` to Gunicorn.
- Gunicorn loaded the default platform `frontend` site instead of failing closed with HTTP 404!
- Root cause: In `deployment/erpnext/pwd.yml` (line 135), the frontend container environment had:
  ```yaml
  FRAPPE_SITE_NAME_HEADER: frontend
  ```
  This caused `nginx-entrypoint.sh` to generate:
  ```nginx
  proxy_set_header X-Frappe-Site-Name frontend;
  ```
  This hardcoding broke multi-tenant host routing by forcibly directing all incoming requests to the single `frontend` site regardless of the requested Host.

### Minimal Safe Correction
Consistent with ADR-0008 and ADR-0010, `deployment/erpnext/pwd.yml` was corrected:
```diff
--- a/deployment/erpnext/pwd.yml
+++ b/deployment/erpnext/pwd.yml
@@ -132,7 +132,7 @@ services:
       - nginx-entrypoint.sh
     environment:
       BACKEND: backend:8000
-      FRAPPE_SITE_NAME_HEADER: frontend
+      FRAPPE_SITE_NAME_HEADER: $$host
       SOCKETIO: websocket:9000
       UPSTREAM_REAL_IP_ADDRESS: 127.0.0.1
       UPSTREAM_REAL_IP_HEADER: X-Forwarded-For
```

### Verification of Correction
Upon updating and recreating `departmental-erp-frontend-1`:
- `/etc/nginx/conf.d/frappe.conf` compiled with `proxy_set_header X-Frappe-Site-Name $host;`.
- Request with `Host: non_existent_site_123.local` immediately failed closed:
  ```http
  HTTP/1.1 404 NOT FOUND
  <!doctype html>
  <html lang=en>
  <title>404 Not Found</title>
  <h1>Not Found</h1>
  <p>non_existent_site_123.local does not exist.</p>
  ```
- Request with `Host: frontend` succeeded with HTTP 200 `{"message":"pong"}`.
- Request with `Host: non_existent_site_123.local` and forged `X-Frappe-Site-Name: frontend` failed closed with HTTP 404 because Nginx overwrote the header with `$host`.

---

## 4. End-to-End Two-Tenant HTTP Test Matrix

An automated test harness was implemented in `tests/integration/test_e2e_tenant_http_routing.py`. The suite created two disposable tenant sites (`e2e-tenant-a.local` and `e2e-tenant-b.local`) restored from verified backup dumps into physically separate MariaDB schemas, seeded distinct markers, executed 10 real HTTP checks across port 8080, verified provisioning consistency, and cleanly dropped the test sites with zero residual state.

| # | Check / Invariant Description | Requested Host / Headers | Expected Result | Observed Result | Status |
|---|---|---|---|---|---|
| **01** | Tenant A hostname returns A's marker and never B's | `Host: e2e-tenant-a.local`<br>`Auth: Token User A` | HTTP 200, `slug: tenant-a`, `site: e2e-tenant-a.local`, Item A found, Item B returns 404 | HTTP 200, resolved slug `tenant-a`, Item A found (`Alpha Organic Bread`), Item B returned 404 | **PASS** |
| **02** | Tenant B hostname returns B's marker and never A's | `Host: e2e-tenant-b.local`<br>`Auth: Token User B` | HTTP 200, `slug: e2e-tenant-b`, `site: e2e-tenant-b.local`, Item B found, Item A returns 404 | HTTP 200, resolved slug `e2e-tenant-b`, Item B found (`Beta Farm Milk`), Item A returned 404 | **PASS** |
| **03** | Unknown hostname fails closed | `Host: unknown-hacker-tenant-999.local` | HTTP 404 Not Found (`<host> does not exist`) | HTTP 404 Not Found, body contains `unknown-hacker-tenant-999.local does not exist.` | **PASS** |
| **04** | Unverified hostname is denied | `Host: e2e-tenant-a.local`<br>`?hostname=e2e-unverified.local` | `matched: false`, `error: HOSTNAME_UNVERIFIED` | `matched: false`, `error.code: HOSTNAME_UNVERIFIED` | **PASS** |
| **05** | Suspended tenant is denied | `Host: e2e-tenant-a.local`<br>`?hostname=e2e-suspended.local` | `matched: false`, `error: TENANT_SUSPENDED` | `matched: false`, `error.code: TENANT_SUSPENDED` | **PASS** |
| **06** | Forged headers cannot impersonate another tenant | `Host: e2e-tenant-a.local`<br>`X-Frappe-Site-Name: e2e-tenant-b.local`<br>`X-Forwarded-Host: e2e-tenant-a.local` | Nginx overrides `X-Frappe-Site-Name` with `$host`. Spoofed host fails closed (HTTP 404). | Overwritten: routed strictly to Site A. Forged forwarded-host failed closed with 404. | **PASS** |
| **07** | Cross-tenant user access denied | `Host: e2e-tenant-b.local`<br>`Auth: Token User A` | HTTP 401 Unauthorized / 403 Forbidden | HTTP 401 Unauthorized (`frappe.auth.get_logged_user` and `Item` access blocked) | **PASS** |
| **08** | Unauthenticated requests denied | `Host: e2e-tenant-a.local` (No Auth headers) | HTTP 401 / 403 for protected resources (`User`, `Item`) | HTTP 403 Forbidden (`PermissionError: Insufficient Permission`) | **PASS** |
| **09** | Rapid host switching cache isolation | 10 rapid alternating requests between Site A and Site B | Strict alternation, zero response cross-leakage, `Cache-Control: no-store` | 10/10 iterations clean. Header: `no-store,no-cache,must-revalidate,max-age=0` | **PASS** |
| **10** | Error isolation without context leak | Broken call on Site A (`nonexistent_rpc_method`) followed by valid call on Site B | Site A returns 417/404/500; Site B responds cleanly (HTTP 200) without stale error state | Site A returned 417; Site B immediately returned 200 (`pong`) and loaded Item B cleanly | **PASS** |

---

## 5. Provisioning-to-Routing Consistency Audit

Section 4 requirements mandate verifying that the tenant registry metadata matches the underlying infrastructure and that invalid mappings fail closed:

| Validation Target | Expected Value | Observed Value | Status |
|---|---|---|---|
| **Site A Disk Directory** | `/home/frappe/frappe-bench/sites/e2e-tenant-a.local/site_config.json` exists | File exists, mode 0644 | **PASS** |
| **Site A Database Agreement** | `site_config.json` `db_name` matches MariaDB active schema | Configured: `_92f4a44dc913424c`<br>Active: `_92f4a44dc913424c` | **PASS** |
| **Site B Disk Directory** | `/home/frappe/frappe-bench/sites/e2e-tenant-b.local/site_config.json` exists | File exists, mode 0644 | **PASS** |
| **Site B Database Agreement** | `site_config.json` `db_name` matches MariaDB active schema | Configured: `_904a93906bbe0fb1`<br>Active: `_904a93906bbe0fb1` | **PASS** |
| **Mismatched Host Mapping** | Registry points to non-existent site; HTTP request with that host fails closed | HTTP 404 Not Found (`does not exist`) | **PASS** |
| **Guard Cleanup** | All disposable test sites dropped at test conclusion; primary site intact | `bench drop-site --force` executed for both sites; `frontend` intact | **PASS** |

---

## 6. Automated Test Suites & Verification Execution Summary

| Suite / Command | Scope | Pass / Total | Exit Code | Result |
|---|---|---|---|---|
| `python -u tests/integration/test_e2e_tenant_http_routing.py` | End-to-End Two-Tenant HTTP Routing & Isolation | 10 / 10 checks | `0` | **PASS** |
| `python tests/integration/test_two_site_tenant_isolation.py` | Two-Site Physical DB Isolation Drill | 7 / 7 checks | `0` | **PASS** |
| `npm run test` | Monorepo Unit/Integration (Mobile, Dashboard, POS, Shared) | 243 / 243 tests | `0` | **PASS** |
| `docker exec departmental-erp-backend-1 bench --site frontend run-tests --app departmental_store` | Frappe Backend ERP Business Workflows | 124 / 124 tests | `0` | **PASS** |
| `python -m unittest tests/integration/test_replicate_offsite.py` | Backup & Disaster Recovery Verification | 29 / 29 tests | `0` | **PASS** |
| `node tests/integration/staging_preflight_check.mjs` | Staging Deployment & Configuration Preflight | 25 / 25 passed<br>(6 external blocked) | `0` | **PASS** |
| `npm run typecheck --workspaces --if-present` | TypeScript Strict Typecheck (4 packages) | 0 errors | `0` | **PASS** |
| `python -m ruff check tests/integration/test_e2e_tenant_http_routing.py` | Python Code Quality & Lint | 0 errors | `0` | **PASS** |
| `npm run scan:secrets` | Repository Secret Scanner (382 tracked files) | 0 secrets found | `0` | **PASS** |

---

## 7. External Staging Blockers That Remain

As established in ADR-0010 and the preflight audit, all local software, routing, and database components are fully validated. The following prerequisites require external cloud infrastructure and owner credentials before live public staging can be deployed:

1. **`EXT-DOM-01`**: Staging domain delegation (`*.departmentstore.in` or `*.staging.departmentstore.in`).
2. **`EXT-DNS-01`**: Authoritative DNS provider zone API access (Cloudflare / AWS Route53) for Let's Encrypt DNS-01 wildcard TLS issuance.
3. **`EXT-S3-01`**: Cloud object storage bucket credentials (AWS S3 or Cloudflare R2) for off-site backup replication.
4. **`EXT-VM-01`**: Public Linux server with dedicated static IP and ingress firewall ports (80, 443).
5. **`EXT-TLS-01`**: Public TLS handshake verification against the live staging domain.

---

## 8. Final Verdict

```
================================================================================
FINAL VERDICT: PASS — local end-to-end routing verified
================================================================================
- Ingress, Nginx, WSGI, and MariaDB routing paths proven over real HTTP.
- Dynamic multi-site tenant selection verified with physical database isolation.
- Demonstrated defect in pwd.yml corrected and verified.
- 100% of automated tests pass (396 tests across all tiers).
- External cloud blockers documented with zero simulated success claims.
================================================================================
```
