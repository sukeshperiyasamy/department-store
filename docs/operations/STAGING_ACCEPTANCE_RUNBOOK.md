# Staging Acceptance Procedure Runbook (Phase 4B)

This runbook provides an operational, step-by-step verification checklist for validating production ingress, wildcard TLS, and tenant routing on a staging environment (`staging.departmentstore.in` or owner-controlled domain) before promoting to commercial production.

---

## Pre-Flight Checklist

- [ ] Staging domain registered and DNS managed (e.g. Cloudflare, AWS Route53).
- [ ] Authoritative DNS A/CNAME records configured:
  - `@.staging.departmentstore.in` -> Staging Host IPv4
  - `admin.staging.departmentstore.in` -> CNAME to apex
  - `*.staging.departmentstore.in` -> CNAME to apex
- [ ] Staging server provisioned with Docker and Docker Compose.
- [ ] DNS Provider credentials prepared (e.g. `CF_DNS_API_TOKEN` scoped to Zone DNS:Edit).
- [ ] ACME Resolver configured to **`letsencrypt-staging`** in `deployment/ingress/.env`.

---

## Step-by-Step Staging Verification Protocol

### Test 1: DNS Resolution Verification
Run from an external workstation to verify DNS propagation:
```bash
# Verify apex domain resolution
dig +short A staging.departmentstore.in
# Verify admin subdomain resolution
dig +short CNAME admin.staging.departmentstore.in
# Verify wildcard tenant resolution
dig +short CNAME shop-a.staging.departmentstore.in
dig +short CNAME shop-b.staging.departmentstore.in
```
**Expected Result**: All hostnames resolve to the staging server's public IP address.

---

### Test 2: HTTP to HTTPS Redirection
Test that plain HTTP requests on port 80 are permanently redirected (301/308) to HTTPS (port 443):
```bash
curl -I http://staging.departmentstore.in/
curl -I http://shop-a.staging.departmentstore.in/app
```
**Expected Result**:
- Status code `301 Moved Permanently` or `308 Permanent Redirect`.
- `Location: https://staging.departmentstore.in/` / `Location: https://shop-a.staging.departmentstore.in/app`.
- No plain HTTP traffic accepted without TLS upgrade.

---

### Test 3: Staging TLS Certificate Validation (ACME DNS-01)
Verify that Traefik successfully obtained and served a certificate from Let's Encrypt Staging:
```bash
openssl s_client -connect staging.departmentstore.in:443 -servername staging.departmentstore.in </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject -dates
openssl s_client -connect shop-a.staging.departmentstore.in:443 -servername shop-a.staging.departmentstore.in </dev/null 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```
**Expected Result**:
- Issuer matches `(STAGING) Artificial / Let's Encrypt`.
- Subject Alternative Name (SAN) contains both `staging.departmentstore.in` and `*.staging.departmentstore.in`.
- TLS handshake completes with TLS 1.2 or TLS 1.3 using approved AES/ChaCha cipher suites.

---

### Test 4: Certificate Renewal & Traefik Health Check
Query Traefik internal healthcheck and metrics endpoints (loopback only):
```bash
# Query health status
curl -fsS http://127.0.0.1:8080/ping
# Query Prometheus certificate metrics
curl -fsS http://127.0.0.1:8080/metrics | grep traefik_tls_certs_not_after_timestamp
```
**Expected Result**:
- `OK` returned on `/ping`.
- Unix timestamp exported for certificate expiration (> 2,000,000 seconds remaining).

---

### Test 5: Shop A and Shop B Tenant Isolation
1. **Request Shop A Workspace**:
   ```bash
   curl -s -D - "https://shop-a.staging.departmentstore.in/app" -o /dev/null
   ```
   **Expected Headers**:
   - `X-Tenant-Slug: shop-a`
   - `X-Tenant-Type: store`
   - `Vary: Host, Cookie`
2. **Request Shop B Workspace**:
   ```bash
   curl -s -D - "https://shop-b.staging.departmentstore.in/app" -o /dev/null
   ```
   **Expected Headers**:
   - `X-Tenant-Slug: shop-b`
   - `X-Tenant-Type: store`
   - `Vary: Host, Cookie`
3. **Verify Cross-Tenant Denial**:
   - Log in as Shop A store manager and obtain session cookie `sid`.
   - Send request with Shop A's `sid` to `https://shop-b.staging.departmentstore.in/app`.
   - **Expected Result**: Rejected with `401 Unauthorized` or `403 Forbidden`. Shop A session does NOT grant access to Shop B.

---

### Test 6: Unknown, Suspended, and Archived Tenant Denial
1. **Unregistered Tenant**:
   ```bash
   curl -i "https://unregistered-shop.staging.departmentstore.in/"
   ```
   **Expected Result**: HTTP `404 Not Found` with JSON error `TENANT_NOT_FOUND`. No fallback to default site.
2. **Suspended Tenant**:
   - In Platform Admin console or API, suspend Shop C: `set_tenant_status(tenant_id, "SUSPENDED", "Overdue subscription")`.
   - Attempt access:
     ```bash
     curl -i "https://shop-c.staging.departmentstore.in/"
     ```
   **Expected Result**: HTTP `403 Forbidden` with JSON error `TENANT_SUSPENDED`.
3. **Verify Data Retention**:
   - Query Frappe MariaDB: verify Shop C's database and records (`tabPOS Sale Sync Log`, `tabSales Invoice`) remain 100% intact. Suspension blocks ingress without deleting data.

---

### Test 7: Platform Admin Boundary Security
1. **Access from Root Admin Subdomain**:
   ```bash
   curl -i "https://admin.staging.departmentstore.in/admin/onboarding"
   ```
   **Expected Result**: Allowed (HTTP 200 / auth challenge). `X-Tenant-Type: platform`.
2. **Access from Tenant Subdomain**:
   ```bash
   curl -i "https://shop-a.staging.departmentstore.in/admin/onboarding"
   ```
   **Expected Result**: HTTP `403 Forbidden` with error `ACCESS_DENIED`. Platform administration is strictly inaccessible from tenant subdomains.

---

### Test 8: Cookie and Session Scope Validation
Inspect Set-Cookie headers in responses from tenant dashboards:
```bash
curl -i "https://shop-a.staging.departmentstore.in/api/method/login" ...
```
**Expected Attributes**:
- `Secure; HttpOnly; SameSite=Lax`
- **NO** `Domain=.staging.departmentstore.in` (Cookie must be host-only to prevent subdomains reading each other's cookies).

---

### Test 9: Public Port Exposure Audit
Run an external nmap or port scan against the staging server IP:
```bash
nmap -p 80,443,3100,3306,6379,8000,8080 <staging-ip>
```
**Expected Result**:
- Port `80`: **OPEN** (Traefik HTTP)
- Port `443`: **OPEN** (Traefik HTTPS)
- Port `3100`, `3306`, `6379`, `8000`, `8080`: **CLOSED / FILTERED** (Blocked by firewall).

---

### Test 10: Ingress Restart & Reload Isolation Resilience
Simulate an ingress restart under active traffic:
```bash
docker compose -f deployment/ingress/docker-compose.traefik.yml restart traefik
```
**Expected Result**:
- Traefik restarts cleanly in under 3 seconds.
- Re-reads existing `acme.json` from persistent volume without re-requesting certificates.
- Routing tables immediately re-established without cross-tenant leakage.

---

## Staging Sign-Off Criteria

To promote from Staging to Production:
1. All 10 tests above must report **PASS**.
2. Zero certificate rate-limit errors in Traefik logs.
3. Switch `ACME_RESOLVER=letsencrypt-prod` in `.env` only after sign-off.
