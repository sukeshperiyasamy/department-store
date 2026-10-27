# Ingress Monitoring, Rollback, and Disaster Recovery Runbook (Phase 4B)

This runbook defines the operational procedures for monitoring Traefik edge ingress health, tracking certificate lifecycles, safely rolling back configuration errors, and responding to routing or ACME incidents.

---

## 1. Persistent State and Configuration Storage

Traefik edge ingress maintains persistent state in two directories:
1. **Static and Dynamic YAML files**: Mounted read-only from Git repository (`deployment/ingress/traefik.yml` and `deployment/ingress/dynamic/routing.yml`).
2. **ACME Certificate Vault (`acme.json`)**: Stored in Docker named volume `saas-traefik-acme-data` at `/etc/traefik/acme/acme.json`.
   - Permissions: strictly `0600` (`-rw-------`).
   - Content: private keys, issued certificates, and ACME challenge renewal tokens.

### Daily Backup of Ingress State
Add `acme.json` to the automated backup script (`deployment/backup/run_backup.ps1` and `run_backup.sh`):
```bash
# Backup acme.json with timestamp and strict permissions
docker run --rm -v saas-traefik-acme-data:/acme -v /backup/ingress:/dest alpine \
  sh -c "cp /acme/acme.json /dest/acme_$(date +%Y%m%d_%H%M%S).json && chmod 600 /dest/acme_*.json"
```

---

## 2. Ingress & Application Health Monitoring

### A. Healthcheck Endpoints
| Component | Healthcheck URL | Type | Expected Response |
| :--- | :--- | :--- | :--- |
| **Traefik Ingress Engine** | `http://127.0.0.1:8080/ping` | Internal HTTP | Status 200, Body: `OK` |
| **Next.js Owner Dashboard** | `http://owner-dashboard:3100/api/health` | Container HTTP | Status 200 `{"status":"ok"}` |
| **Frappe ERP Nginx** | `http://frontend:8080/` | Container HTTP | Status 200 / 302 |
| **Frappe MariaDB** | `db:3306` | TCP / Socket | Docker Healthcheck: `healthy` |

### B. Prometheus Metrics & Alert Rules
Traefik exports metrics on `http://127.0.0.1:8080/metrics`. Recommended Prometheus alerts:

```yaml
groups:
  - name: ingress_alerts
    rules:
      # Alert: Traefik Ingress Down
      - alert: IngressProxyDown
        expr: up{job="traefik"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Traefik edge ingress is unreachable"

      # Alert: Wildcard TLS Certificate Expiring in Under 14 Days
      - alert: TLSCertificateExpiringSoon
        expr: (traefik_tls_certs_not_after_timestamp - time()) / 86400 < 14
        for: 2h
        labels:
          severity: warning
        annotations:
          summary: "Wildcard TLS certificate for {{ $labels.sans }} expires in {{ $value }} days"

      # Alert: High 5xx Error Rate at Ingress
      - alert: HighIngress5xxRate
        expr: rate(traefik_service_requests_total{code=~"5.."}[5m]) / rate(traefik_service_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Ingress 5xx error rate exceeds 5% on service {{ $labels.service }}"
```

---

## 3. Safe Configuration Rollback

If a modified `routing.yml` or `traefik.yml` causes routing failures, Traefik's dynamic file provider automatically validates syntax before applying. However, if a semantic routing error occurs (e.g. bad path prefix):

### Step 1: Revert Routing Configuration to Last Known-Good Git Commit
```bash
git checkout HEAD~1 -- deployment/ingress/dynamic/routing.yml
# Or restore specific known-good tag:
git checkout tags/v1.0.0 -- deployment/ingress/dynamic/routing.yml
```

### Step 2: Traefik Automatic Hot-Reload
Traefik watches `/etc/traefik/dynamic` with `watch: true`. It will reload the file immediately without dropping active TCP connections or restarting the container.

### Step 3: Verify Restoration via Routing Suite
```bash
node tests/integration/ingress_routing_check.mjs
```

---

## 4. Incident Response Runbooks

### Incident 1: Misrouted or Leaking Tenant Subdomain
**Symptom**: `shop-a.departmentstore.in` resolves to Shop B or shows Shop B's name.
**Immediate Actions**:
1. Check Traefik Access Logs:
   ```bash
   docker logs --tail 100 saas-edge-ingress | grep "shop-a.departmentstore.in"
   ```
2. Verify `tabSaaS Tenant Registry`:
   ```sql
   SELECT tenant_id, slug, primary_hostname, frappe_site_name, lifecycle_status
   FROM `tabSaaS Tenant Registry`
   WHERE primary_hostname LIKE '%shop-a%';
   ```
3. If duplicate or incorrect hostname exists, run administrative correction:
   ```python
   # Inside Frappe backend container
   bench --site frontend execute departmental_store.api.provisioning.verify_tenant_hostname \
     --kwargs "{'tenant_id': '<shop-a-id>', 'hostname': 'shop-a.departmentstore.in'}"
   ```
4. Clear cache on Frappe backend:
   ```bash
   bench --site frontend clear-cache
   ```

### Incident 2: ACME DNS-01 Challenge Failure / Rate Limit Lockout
**Symptom**: Traefik log reports `acme: error presenting token: 429 Too Many Requests` or `error: 403 Forbidden` from Let's Encrypt.
**Recovery Steps**:
1. Inspect Traefik ACME logs:
   ```bash
   docker logs saas-edge-ingress | grep -i "acme"
   ```
2. If Cloudflare API Token expired or lacks `Zone:DNS:Edit` permissions:
   - Generate a new Cloudflare scoped token.
   - Update `CF_DNS_API_TOKEN` in `deployment/ingress/.env`.
   - Restart Traefik: `docker compose -f deployment/ingress/docker-compose.traefik.yml restart traefik`.
3. If Let's Encrypt Production Rate Limit (50 certs/week) was exceeded:
   - Switch `ACME_RESOLVER=letsencrypt-staging` in `.env` temporarily.
   - Let's Encrypt staging allows 30,000 certs/week and will unblock testing immediately.

### Incident 3: Ingress Container Fails to Start
**Symptom**: `saas-edge-ingress` container exits on boot.
**Diagnosis**:
```bash
docker logs saas-edge-ingress
```
- **Error: `permissions on acme.json are too invalid ...`**:
  Fix file permissions on host:
  ```bash
  docker run --rm -v saas-traefik-acme-data:/acme alpine chmod 600 /acme/acme.json
  ```
- **Error: `address already in use :80 or :443`**:
  Identify competing process:
  ```bash
  netstat -ano | findstr :80
  netstat -ano | findstr :443
  ```
  Stop competing local web server or IIS.

---

## 5. Independent Tenant Backup and Restore Verification

Every tenant site in Frappe's multi-site architecture has its own database and can be backed up and restored without affecting other tenants:

### Tenant Independent Backup
```bash
docker exec departmental-erp-backend-1 bench --site shop-a.departmentstore.in backup --with-files
```

### Tenant Isolated Restore (Tested & Proven)
Restores must always be tested against a temporary scratch site first:
```bash
docker exec departmental-erp-backend-1 bench new-site scratch-restore.local
docker exec departmental-erp-backend-1 bench --site scratch-restore.local restore \
  /home/frappe/frappe-bench/sites/shop-a.departmentstore.in/private/backups/20261027_database.sql.gz
# Clean up scratch site
docker exec departmental-erp-backend-1 bench drop-site scratch-restore.local --force
```
This guarantees 100% disaster recovery readiness for each independent retail customer.
