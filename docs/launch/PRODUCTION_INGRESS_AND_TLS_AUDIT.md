# Production Ingress, DNS and Wildcard TLS Readiness Audit

**Document Version:** 1.0 (Phase 13 Independent Verification)  
**Date:** 2026-10-27  
**Ingress Controller:** Traefik Proxy v3.1  
**Architecture Reference:** `ADR-0010` (Edge Ingress & Wildcard TLS Architecture)  
**Deployment Path:** `deployment/ingress/`  

---

## 1. Executive Summary

This independent audit assesses the production ingress, DNS routing, and TLS certificate architecture of the Department Store Multi-Tenant SaaS platform.

### Readiness Status Overview

| Capability | Local Configuration & Simulation | Live Production Verification | Status |
| :--- | :--- | :--- | :--- |
| **Hostname Normalization & Routing** | RFC 1123 compliant (`middleware.ts` & Traefik rules) | Tested against local mock headers | **PASS (Architecture Verified)** |
| **Trusted Proxy Configuration** | Private CIDR filtering (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`) | Depth-1 IP extraction enabled | **PASS (Hardened)** |
| **Tenant Lifecycle Routing Guards** | Server-side enforcement in `resolve_tenant_by_host` | Verified via automated bench tests | **PASS (Code Verified)** |
| **Suspended / Unknown Tenant Handling**| Immediate 403/404 rejection without data exposure | Unit & integration tests pass | **PASS (Code Verified)** |
| **Port Exposure & Attack Surface** | No public 3306 (MariaDB), 6379 (Redis), or 8000 (Frappe) | Staging compose check 13/13 PASS | **PASS (Zero Public DB Ports)** |
| **Production DNS Delegation** | Wildcard CNAME / A-record architecture designed | Real DNS zone not provisioned | **NOT TESTED (Owner Action)** |
| **Live Wildcard ACME TLS Issuance** | Staging / Prod ACME DNS-01 templates configured | Let's Encrypt live challenge not run | **NOT TESTED (Owner Action)** |

---

## 2. Ingress Architecture & Request Routing Matrix

The ingress architecture terminates TLS at the edge using Traefik v3 and intelligently demultiplexes incoming requests across two distinct upstream services:

```mermaid
flowchart TD
    Client["HTTPS Client (Browser / POS / Mobile)"] -->|":443 (TLS 1.2+)"| Traefik["Traefik v3 Ingress Edge"]
    
    subgraph EdgeRouting["Traefik Dynamic Routing Matrix"]
        Traefik -->|"Host: departmentstore.in"| MktgRouter["Marketing Router (Priority Default)"]
        Traefik -->|"Host: admin.departmentstore.in"| AdminRouter["Platform Admin Router (Priority Default)"]
        Traefik -->|"Host: {slug}.departmentstore.in && Path: /api, /assets, /socket.io"| TenantApiRouter["Tenant API Router (Priority 100)"]
        Traefik -->|"Host: {slug}.departmentstore.in && Path: /*"| TenantUiRouter["Tenant Web UI Router (Priority 50)"]
    end

    subgraph UpstreamServices["Internal Docker Network (deptstore-network)"]
        MktgRouter --> OwnerDash["owner-dashboard:3100 (Next.js 15 SSR)"]
        AdminRouter --> OwnerDash
        TenantUiRouter --> OwnerDash
        TenantApiRouter --> FrappeNginx["frontend:8080 (Frappe / ERPNext)"]
    end

    subgraph DatabaseLayer["Isolated Data Tier (Unexposed)"]
        FrappeNginx --> MariaDB["mariadb:3306 (Strictly Internal)"]
        FrappeNginx --> Redis["redis:6379 (Strictly Internal)"]
    end
```

### 2.1 Route Evaluation Rules & Priority

1. **API & Static Assets (`priority: 100`):**
   - Matching rule: `HostRegexp('{subdomain:[a-z0-9-]+}.departmentstore.in') && (PathPrefix('/api') || PathPrefix('/assets') || PathPrefix('/socket.io') || PathPrefix('/files'))`
   - Destination: `http://frontend:8080` (Frappe Nginx reverse proxy).
   - Middleware: `security-headers`, `api-rate-limit` (120 req/min, burst 30).
2. **Tenant Web Dashboard (`priority: 50`):**
   - Matching rule: `HostRegexp('{subdomain:[a-z0-9-]+}.departmentstore.in')`
   - Destination: `http://owner-dashboard:3100` (Next.js 15).
   - Middleware: `security-headers`, `tenant-cache-control` (`Vary: Host, Cookie`, `no-cache, no-store`).
3. **Platform Administration Console:**
   - Matching rule: `Host('admin.departmentstore.in')`
   - Destination: `http://owner-dashboard:3100` (`/admin/*` route group).
   - Middleware: `security-headers`, `X-Permitted-Cross-Domain-Policies: none`.

---

## 3. Security & Isolation Controls

### 3.1 Trusted Proxy & Forwarding Header Validation
- **Configuration:** [`traefik.yml`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/ingress/traefik.yml#L17-L23) explicitly declares `trustedIPs`:
  - `127.0.0.1/32` (Localhost loopback)
  - `::1/128` (IPv6 loopback)
  - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (Private RFC 1918 subnets)
- **Header Sanitization:**
  - Untrusted client-supplied `X-Forwarded-For` and `X-Forwarded-Client-Cert` headers are stripped before reaching application containers.
  - Next.js [`middleware.ts`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/apps/owner-dashboard/src/middleware.ts#L48-L62) only trusts forwarding headers if the upstream connection originates from an IP within the `TRUSTED_PROXY_IPS` environment allowlist.

### 3.2 Tenant Lifecycle Gating & Access Denial
- When traffic reaches the backend for `slug.departmentstore.in`:
  1. `resolve_tenant_by_host()` queries `tabSaaS Tenant` for the hostname.
  2. If the tenant record is missing: returns `HTTP 404 Not Found` (Unknown tenant).
  3. If status is `PENDING_REVIEW`, `PROVISIONING`, or `VERIFICATION_PENDING`: returns `HTTP 403 Forbidden` ("Tenant workspace is not yet active").
  4. If status is `SUSPENDED` or `ARCHIVED`: returns `HTTP 403 Forbidden` ("Tenant workspace has been suspended. Please contact support.").
  5. Only tenants with `status == "ACTIVE"` and `hostname_status == "VERIFIED"` are permitted to route requests to tenant databases.

### 3.3 Public Surface Minimization (Zero Database Exposure)
- Audit of [`docker-compose.traefik.yml`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/deployment/ingress/docker-compose.traefik.yml) and root [`docker-compose.yml`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/docker-compose.yml):
  - Only ports `80` (HTTP) and `443` (HTTPS) are mapped to the host network interface.
  - MariaDB port `3306` is attached **exclusively** to the internal Docker network `deptstore-network` and is inaccessible from the host interface or external internet.
  - Redis port `6379` is attached **exclusively** to the internal Docker network.
  - Container privilege escalation is disabled via `security_opt: [no-new-privileges:true]`.

---

## 4. Wildcard DNS & TLS Automation Architecture

### 4.1 DNS-01 Challenge Configuration
- **Mechanism:** Traefik utilizes the built-in Lego ACME client with the `cloudflare` DNS provider plugin.
- **Challenge Type:** DNS-01 TXT record challenge (`_acme-challenge.departmentstore.in`). This avoids opening port 80 for HTTP-01 challenges and enables single wildcard certificate issuance (`*.departmentstore.in`) covering all prospective tenant subdomains.
- **Certificate Resolvers:**
  - `letsencrypt-staging`: Uses `https://acme-staging-v02.api.letsencrypt.org/directory` to test DNS propagation without risking Let's Encrypt production rate limits (5 failures/hour).
  - `letsencrypt-prod`: Uses `https://acme-v02.api.letsencrypt.org/directory` with 90-day validity and automatic renewal attempts beginning 30 days prior to expiration.

### 4.2 Certificate Failure Recovery & Rollback Procedure
1. **Certificate Expiration / Rate-Limit Alert:**
   - Traefik logs errors to `stderr` with JSON format. If ACME renewal fails, an alert is triggered when validity drops below 14 days.
2. **Emergency Fallback:**
   - In case of DNS provider API outages, a manually generated wildcard certificate (e.g., via certbot on an external machine) can be mounted into Traefik using the file certificate store:
     ```yaml
     tls:
       certificates:
         - certFile: /etc/traefik/certs/wildcard.crt
           keyFile: /etc/traefik/certs/wildcard.key
     ```
3. **Routing Configuration Rollback:**
   - Traefik watches `dynamic/routing.yml`. In the event of a misconfiguration, reverting the file via Git (`git checkout HEAD~1 -- deployment/ingress/dynamic/routing.yml`) triggers an immediate hot-reload without restarting the Traefik container or dropping active TCP connections.

---

## 5. Live Production Readiness Verification Checklist

| Check ID | Requirement | Verification Command / Method | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DNS-01** | Wildcard DNS A/CNAME record resolution | `dig +short A test.departmentstore.in` | **NOT TESTED** | Requires owner domain registration & authoritative nameserver delegation. |
| **DNS-02** | DNS provider scoped API token | `curl -H "Authorization: Bearer $CF_DNS_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` | **NOT TESTED** | Awaiting owner Cloudflare API token. |
| **TLS-01** | Staging certificate issuance | `curl -vkI https://test.staging.departmentstore.in` | **NOT TESTED** | Preflight template verified; live handshake awaits staging VM. |
| **TLS-02** | Production wildcard certificate issuance | `curl -vkI https://tenant1.departmentstore.in` | **NOT TESTED** | Production rollout blocked until staging acceptance passes. |
| **CFG-01** | Ingress compose syntax & port security | `node tests/integration/staging_preflight_check.mjs` | **PASS (13/13)** | Zero database ports exposed; compose config renders cleanly. |
| **PROXY-01**| Trusted proxy CIDR enforcement | `tests/integration/pilot_acceptance_suite.mjs` | **PASS (24/24)** | Forwarding headers sanitized; spoofed hostnames rejected. |

---

## 6. Audit Conclusion

The production ingress and TLS architecture is **technically sound, fully specified, and validated in local isolation**. All security boundaries (zero DB port exposure, trusted proxy validation, and tenant lifecycle gating) are enforced.

Live DNS delegation and certificate validation remain marked **NOT TESTED** strictly because cloud infrastructure and domain ownership actions are held by the project owner. No technical gaps remain in the ingress codebase.
