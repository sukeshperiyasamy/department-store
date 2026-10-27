# Operations Handbook and Long-Term Maintenance Calendar

## 1. Operational Ownership and Role Matrix

To ensure operational integrity and regulatory compliance, clear lines of responsibility are assigned across platform functions.

> **Operational Note**: Escalation roles and channels are parameterized via environment configuration (`OPS_PRIMARY_ONCALL_SLACK`, `OPS_SECURITY_NOTIFICATION_EMAIL`). No personal identities or rigid staffing numbers are assumed.

| Functional Area | Primary Responsible Role | Escalation Role | Authorized Procedures & Runbooks |
| :--- | :--- | :--- | :--- |
| **Release Approval & Merge** | Release Manager (`ROLE_RELEASE_LEAD`) | Platform Architect (`ROLE_PLATFORM_ARCH`) | PR Quality Gate verification, Release Manifest signing |
| **Database Migrations** | Database Reliability Engineer (`ROLE_DBA`) | Infrastructure Lead (`ROLE_INFRA_LEAD`) | [`scripts/tenant_migration_runner.py`](file:///scripts/tenant_migration_runner.py), Pre-migration backup |
| **Tenant Provisioning** | SaaS Platform Operations (`ROLE_SAAS_OPS`) | Security Administrator (`ROLE_SEC_ADMIN`) | Automated Provisioning Worker, Hostname DNS verification |
| **Backup and Restore** | Site Reliability Engineer (`ROLE_SRE`) | Database Reliability Engineer (`ROLE_DBA`) | [`deployment/backup/run_backup.ps1`](file:///deployment/backup/run_backup.ps1), Restore verification |
| **Incident Response** | On-Call Systems Engineer (`ROLE_ONCALL_SRE`)| Incident Commander (`ROLE_INCIDENT_CDR`) | [`docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md`](file:///docs/operations/INCIDENT_RESPONSE_RUNBOOKS.md) |
| **Certificates & Ingress** | Ingress Operator (`ROLE_NET_OPS`) | Infrastructure Lead (`ROLE_INFRA_LEAD`) | Traefik wildcard TLS rotation, DNS-01 challenge |
| **Secret Rotation** | Security Operations (`ROLE_SEC_OPS`) | Platform Administrator (`ROLE_PLATFORM_ADMIN`) | MariaDB root password, Razorpay webhook secrets, JWT keys |
| **Windows POS Support** | Field Support Lead (`ROLE_FIELD_SUPPORT`) | Desktop Application Lead (`ROLE_DESKTOP_DEV`) | Offline outbox recovery, NSIS silent install, printer drivers |
| **Customer Communication** | Support Operations (`ROLE_SUPPORT_OPS`) | Product Manager (`ROLE_PRODUCT_MGR`) | Status page updates, planned maintenance advisories |
| **Subscription Entitlements**| Customer Success (`ROLE_CS_OPS`) | Platform Admin (`ROLE_PLATFORM_ADMIN`) | Counter limit adjustments, billing dispute resolutions |
| **Security Handling** | Product Security Team (`ROLE_PSIRT`) | Security Administrator (`ROLE_SEC_ADMIN`) | CVE patching, vulnerability intake, DPDPA disclosures |

---

## 2. Standard Operating Procedures (SOPs)

### 2.1 Secret Rotation Runbook
Secret rotation must be performed every 90 days or immediately upon suspected compromise:
1. **JWT & Session Secrets**:
   - Update `JWT_SECRET` in `.env`. Existing sessions expire naturally within 24 hours. Force refresh by restarting dashboard containers.
2. **Database Passwords**:
   - Generate high-entropy 32-character string.
   - Update MariaDB user password via SQL: `ALTER USER 'frappe'@'%' IDENTIFIED BY '<new_pass>'; FLUSH PRIVILEGES;`
   - Update `sites/common_site_config.json` and restart backend stack.
3. **Payment Gateway Webhook Secrets**:
   - Create secondary webhook in Razorpay/Stripe dashboard.
   - Update `RAZORPAY_WEBHOOK_SECRET` in tenant site config.
   - Verify signatures of incoming webhooks; delete legacy webhook secret.

### 2.2 Certificate and Domain Management
1. Automated renewal is managed via Traefik ACME DNS-01 provider.
2. Manual verification runbook:
   - Check expiration: `openssl s_client -connect app.departmental.local:443 -servername app.departmental.local 2>/dev/null | openssl x509 -noout -dates`
   - Certs expiring in < 30 days trigger an alert on `OPS_ALERT_WEBHOOK`.

---

## 3. Maintenance Calendar

| Frequency | Scheduled Window | Task / Activity | Responsible Role | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **Daily** | 02:00 IST | Automated database backup & offsite tarball replication | `ROLE_SRE` | Backup log verification + SHA256 checksum check |
| **Weekly** | Wednesday 04:00 IST | Synthetic Backup Restore Exercise (Ephemeral DB) | `ROLE_DBA` | Restore to test container; verify `SELECT COUNT(*) FROM \`tabSales Invoice\`` |
| **Bi-Weekly** | Sunday 03:00 IST | Minor dependency patch updates & OS security patches | `ROLE_INFRA_LEAD` | Run CI Quality Gates; deploy to Staging first |
| **Monthly** | First Tuesday 05:00 IST | Wildcard TLS certificate validity & DNS health audit | `ROLE_NET_OPS` | SSL Labs audit / cert expiry probe |
| **Quarterly** | End of Quarter | Secret rotation (DB passwords, API keys, webhook secrets) | `ROLE_SEC_OPS` | Staggered rotation runbook execution |
| **Bi-Annually**| April / October | Full Disaster Recovery Simulation & Failover Exercise | `ROLE_INCIDENT_CDR`| Simulated primary host outage; restore on cold standby |
| **Annually** | January | Security audit, DPDPA compliance review & dependency purge | `ROLE_PSIRT` | Third-party penetration testing report review |
