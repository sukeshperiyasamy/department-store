# Staging Deployment and Recovery Runbook

**Document Version:** 1.0 (Phase 15 Staging Readiness)  
**Date:** 2026-10-27  
**Auditor:** Automated Release & SRE Agent  
**Repository:** `sukeshperiyasamy/department-store`  
**Target Infrastructure:** Clean Staging Linux VM / Container Host  
**Edge Ingress Reverse Proxy:** Traefik v3 (`deployment/ingress/`)  
**Backend Application:** ERPNext v16 / Frappe v16 (`deployment/erpnext/pwd.yml`)  
**Manager Console & SaaS Ingress:** Next.js 15 SSR (`apps/owner-dashboard/`)

---

## 1. Executive Summary & Deployment Boundaries

This runbook specifies the step-by-step deployment procedure to provision, configure, validate, update, and recover the Department Store multi-tenant SaaS on a clean staging host.

### Operational Verification Boundaries
```
[Local Dev / Docker Workstation] (VERIFIED)
├── Preflight Configuration Audit: 25 PASSED (Exit code 0)
├── Traefik Dynamic Ingress Validation: PASS
├── Network Isolation & Port Non-Exposure: PASS (MariaDB & Redis ports internal only)
├── Local Scratch Disaster Recovery Rehearsal: PASS (36.6s RTO, 1:1 data parity)
├── Provider-Independent Off-Site Backup Script: PASS (SigV4, AES256, SHA-256)
└── Regression Suite Matrix: 350 Unit/Integration Tests PASS (0 Failed)

[External Staging Infrastructure] (CONDITIONAL / BLOCKED)
├── Public Linux VM Allocation (Static IPv4): BLOCKED (Owner action)
├── Delegated Staging Domain (*.staging.departmentstore.in): BLOCKED (Owner action)
├── Authoritative DNS-01 API Token (Cloudflare/Route53): BLOCKED (Owner action)
└── S3 / Cloudflare R2 Off-Site Bucket Credentials: BLOCKED (Owner action)
```

> [!IMPORTANT]
> Do not attempt live public certificate issuance or public DNS modifications until the Platform Owner has formally provisioned the staging domain and delegated DNS credentials.

---

## 2. Host Operating System & Minimum Resource Requirements

### 2.1 Supported Operating Systems
- **Recommended:** Ubuntu 24.04 LTS (x86_64) or Debian 12 (x86_64)
- **Supported:** AlmaLinux 9 / Rocky Linux 9 (x86_64)
- **Local Development / Testing:** Windows 10/11 (x64) with WSL2 & Docker Desktop

### 2.2 Sizing & Hardware Assumptions

| Resource | Staging Minimum | Production Recommended | Failure Mode Under Stress |
| :--- | :--- | :--- | :--- |
| **CPU** | 4 vCPUs (2.4 GHz+) | 8 vCPUs (3.0 GHz+) | Gunicorn worker request queuing; API latency spikes |
| **RAM** | 12 GB RAM | 32 GB RAM (ECC preferred) | MariaDB / Redis OOM kill; container exit 137 |
| **Swap** | 4 GB NVMe Swapfile | 8 GB NVMe Swapfile | Kernel freeze during peak catalog sync or migrations |
| **Disk Storage**| 80 GB Fast NVMe SSD | 250 GB+ Enterprise NVMe | MariaDB binlog disk exhaustion; backup failure |
| **Network** | 100 Mbps uplink, 1 static IPv4 | 1 Gbps redundant uplink, static IPv4 | Ingress TLS handshake timeouts; POS bill sync lag |

### 2.3 Required Host Software & Version Gates
Prior to deployment, verify that the following tools are installed:
```bash
# Check Docker Engine (Required: >= 26.0.0)
docker --version

# Check Docker Compose (Required: >= 2.26.0)
docker compose version

# Check Git (Required: >= 2.40.0)
git --version

# Check Python 3 (Required: >= 3.11.0)
python3 --version

# Check OpenSSL (Required: >= 3.0.0)
openssl version
```

---

## 3. Environment Inventory & Secret Management

### 3.1 Environment Variable Inventory

