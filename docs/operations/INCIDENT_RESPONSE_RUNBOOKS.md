# Operational Incident Response Runbooks

**Document Version:** 1.0.0  
**Phase:** Phase 8 — Production Hardening & Operations  
**Audience:** Platform Operations, Site Reliability Engineers, Store Systems Administrators  

---

## Index of Runbooks

1. [RUNBOOK-01: Tenant Data Exposure or Suspected Cross-Tenant Access](#runbook-01-tenant-data-exposure-or-suspected-cross-tenant-access)
2. [RUNBOOK-02: Compromised Platform-Admin Credentials](#runbook-02-compromised-platform-admin-credentials)
3. [RUNBOOK-03: Failed Tenant Provisioning Job](#runbook-03-failed-tenant-provisioning-job)
4. [RUNBOOK-04: Misrouted Tenant Hostname](#runbook-04-misrouted-tenant-hostname)
5. [RUNBOOK-05: TLS Certificate Expiry or Renewal Failure](#runbook-05-tls-certificate-expiry-or-renewal-failure)
6. [RUNBOOK-06: Database Outage / MariaDB Crash](#runbook-06-database-outage--mariadb-crash)
7. [RUNBOOK-07: Disk Space Exhaustion (>90% Capacity)](#runbook-07-disk-space-exhaustion-90-capacity)
8. [RUNBOOK-08: Failed Backup Execution or Integrity Check](#runbook-08-failed-backup-execution-or-integrity-check)
9. [RUNBOOK-09: POS Synchronization Backlog / Counter Pileup](#runbook-09-pos-synchronization-backlog--counter-pileup)
10. [RUNBOOK-10: Duplicate or Missing Sales Reconciliation](#runbook-10-duplicate-or-missing-sales-reconciliation)
11. [RUNBOOK-11: Payment Webhook Failure / Razorpay Signature Mismatch](#runbook-11-payment-webhook-failure--razorpay-signature-mismatch)
12. [RUNBOOK-12: Compromised Application Secrets or API Tokens](#runbook-12-compromised-application-secrets-or-api-tokens)
13. [RUNBOOK-13: Failed Application Deployment / Release Rollback](#runbook-13-failed-application-deployment--release-rollback)

---

## RUNBOOK-01: Tenant Data Exposure or Suspected Cross-Tenant Access

- **Detection Signal:** Customer report of viewing another tenant's inventory/sales, or security telemetry alert showing cross-tenant query rejections (`test_cross_tenant_query_denied_server_side`).
- **Immediate Containment Action:**
  1. Temporarily suspend affected tenant via platform console or command line:
     `bench --site frontend execute departmental_store.api.provisioning.suspend_tenant --args "['<tenant-id>', 'Security incident containment']"`
  2. Invalidate active user sessions:
     `DELETE FROM tabSessions WHERE user = '<user-id>';`
- **Diagnostic Evidence to Collect:**
  - Nginx / Traefik access logs showing `Host` header, `X-Forwarded-Host`, IP, and request path.
  - ERPNext user activity log (`tabActivity Log`) filtered by timestamp.
- **Recovery Procedure:**
  - Verify if tenant context was derived from Host header vs session cookie.
  - Review recent proxy router configuration updates.
  - Re-verify tenant membership rules in `tabSaaS Tenant Membership`.
- **Data-Integrity Verification:**
  - Audit database for unauthorized modifications to `tabSales Invoice` or `tabItem`.
- **Escalation & Communication:**
  - Notify Platform Security Lead and affected tenant owners within 2 hours of incident confirmation.
- **Post-Incident Follow-Up:**
  - Add regression test case in `tests/test_tenant_isolation.py`.

---

## RUNBOOK-02: Compromised Platform-Admin Credentials

- **Detection Signal:** Unexpected login from unfamiliar geographic IP, unapproved tenant status alterations, or anomalous batch job triggers.
- **Immediate Containment Action:**
  1. Reset administrator password immediately via CLI:
     `bench --site frontend set-admin-password [NEW_SECURE_PASSWORD]`
  2. Terminate all active sessions:
     `bench --site frontend execute frappe.sessions.clear_all_sessions`
- **Diagnostic Evidence to Collect:**
  - Audit records from `tabActivity Log` and `tabVersion` for DocType `User`.
  - Ingress proxy IP logs.
- **Recovery Procedure:**
  - Rotate server API tokens (`DASHBOARD_API_KEY` and `DASHBOARD_API_SECRET`).
  - Audit all operations executed during the compromise window.
- **Data-Integrity Verification:**
  - Reconcile tenant subscription statuses, counter entitlements, and payment overrides.
- **Escalation & Communication:**
  - Escalate to Repository Owner and Executive Management.
- **Post-Incident Follow-Up:**
  - Implement two-factor authentication (2FA) enforcement for Platform Admin roles.

---

## RUNBOOK-03: Failed Tenant Provisioning Job

- **Detection Signal:** Alert from `get_system_health` showing `failed` provisioning jobs > 0, or customer onboarding stuck on "Provisioning".
- **Immediate Containment Action:**
  - Prevent queue retry storm; check retry count (`retry_count >= 3`).
- **Diagnostic Evidence to Collect:**
  - Inspect error log:
    `SELECT job_id, tenant_id, step, error_message, stack_trace FROM tabSaaS Provisioning Job WHERE status = 'failed';`
- **Recovery Procedure:**
  - Identify cause (e.g., duplicate slug, DNS verification failure, database socket timeout).
  - Resolve underlying resource blockage.
  - Re-queue job via CLI or admin console:
    `bench --site frontend execute departmental_store.api.provisioning.retry_provisioning_job --args "['<job-id>']"`
- **Data-Integrity Verification:**
  - Confirm tenant site or tenant registry row is consistent.
- **Escalation & Communication:**
  - Notify onboarding customer if delay exceeds SLA (30 minutes).
- **Post-Incident Follow-Up:**
  - Update preflight validation checks in onboarding submission API.

---

## RUNBOOK-04: Misrouted Tenant Hostname

- **Detection Signal:** Customer visiting `shop-a.departmentstore.in` receives 404 or default marketing page, or Traefik router error.
- **Immediate Containment Action:**
  - Route traffic to fallback maintenance screen if DNS is resolving to incorrect upstream.
- **Diagnostic Evidence to Collect:**
  - Test DNS resolution: `nslookup shop-a.departmentstore.in`
  - Query tenant hostname status:
    `SELECT slug, primary_hostname, hostname_status FROM tabSaaS Tenant Registry WHERE slug = 'shop-a';`
- **Recovery Procedure:**
  - If hostname is unverified, trigger verification:
    `bench --site frontend execute departmental_store.api.provisioning.verify_tenant_hostname --args "['<tenant-id>']"`
  - Reload Traefik dynamic configuration or restart ingress proxy container.
- **Data-Integrity Verification:**
  - Perform test HTTP GET request with Host header to verify tenant resolution.
- **Escalation & Communication:**
  - Inform customer operations team when resolved.
- **Post-Incident Follow-Up:**
  - Verify wildcard DNS propagation time and Traefik router rules.

---

## RUNBOOK-05: TLS Certificate Expiry or Renewal Failure

- **Detection Signal:** Browser certificate warning (NET::ERR_CERT_DATE_INVALID) or Let's Encrypt renewal error in Traefik logs.
- **Immediate Containment Action:**
  - Check ACME resolver logs in ingress container:
    `docker logs departmental-ingress-traefik-1 --tail 100`
- **Diagnostic Evidence to Collect:**
  - Check `acme.json` file size and permissions.
  - Verify DNS-01 API token validity (`CF_DNS_API_TOKEN`).
- **Recovery Procedure:**
  - If token expired, update token in `.env` and restart Traefik.
  - Trigger manual certificate renewal via Lego or Traefik restart.
- **Data-Integrity Verification:**
  - Inspect certificate expiration date using `openssl s_client -connect departmentstore.in:443 -servername departmentstore.in`.
- **Escalation & Communication:**
  - Alert platform administrator if expiration is < 7 days away.
- **Post-Incident Follow-Up:**
  - Configure automated certificate expiry alerts at 30, 14, and 7 days.

---

## RUNBOOK-06: Database Outage / MariaDB Crash

- **Detection Signal:** Health endpoint returns 503 degraded (`checks.database.status = "unhealthy"`), or container logs show MariaDB exit code.
- **Immediate Containment Action:**
  - Check container status: `docker ps -a --filter name=db`
  - Restart database container:
    `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp restart db`
- **Diagnostic Evidence to Collect:**
  - Inspect MariaDB error log:
    `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp logs --tail 200 db`
  - Check system memory and disk capacity.
- **Recovery Procedure:**
  - If InnoDB table corruption occurred, start in recovery mode (`innodb_force_recovery=1`).
  - If recovery fails, execute Scenario A from [BACKUP_AND_DISASTER_RECOVERY.md](BACKUP_AND_DISASTER_RECOVERY.md).
- **Data-Integrity Verification:**
  - Run `bench --site frontend execute departmental_store.api.health.verify_restore_stats`.
- **Escalation & Communication:**
  - Notify all store managers; billing counters switch to offline SQLite outbox buffering.
- **Post-Incident Follow-Up:**
  - Tune MariaDB buffer pool size (`innodb_buffer_pool_size`) to prevent OOM kills.

---

## RUNBOOK-07: Disk Space Exhaustion (>90% Capacity)

- **Detection Signal:** Health endpoint alert (`disk_used_percent >= 90%`), or database write failures ("No space left on device").
- **Immediate Containment Action:**
  1. Trigger immediate backup pruning of local archives older than 7 days:
     `Get-ChildItem -Path "$env:USERPROFILE\departmental-backups" -Directory | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Recurse -Force`
  2. Clean Docker dangling images and build caches:
     `docker system prune -f`
- **Diagnostic Evidence to Collect:**
  - Run disk analysis: `Get-PSDrive C` or `df -h` inside containers.
- **Recovery Procedure:**
  - Expand underlying disk volume or attach secondary storage for backups.
  - Clear old Frappe bench log files in `frappe-bench/logs/`.
- **Data-Integrity Verification:**
  - Verify database resumed write operations: `SELECT 1;`.
- **Escalation & Communication:**
  - Alert Infrastructure Owner.
- **Post-Incident Follow-Up:**
  - Implement automated daily disk capacity alerts at 80% threshold.

---

## RUNBOOK-08: Failed Backup Execution or Integrity Check

- **Detection Signal:** Missing nightly backup directory in `$env:USERPROFILE\departmental-backups\`, or SHA256 checksum mismatch.
- **Immediate Containment Action:**
  - Trigger manual backup run immediately:
    `powershell -NoProfile -ExecutionPolicy Bypass -File deployment\backup\run_backup.ps1`
- **Diagnostic Evidence to Collect:**
  - Inspect Task Scheduler output and container logs:
    `Get-ScheduledTaskInfo -TaskName "DepartmentalStore-ERP-Backup"`
- **Recovery Procedure:**
  - Verify disk space and container health.
  - If backup failed due to locked tables, rerun with `--single-transaction`.
- **Data-Integrity Verification:**
  - Validate gzip integrity of generated database dump:
    `gzip -t <path_to_dump.sql.gz>`
- **Escalation & Communication:**
  - Alert Systems Administrator if two consecutive backup cycles fail.
- **Post-Incident Follow-Up:**
  - Test restore of newly created backup dump into scratch test site.

---

## RUNBOOK-09: POS Synchronization Backlog / Counter Pileup

- **Detection Signal:** Cashier reports counter sync icon red/pending, or `outbox_events` count on counter SQLite > 100.
- **Immediate Containment Action:**
  - Do NOT wipe counter SQLite database or uninstall app! Transactions are safe in local storage.
  - Check network connectivity between counter and ERP server (`http://<server-ip>:8080/api/method/ping`).
- **Diagnostic Evidence to Collect:**
  - Counter logs in `%APPDATA%\departmental-pos\logs\`.
  - Server-side error logs in `frappe-bench/logs/frappe.log`.
- **Recovery Procedure:**
  - If server was down, restart server; counter will drain outbox automatically.
  - If device token expired, re-issue token via ERP Desk and update counter settings.
- **Data-Integrity Verification:**
  - Verify `outbox_events` pending count drops to 0.
  - Reconcile bill count in ERP against counter printed receipts.
- **Escalation & Communication:**
  - Coordinate with store cashier manager.
- **Post-Incident Follow-Up:**
  - Review network latency and Wi-Fi stability at billing counters.

---

## RUNBOOK-10: Duplicate or Missing Sales Reconciliation

- **Detection Signal:** Cashier reports receipt was charged twice or missing in daily closing report.
- **Immediate Containment Action:**
  - Inspect `tabSaaS POS Sale Sync Log` for the transaction ID:
    `SELECT * FROM tabSaaS POS Sale Sync Log WHERE transaction_id = '<txn-id>';`
- **Diagnostic Evidence to Collect:**
  - Local counter SQLite outbox record:
    `SELECT * FROM receipt_sales WHERE id = '<txn-id>';`
  - ERP `tabSales Invoice` records matching timestamp and customer.
- **Recovery Procedure:**
  - Because transaction UUID is idempotent, duplicate submissions do not post duplicate invoices.
  - If a sale was marked `requires_review` due to a price mismatch, review the bill in ERP Desk and approve or reject it.
- **Data-Integrity Verification:**
  - Verify General Ledger (`tabGL Entry`) and Stock Ledger (`tabStock Ledger Entry`) match invoice lines.
- **Escalation & Communication:**
  - Inform store manager and provide audit statement.
- **Post-Incident Follow-Up:**
  - Verify cashier scanner firmware and network retry timeouts.

---

## RUNBOOK-11: Payment Webhook Failure / Razorpay Signature Mismatch

- **Detection Signal:** Customer charged on Razorpay, but subscription remains `trial` or `past_due`.
- **Immediate Containment Action:**
  - Inspect webhook error log in `tabSaaS Payment Transaction`.
- **Diagnostic Evidence to Collect:**
  - Razorpay Dashboard webhook delivery logs (HTTP status code, response body).
- **Recovery Procedure:**
  - Verify `RAZORPAY_WEBHOOK_SECRET` matches between ERP and Razorpay dashboard.
  - If signature failed due to secret mismatch, update secret and replay webhook event from Razorpay dashboard.
  - If urgent, manually activate subscription via Platform Admin console (`record_manual_payment`).
- **Data-Integrity Verification:**
  - Confirm subscription status updated to `active` and entitlement counter limits updated.
- **Escalation & Communication:**
  - Notify customer of successful reconciliation.
- **Post-Incident Follow-Up:**
  - Add webhook signature automated validation check to health test suite.

---

## RUNBOOK-12: Compromised Application Secrets or API Tokens

- **Detection Signal:** Credential detected in public repository, unauthorized API usage with service token.
- **Immediate Containment Action:**
  1. Revoke compromised token immediately in ERPNext:
     `UPDATE tabUser SET api_secret = NULL WHERE api_key = '<compromised-key>';`
  2. Generate replacement credentials.
- **Diagnostic Evidence to Collect:**
  - API access logs matching the compromised key.
- **Recovery Procedure:**
  - Update `.env` files with new credentials in production environment.
  - Restart affected dependent services (`owner-dashboard`, `windows-pos`).
- **Data-Integrity Verification:**
  - Verify legitimate services can communicate using new token.
- **Escalation & Communication:**
  - File security incident report.
- **Post-Incident Follow-Up:**
  - Perform repository-wide secret scan using git-leaks / automated script.

---

## RUNBOOK-13: Failed Application Deployment / Release Rollback

- **Detection Signal:** Post-deployment smoke tests fail, Next.js build crash on startup, or unhandled 500 errors on core routes.
- **Immediate Containment Action:**
  - Halt deployment pipeline immediately. Do NOT run destructive database migrations.
- **Diagnostic Evidence to Collect:**
  - Container logs: `docker compose logs --tail 200`
  - Next.js build output logs.
- **Recovery Procedure:**
  1. Revert Git HEAD to previous stable commit:
     `git checkout <last-known-good-commit>`
  2. Redeploy previous image/code:
     `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d --force-recreate`
  3. Rebuild Next.js owner dashboard:
     `npm run build`
- **Data-Integrity Verification:**
  - Execute automated smoke test suite:
    `node tests/integration/security_and_hardening_check.mjs`
- **Escalation & Communication:**
  - Notify release manager and development team.
- **Post-Incident Follow-Up:**
  - Conduct release post-mortem to determine why pre-deployment tests failed to catch regression.
