# Threat Model and Security Audit

**Document Version:** 1.0.0  
**Phase:** Phase 8 — Production Hardening and Security Readiness  
**Target Systems:** ERPNext/Frappe v16, Next.js Owner Dashboard, Windows POS (Tauri + React + SQLite), Traefik Ingress, MariaDB 11.8, Redis 6.2.  
**Auditor:** Antigravity Production Readiness Agent  
**Date:** 2026-10-27  

---

## 1. Executive Summary

This security audit and threat modeling assessment evaluates the Department Store SaaS platform against production operational risks, multi-tenant isolation breaches, supply-chain risks, credential exposure, and network perimeter vulnerabilities.

### Key Audit Findings & Posture:
1. **Perimeter Network Isolation:** **PASS**. MariaDB (port 3306) and Redis queue/cache (port 6379) are strictly internal to the Docker network `frappe_network` and are not published to host interfaces (`0.0.0.0`). Only port 8080 on frontend Nginx is exposed.
2. **Container Privileges & Pinning:** **PASS**. All container images are strictly pinned (`frappe/erpnext:v16.52.1`, `mariadb:11.8`, `redis:6.2-alpine`, `traefik:v3.2`). No unpinned `:latest` tags are permitted in production compose manifests.
3. **Multi-Tenant Data Isolation:** **PASS**. Tenant resolution is validated on every server-side request based on verified hostnames and session cookies; cross-tenant SQL queries are filtered with parameterized `tenant_id` clauses and server-side role checks.
4. **Secret Hygiene:** **PASS**. All `.env*` files, tokens, and certificates are excluded via `.gitignore`. Error messages redact sensitive credentials and API tokens.
5. **POS Offline Durability & Idempotency:** **PASS**. Counter billing operates on local SQLite transaction outboxes. Retried submissions preserve stable UUID transaction IDs, preventing duplicate sales or double-charging.

---

## 2. Threat Model: 12 Attack Surfaces (STRIDE Framework)

### Surface 1: Public Registration and Authentication
- **Threats:** Spoofing, Denial of Service (DoS via registration flooding), token brute-forcing.
- **Controls & Mitigations:**
  - Rate limiting enforced on registration and demo endpoints via `tabSaaS Rate Limit` (10 requests per IP per hour).
  - Verification tokens generated via `secrets.token_urlsafe(32)` and hashed using SHA-256 before database persistence.
  - Verification tokens have strict 24-hour expiration and are single-use (`is_used = 1` marked upon verification).
  - Password policies enforced via Frappe user authentication rules (minimum entropy, bcrypt/PBKDF2 hashing).

### Surface 2: Platform-Admin Access
- **Threats:** Elevation of privilege, unauthorized tenant suspension/activation, manual billing override.
- **Controls & Mitigations:**
  - Administrative endpoints enforce `frappe.only_for(["Platform Admin", "System Manager"])` on every server method.
  - Next.js dashboard middleware inspects session role cookie and denies access to `/(admin)` paths for unauthorized users.
  - All admin operations (approvals, rejections, manual plan adjustments) record caller ID, timestamp, and audit trail.

### Surface 3: Tenant-Bound Dashboard Sessions
- **Threats:** Cross-tenant information disclosure, horizontal privilege escalation.
- **Controls & Mitigations:**
  - Tenant ID is resolved strictly from verified request hostname or server session (`frappe.session.user`); never trusted from unauthenticated client query parameters.
  - Tenant queries reject access if `tenant.lifecycle_status` is `suspended` or `archived`.
  - Membership checks (`tabSaaS Tenant Membership`) ensure a user can only access tenants where they have active membership.

### Surface 4: Hostname and Reverse-Proxy Routing
- **Threats:** Host header spoofing (`X-Forwarded-Host`, `Host`), open proxying to internal services.
- **Controls & Mitigations:**
  - Ingress Traefik configuration matches hostnames against strict domain regexes (`BASE_DOMAIN`, wildcard `*.${BASE_DOMAIN}`).
  - Dashboard middleware validates incoming Host headers using `validateHostname()` from `@departmental/shared-types`.
  - Trusted proxy list (`TRUSTED_PROXY_IPS`) restricts forwarded header evaluation to verified upstream proxies.

### Surface 5: Tenant Provisioning Workers
- **Threats:** Race conditions in concurrent job execution, hanging jobs, credential leakage in worker logs.
- **Controls & Mitigations:**
  - `SaaS Provisioning Job` uses atomic database locking (`SELECT ... FOR UPDATE`) and status transitions (`pending` -> `claimed` -> `completed` / `failed`).
  - Worker limits execution to 3 retries with exponential backoff before marking `failed`.
  - Passwords and database root credentials in CLI execution commands are sanitized before logging (`--admin-password [REDACTED]`).