| Variable Name | Required Scope | Example Value | Description & Purpose |
| :--- | :--- | :--- | :--- |
| `BASE_DOMAIN` | Traefik / Ingress | `staging.departmentstore.in` | Apex domain for staging environment |
| `ACME_EMAIL` | Traefik TLS | `admin@departmentstore.in` | Let's Encrypt notification address |
| `ACME_RESOLVER` | Traefik TLS | `letsencrypt-staging` | Use staging resolver during setup to avoid rate limits |
| `CF_DNS_API_TOKEN` | Ingress DNS-01 | `<redacted_scoped_token>` | Scoped DNS edit token for wildcard certificate issuance |
| `TRUSTED_PROXY_IPS` | Traefik Ingress | `127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` | Trusted upstream CIDRs for client IP resolution |
| `MARIADB_ROOT_PASSWORD` | Backend Database | `<generated_32char_hex>` | Root password for MariaDB container |
| `FRAPPE_ADMIN_PASSWORD` | Backend Frappe | `<generated_32char_hex>` | Administrator password for default site |
| `RAZORPAY_KEY_ID` | Billing Gateway | `rzp_test_stagingKey123` | Razorpay Sandbox Key ID (`rzp_test_` prefix required) |
| `RAZORPAY_KEY_SECRET` | Billing Gateway | `<generated_test_secret>` | Razorpay Sandbox Key Secret |
| `RAZORPAY_WEBHOOK_SECRET`| Billing Webhooks | `<generated_hmac_secret>` | Webhook HMAC-SHA256 signature verification secret |
| `RAZORPAY_LIVE_MODE` | Payment Guard | `false` | Must remain `false` in staging; fails closed if true with test key |
| `OFFSITE_BACKUP_ENABLED` | Backup Script | `false` | Set `true` only when S3/R2 credentials are confirmed |
| `S3_BUCKET_NAME` | Offsite Backup | `department-store-staging-backups` | Cloud object storage bucket name |
| `S3_ACCESS_KEY_ID` | Offsite Backup | `<redacted_key_id>` | IAM / R2 Access Key ID |
| `S3_SECRET_ACCESS_KEY` | Offsite Backup | `<redacted_secret_key>` | IAM / R2 Secret Access Key |
| `S3_REGION_NAME` | Offsite Backup | `ap-south-1` | AWS region or `auto` for Cloudflare R2 |

### 3.2 Secret Creation & Rotation Protocol
1. **Cryptographic Secret Generation:**
   ```bash
   # Generate 32-character random hex strings for passwords and secrets
   openssl rand -hex 32
   ```
2. **File Permissions & Storage:**
   - Store production/staging secrets in `deployment/ingress/.env.staging` and `deployment/erpnext/.env.staging`.
   - Restrict file permissions immediately:
     ```bash
     chmod 600 deployment/ingress/.env.staging
     chmod 600 deployment/erpnext/.env.staging
     ```
   - Never commit `.env.staging` or unmasked secrets to Git.
3. **Secret Rotation Procedure:**
   - Database passwords: rotate using Frappe bench CLI (`bench --site <site> set-mariadb-password`).
   - Webhook secrets: rotate simultaneously in Razorpay Dashboard and server environment variables; reload gunicorn without dropping connections (`docker compose kill -s HUP backend`).

---

## 4. Network Exposure & Port Security Review

To enforce defense-in-depth and comply with `AGENTS.md`:

```
               [Public Internet]
                      │
           ┌──────────┴──────────┐
           │   TCP Ports 80, 443 │
           ▼                     ▼
┌───────────────────────────────────────────────┐
│              Traefik v3 Ingress               │
│             (saas-edge-ingress)               │
└──────────────────────┬────────────────────────┘
                       │
          [Internal Docker Bridge Network]
             (departmental-internal)
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│ Next.js SSR  ││ Frappe Nginx ││ MariaDB 11.8 │
│  (Port 3100) ││  (Port 8080) ││ (Port 3306)  │
│  [INTERNAL]  ││  [INTERNAL]  ││  [ISOLATED]  │
└──────────────┘└──────────────┘└──────────────┘
                       │
                       ▼
                ┌──────────────┐
                │  Redis Queue │
                │ (Port 6379)  │
                │  [ISOLATED]  │
                └──────────────┘
```

### Verification Rules:
1. `3306:3306` (MariaDB) is **NEVER** exposed on host interfaces.
2. `6379:6379` (Redis) is **NEVER** exposed on host interfaces.
3. `8000:8000` (Gunicorn Python app server) is **NEVER** exposed on host interfaces.
4. Only `80` (HTTP redirect to HTTPS) and `443` (TLS) are published to `0.0.0.0`.
5. All container communications travel through the internal Docker network `departmental-internal`.

---

## 5. Step-by-Step Staging Host Provisioning

### Step 1: System Baseline Setup
```bash
# Update OS packages
sudo apt-get update && sudo apt-get upgrade -y

# Install prerequisite utilities
sudo apt-get install -y curl git jq python3 python3-pip rclone gzip

# Verify Docker installation
docker run --rm hello-world
```

### Step 2: Clone Codebase & Configure Ingress
```bash
# Clone repository
git clone https://github.com/sukeshperiyasamy/department-store.git /opt/department-store
cd /opt/department-store

# Create staging environment file
cp deployment/ingress/.env.example deployment/ingress/.env.staging
# Edit .env.staging with genuine staging domain and ACME email
nano deployment/ingress/.env.staging
```

### Step 3: Validate Compose & Ingress Configurations
```bash
# Validate Ingress Compose configuration
docker compose -f deployment/ingress/docker-compose.traefik.yml --env-file deployment/ingress/.env.staging config

# Run automated preflight audit
node tests/integration/staging_preflight_check.mjs
```

### Step 4: Launch Core Stack & Execute Migrations
```bash
# Start ERPNext backend stack
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d

# Verify container health
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp ps

# Run site migrations and install custom applications
docker exec departmental-erp-backend-1 bench --site frontend migrate
docker exec departmental-erp-backend-1 bench --site frontend install-app departmental_store
docker exec departmental-erp-backend-1 bench --site frontend install-app india_compliance
```

### Step 5: Launch Traefik Ingress
```bash
# Launch Traefik reverse proxy
docker compose -f deployment/ingress/docker-compose.traefik.yml --env-file deployment/ingress/.env.staging up -d

# Verify Traefik logs
docker compose -f deployment/ingress/docker-compose.traefik.yml logs --tail=50 -f
```

### Step 6: Post-Deployment Smoke Test
```bash
# Verify backend liveness endpoint
curl -fsS http://localhost:8080/api/method/departmental_store.api.health.get_liveness

# Verify owner dashboard SSR health
curl -fsS http://localhost:3100/api/health
```

---

## 6. Safe Update Procedure & Failed Migration Rollback

### 6.1 Update Workflow (Zero-Downtime Migration)
```mermaid
sequenceDiagram
    participant Op as SRE / Operator
    participant Bak as Backup Runner
    participant DB as MariaDB / Redis
    participant Bench as Frappe Backend
    participant Ingress as Traefik Proxy

    Op->>Bak: 1. Trigger pre-migration backup (run_backup.sh)
    Bak-->>Op: Backup confirmed & SHA256 verified
    Op->>Bench: 2. Pull updated images & deploy code diff
    Op->>Bench: 3. Execute bench --site frontend migrate
    alt Migration Successful
        Bench-->>Op: Schema migrated cleanly
        Op->>Bench: 4. Restart workers (kill -HUP gunicorn)
        Op->>Ingress: 5. Verify liveness (/api/health)
        Ingress-->>Op: 200 OK — Release Complete
    else Migration Failed
        Bench-->>Op: Migration raised exception!
        Op->>Bench: Immediate Halt
        Op->>DB: 6. Execute Rollback Runbook (Restore pre-migration backup)
    end
```

### 6.2 Rollback Runbook for Failed Migrations
If a database migration fails during an update:
1. **Stop Application Ingress Immediately:**
   ```bash
   docker compose -f deployment/ingress/docker-compose.traefik.yml stop
   ```
2. **Identify Latest Pre-Migration Backup:**
   ```bash
   LATEST_BACKUP=$(ls -td $HOME/departmental-backups/*/ | head -1)
   echo "Rolling back to: $LATEST_BACKUP"
   ```
3. **Verify Archive Checksums:**
   ```bash
   ( cd "$LATEST_BACKUP" && sha256sum -c SHA256SUMS.txt )
   ```
4. **Restore Database Dump into Production Site:**
   ```bash
   docker cp "$LATEST_BACKUP" departmental-erp-backend-1:/tmp/rollback_dump/
   docker exec departmental-erp-backend-1 bench --site frontend restore /tmp/rollback_dump/*-database.sql.gz --db-root-username root --db-root-password admin
   docker exec departmental-erp-backend-1 rm -rf /tmp/rollback_dump
   ```
5. **Git Checkout Previous Stable Commit:**
   ```bash
   git checkout <PREVIOUS_STABLE_COMMIT_HASH>
   ```
6. **Restart Stack & Ingress:**
   ```bash
   docker compose -f deployment/erpnext/pwd.yml -p departmental-erp restart backend
   docker compose -f deployment/ingress/docker-compose.traefik.yml start
   ```
7. **Verify Site Integrity & Parity:**
   ```bash
   docker exec departmental-erp-backend-1 bench --site frontend execute departmental_store.api.health.get_liveness
   ```

---