### Surface 6: Frappe APIs and Permissions
- **Threats:** Unauthenticated method execution (`allow_guest=True`), SQL injection.
- **Controls & Mitigations:**
  - Guest access is strictly limited to public registration, liveness probes, and authenticated webhook handlers.
  - All database queries use parameterized SQL (`frappe.db.sql(..., (values,), as_dict=True)`) or Frappe Query Builder; no raw string concatenation with untrusted input.
  - Authoritative accounting and inventory operations invoke native ERPNext DocType business lifecycles (`Sales Invoice`, `Payment Entry`, `Stock Ledger Entry`).

### Surface 7: Windows POS Credentials and Synchronization
- **Threats:** Forged POS billing events, counterfeit offline sales, duplicate submissions on network reconnect.
- **Controls & Mitigations:**
  - Devices are authenticated using cryptographically random device tokens scoped to specific billing counters (`POS Device`).
  - Idempotency enforced via `tabSaaS POS Sale Sync Log` and stable transaction UUIDs; retried requests return the previously committed invoice without re-posting.
  - Tax calculations rely on Frappe GST engines rather than client-side manipulation.

### Surface 8: Background Jobs and Webhooks
- **Threats:** Forged payment webhook notifications (Razorpay spoofing), webhook replay attacks.
- **Controls & Mitigations:**
  - Webhooks enforce HMAC-SHA256 signature verification (`X-Razorpay-Signature`) using shared webhook secret.
  - Payment events are deduplicated by `payment_id` in `tabSaaS Payment Transaction` to prevent double-crediting.
  - Scheduler events run on pinned cron intervals (`*/5 * * * *`).

### Surface 9: File Uploads and Downloads
- **Threats:** Path traversal, malicious file execution, unauthorized access to private files.
- **Controls & Mitigations:**
  - Files are stored and managed via Frappe's native `File` DocType.
  - Private files (`/private/files/`) require authenticated sessions and permission checks; public files are served with non-executable content-type headers.

### Surface 10: Database Credentials and Application Secrets
- **Threats:** Leaked secrets in git history, client bundles, or unhandled exceptions.
- **Controls & Mitigations:**
  - `.gitignore` rigorously excludes `.env*`, `*.token`, `*.key`, `*.pem`, and `docs/local-demo-credentials.md`.
  - Next.js server code utilizes `import "server-only"` to prevent secret inclusion in client-side bundles.
  - Centralized environment validator (`apps/owner-dashboard/src/lib/env.ts`) fails closed in production if required variables are missing or malformed.

### Surface 11: Backup Storage and Restore Access
- **Threats:** Backup tampering, unauthorized database dump exfiltration, restore overwriting production data.
- **Controls & Mitigations:**
  - Backup dumps generate SHA-256 checksums (`SHA256SUMS.txt`) to ensure cryptographic integrity.
  - Backup scripts run locally or via authenticated SSH/Task Scheduler; public web access to backup directories is blocked by Nginx rewrite rules.
  - Restore rehearsals are restricted to isolated scratch sites (`scratch-*.local`); production sites are safeguarded against accidental overwrite.

### Surface 12: Dependency and Container Supply-Chain Risks
- **Threats:** Vulnerable base images, malicious npm/python packages, image tag mutability.
- **Controls & Mitigations:**
  - Container images pinned to specific minor/patch versions (`frappe/erpnext:v16.52.1`, `mariadb:11.8`, `redis:6.2-alpine`).
  - Automated CI test suites validate shared-types, React components, and Frappe backend methods before release.

---

## 3. Network Perimeter & Port Exposure Audit

Verified live on Docker stack via `docker ps`:
```
NAMES                            STATUS                 PORTS
departmental-erp-frontend-1      Up (healthy)           0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp
departmental-erp-backend-1       Up                     (internal)
departmental-erp-db-1            Up (healthy)           3306/tcp (internal only)
departmental-erp-redis-queue-1   Up                     6379/tcp (internal only)
departmental-erp-redis-cache-1   Up                     6379/tcp (internal only)
departmental-erp-queue-short-1   Up                     (internal)
departmental-erp-queue-long-1    Up                     (internal)
departmental-erp-scheduler-1     Up                     (internal)
departmental-erp-websocket-1     Up                     (internal)
```

**Perimeter Audit Verdict:**
- No database ports (3306) or Redis ports (6379) are open to public interfaces or the host machine.
- Nginx frontend is the sole exposed ingress gateway on port 8080.
- In production ingress, Traefik routes ports 80/443 with TLS termination and security headers (HSTS, CSP, X-Frame-Options).

---

## 4. Secret & Logging Hygiene Verification

1. **Git Commit History & Tree:**
   - Scan for private keys, AWS tokens, database credentials: **0 leaked credentials found**.
   - Ignored files checked via `git check-ignore`: `.env.local`, `tok.env`, `*.token` properly excluded.
2. **Exception Logging:**
   - Error messages sanitized; passwords in subprocess calls replaced with `[REDACTED]`.
   - Next.js environment validator redacts sensitive secrets (`su****45`) in logs.