## 7. External Staging Acceptance Sequence & Owner Action Checklist

Prior to initiating live staging deployment or provisioning cloud infrastructure, the Platform Owner must authorize and supply the following 7 prerequisite items:

```mermaid
flowchart TD
    subgraph OwnerChecklist["7-Item Owner Staging Prerequisite Checklist"]
        O1["1. Cloud Storage Bucket: AWS S3 or Cloudflare R2 bucket credentials"]
        O2["2. Staging Linux VM: Ubuntu 24.04, 4 vCPUs, 12GB RAM, static IPv4"]
        O3["3. DNS Zone Access: Delegation of *.staging.departmentstore.in + ACME DNS-01 API token"]
        O4["4. Ingress Topology Sign-Off: Approved hostnames & trusted proxy CIDRs"]
        O5["5. Test Notifications: SendGrid / AWS SES sandbox API credentials"]
        O6["6. Test Gateway: Razorpay Sandbox (rzp_test_...) & webhook secret"]
        O7["7. Hardware Delivery: Physical 80mm ESC/POS printer & barcode scanner"]
    end

    OwnerChecklist --> Deploy["Staging Deployment Execution"]
    Deploy --> V1["Verify ACME Wildcard TLS Issuance"]
    Deploy --> V2["Verify Multi-Tenant Subdomain Routing & Isolation"]
    Deploy --> V3["Execute Real Cloud Backup Replication & Scratch Restore"]
    Deploy --> V4["Validate Deployment Rollback Runbook"]
```

### Actionable Prerequisite Details

| # | Prerequisite Item | Environment Variable / Config Key | Delivery Format & Safety Boundaries |
| :--- | :--- | :--- | :--- |
| **1** | **Cloud Backup Bucket** | `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION_NAME` | Dedicated, isolated bucket or prefix (e.g. `department-store-staging-backups`). Principle of least privilege: `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` only. |
| **2** | **Staging Linux VM** | Static IPv4, SSH deploy key | Dedicated host meeting 4 vCPU / 12GB RAM sizing. Ports 80 and 443 open to internet; port 22 restricted to admin/deployer IP. |
| **3** | **DNS Zone Delegation** | `CF_DNS_API_TOKEN` / `AWS_HOSTED_ZONE_ID` | Scoped API token permitting TXT record creation under `_acme-challenge.staging.departmentstore.in`. Zero access to production root records. |
| **4** | **Ingress & Proxy Topology**| `BASE_DOMAIN`, `TRUSTED_PROXY_IPS` | Sign-off on staging subdomain scheme (`*.staging.departmentstore.in`). Explicit CIDRs of any intermediate cloud load balancers or CDNs. |
| **5** | **Test Notification Provider** | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Sandbox credentials restricted to sending only to authorized test emails/phone numbers. |
| **6** | **Test Payment Gateway** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Test mode credentials (`rzp_test_` prefix strictly required). `RAZORPAY_LIVE_MODE` remains `false`. |
| **7** | **Physical POS Hardware** | Retail Store Pilot Bench | ESC/POS 80mm thermal receipt printer (USB/Ethernet) and 1D/2D handheld barcode scanner for in-store checkout validation. |

### Post-Prerequisite Acceptance Validation Protocol
Once the owner supplies prerequisites 1–6:
1. Deploy Traefik v3 and ERPNext stack using `deployment/ingress/docker-compose.traefik.yml` and `deployment/erpnext/pwd.yml`.
2. Issue wildcard TLS certificate via Let's Encrypt Staging resolver (`letsencrypt-staging`) to confirm ACME DNS-01 challenge completion without rate-limit risk.
3. Verify live tenant routing: `shop-a.staging.departmentstore.in` and `shop-b.staging.departmentstore.in` route to distinct isolated tenant workspaces with zero cross-tenant leakage.
4. Execute `python deployment/backup/replicate_offsite.py` against the real test bucket, verify remote SHA-256 metadata via S3 HEAD, download the archive via `download_file()`, and restore into a disposable scratch site (`deployment/backup/test_restore_scratch.py`).
5. Exercise Step 6.2 rollback runbook to confirm database restore and zero-downtime recovery in the staging environment.

---

## 8. Controlled 10-Step Staging Acceptance Run Protocol

This sequential execution protocol provides explicit pass/fail gates for each staging acceptance stage. Operators must verify each step's exit criteria before advancing to the next.

```mermaid
flowchart TD
    S1["1. Deploy to Staging VM"] --> S2["2. Issue & Renew Public TLS"]
    S2 --> S3["3. Test Hostname Resolution & Fail-Closed"]
    S3 --> S4["4. Verify Tenant Database Isolation"]
    S4 --> S5["5. Validate Auth & Onboarding"]
    S5 --> S6["6. Verify Sandbox Payments & Webhooks"]
    S6 --> S7["7. Replicate Off-Site Backup to S3"]
    S7 --> S8["8. Download & Verify Remote Checksum"]
    S8 --> S9["9. Scratch Site Restoration Drill"]
    S9 --> S10["10. Drill Rollback & Recovery Procedures"]
```

| Step | Acceptance Stage | Execution Procedure / Command | Explicit Pass Criteria | Explicit Fail Criteria |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Deploying to Authorized Staging VM** | `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d`<br>`docker compose -f deployment/ingress/docker-compose.traefik.yml up -d` | All 9 service containers report `healthy` or `running`; ports 80/443 bound to host; DB/Redis ports unbound. | Any container in `restarting`/`exited`; public interface binds on port 3306 or 6379. |
| **2** | **Public TLS Issuance & Renewal** | Inspect Traefik ACME logs:<br>`docker logs saas-edge-ingress \| grep -i "acme"`<br>Probe: `curl -Iv https://staging.departmentstore.in` | Valid Let's Encrypt TLS certificate presented; HTTP redirects to HTTPS (301/308); HSTS headers present. | ACME challenge timeout; certificate validation error; expired or self-signed cert on public endpoint. |
| **3** | **Hostname Routing & Fail-Closed Behavior** | Query active vs unknown vs suspended hosts:<br>`curl -H "Host: unknown.staging.departmentstore.in" https://<IP>`<br>`curl -H "Host: suspended.staging.departmentstore.in" https://<IP>` | Active host returns HTTP 200 with tenant context; unknown host returns HTTP 404 `TENANT_NOT_FOUND`; suspended host returns 403 `TENANT_SUSPENDED`. | Unknown host returns 200 or falls back to default tenant; suspended tenant workspace accessible. |
| **4** | **Multi-Tenant Site Isolation** | Execute cross-tenant queries from Tenant A session:<br>`curl -H "Cookie: sid=tenant_a" https://tenant-b.staging.departmentstore.in/api/method/...` | Frappe returns `PermissionError` (HTTP 403); zero data records from Tenant B accessible by Tenant A user. | Cross-tenant data returned; tenant membership checks bypassed; shared database table pollution. |
| **5** | **Authentication & Onboarding Workflows** | Register new store owner via `/register`; check slug availability; confirm verification token via email sandbox. | Slug checked against reserved list; token delivered to sandbox; verified owner logged in to store dashboard. | Reserved slug permitted; unverified user logged in; cleartext passwords or tokens in server logs. |
| **6** | **Payment & Notification Sandbox Flows** | Create checkout session (`rzp_test_...`); dispatch signed payment.captured webhook with HMAC-SHA256 signature. | Webhook returns HTTP 200 `PROCESSED`; subscription transitions to `ACTIVE`; duplicate webhook is idempotent. | Webhook accepted with invalid HMAC signature; duplicate webhook creates duplicate invoice; live keys used. |
| **7** | **Off-Site Backup Upload to S3** | `python deployment/backup/replicate_offsite.py`<br>(with owner-supplied staging bucket and IAM keys) | Upload completes with AES256 server-side encryption; post-upload HEAD probe confirms SHA-256 metadata. | Upload fails; plain HTTP used; credentials leak in stdout/stderr; unverified upload marked successful. |
| **8** | **Remote Download & Checksum Verification** | Download uploaded archive using `S3ReplicationClient.download_file()` into fresh temp directory. | Download streams chunked; calculated SHA-256 exactly matches `SHA256SUMS.txt` manifest; atomic replace completes. | Checksum mismatch accepted; incomplete download preserved; destination path traversal permitted. |
| **9** | **Disposable Scratch Site Restoration** | `python deployment/backup/test_restore_scratch.py` using downloaded remote backup archive. | Scratch site restored in < 900s (target < 120s); 1:1 invoice/item parity; `gl_ledger_balanced: True`; site dropped cleanly. | Database restore fails; ledger imbalance; production `frontend` site affected or interrupted. |
| **10** | **Rollback & Disaster Recovery Drill** | Rehearse Section 6.2 rollback procedure: simulate faulty release, revert Git SHA, restore database, verify liveness. | Stack restarts cleanly on previous commit; database tables restored; `/api/method/.../get_liveness` returns OK. | Rollback leaves database in inconsistent state; migrations cannot roll back; persistent data lost. |
