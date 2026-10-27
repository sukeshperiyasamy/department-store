# SaaS Onboarding Automation and Tenant Lifecycle Operations Runbook (Phase 7)

**Release Target:** `CONDITIONAL GO — supervised onboarding pilot`  
**Architecture Author:** Department Store ERP SaaS Operations & Platform Engineering  
**Version:** 1.0.0 (API v1)  
**Date:** 2026-10-27  

---

## 1. Executive Summary & Operational Goals

The Departmental Store SaaS platform serves multiple independent retail businesses while preserving:
1. Strict tenant isolation (independent Frappe sites and databases).
2. Existing ERPNext business logic (GST workflows, inventory movements, ledger accounting).
3. Durability of counter billing operations (Windows POS local SQLite outbox).

Phase 7 establishes the **multi-dimensional operations layer**:
- Decouples registration, contact verification, business review, site provisioning, hostname verification, subscription eligibility, and store access into distinct tracked dimensions.
- Eliminates premature site creation on public form submissions.
- Secures public endpoints with single-use SHA-256 hashed verification tokens, sliding-window rate limiting, and anti-enumeration protections.
- Equips platform operators with an Operations Cockpit (`/admin/operations`) for queues, audit notes, bounded retries, and manual reconciliation.
- Provides customers with a self-service status portal (`/onboarding/status`, `/onboarding/verify`) with privacy boundary enforcement and safe onboarding resumption.

---

## 2. Multi-Dimensional Lifecycle Architecture

Earlier iterations collapsed onboarding into a single status field (`status`). Phase 7 enforces six distinct dimensions to prevent operational ambiguities:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER ONBOARDING LIFECYCLE                             │
├────────────────────────────┬─────────────────────────────┬───────────────────────┤
│ Dimension                  │ Valid States                │ Authorization Rule    │
├────────────────────────────┼─────────────────────────────┼───────────────────────┤
│ 1. Contact Verification    │ PENDING, VERIFIED, EXPIRED  │ Customer token click  │
│ 2. Business Review         │ PENDING_REVIEW, APPROVED,   │ Platform Admin role   │
│                            │ REJECTED                    │ (Central site only)   │
│ 3. Site Provisioning       │ PENDING, RUNNING,           │ Platform worker /     │
│                            │ PROVISIONED, FAILED         │ Operator retry        │
│ 4. Hostname Verification   │ PENDING, VERIFIED, FAILED   │ Traefik / DNS check   │
│ 5. Subscription Status     │ TRIALING, ACTIVE, PAST_DUE, │ SaaS Billing Webhook  │
│                            │ SUSPENDED, CANCELLED        │ (HMAC-SHA256 verified)│
│ 6. Tenant Access Status    │ INACTIVE, ACTIVE,           │ Multi-gate validator  │
│                            │ SUSPENDED, ARCHIVED         │ (Prov+Host+Sub active)│
└────────────────────────────┴─────────────────────────────┴───────────────────────┘
```

### Transition Invariants
1. **Approval Guard (`canApproveOnboarding`):**
   An onboarding request **cannot** be approved while `contact_verification_status` is `PENDING` or `EXPIRED`. Attempts to approve unverified contacts throw a server-side `ValidationError`.
2. **Activation Guard (`canActivateTenant`):**
   A tenant site cannot transition to `ACTIVE` unless:
   - `provisioning_status == 'PROVISIONED'`
   - `hostname_status == 'VERIFIED'`
   - `subscription_status IN ('ACTIVE', 'TRIALING')`
3. **Destructive Guard:**
   Suspension or cancellation **never** deletes tenant MariaDB databases or backup files. Access revocation is strictly separated from data deletion.

---

## 3. Contact Verification & Token Security

### Security Rules
- **Token Hashing:** Plaintext verification tokens (`tok_<hex32>`) are transmitted once to the customer's email and never persisted. MariaDB stores only the SHA-256 digest (`token_hash`) in `tabSaaS Verification Token`.
- **Single-Use Enforcement:** When a token is verified, `is_used` is set to `1` and `verified_at` is stamped. Subsequent submissions of the spent token are rejected with `ValidationError: This verification token has already been used`.
- **Expiration Window:** Tokens expire after 24 hours (`TOKEN_EXPIRY_HOURS = 24`). Expired submissions mark `contact_verification_status = 'EXPIRED'` and prompt resend.
- **Anti-Enumeration:** The public `/api/method/...resend_verification_token` endpoint returns a generic confirmation message even if the requested email is not present in the database.
- **Rate Limiting:** Public registration and resend endpoints are throttled via `tabSaaS Rate Limit` (sliding 1-hour window, maximum 15 registrations per client IP, maximum 3 resends per email address).

---

## 4. Customer Onboarding Portal

Customers track their setup via:
- `/onboarding/status?request_id=<ID>&token=<TOKEN>`: Full 7-milestone progress stepper, current next action, token entry form, resend trigger, and workspace launch link.
- `/onboarding/verify?request_id=<ID>&token=<TOKEN>`: 1-click email landing route that marks contact verified and redirects to the tracker.

### Server-Side Privacy Authorization Boundary
Guest access to `/onboarding/status` is guarded at the API layer (`get_onboarding_journey`):
- Callers must provide **either** the matching registered email address **or** the valid verification token.
- Strangers attempting to enumerate or snoop on other stores receive `403 PermissionError`.

---

## 5. Platform Operations Cockpit (`/admin/operations`)

Authorized platform operators (`Platform Admin` role) access:
- **KPI Metrics:** Total Registrations, Pending Verification, Business Review Queue, Active Provisioning, Failed Provisioning, Active/Suspended Tenants.
- **Multi-Dimensional Queues:** Filter by status dimension (`VERIFY`, `REVIEW`, `PROVISION`, `ALL`).
- **Audit Trails:** Mandatory reason modal on rejections, retries, and status adjustments.
- **Disaster Recovery Assurance:** Live display of host backup status (`PASS`), verified rehearsal timestamp, and 14-day retention metrics.

---

## 6. Recovery & Failure Handling Guides

### Scenario A: Site Provisioning Failure
1. Operator navigates to `/admin/operations` and selects the `Provisioning & Retries` tab.
2. Identifies the failed request (status `PROVISIONING_FAILED`).
3. Clicks **Retry Job**, supplies operator rationale (e.g. `Transient lock timeout cleared; retrying bench site creation`).
4. Pipeline resets `retry_count = retry_count + 1`, logs an immutable audit entry in `tabSaaS Provisioning Audit Log`, and re-enqueues the job.
5. If retries exceed 3, manual reconciliation is performed via bench CLI inside the container.

### Scenario B: Customer Lost Verification Email
1. Customer visits `/onboarding/status?request_id=ONBOARD-...`.
2. Enters registered email address and clicks **Resend Email**.
3. System invalidates existing tokens for that request, generates a fresh single-use token, dispatches notification, and displays sandbox token in development environments.

### Scenario C: Tenant Suspension & Reactivation
1. Operator selects tenant from Platform Admin Console and clicks **Suspend Tenant**.
2. Operator provides mandatory reason (e.g. `Payment delinquency - past grace period`).
3. System transitions `lifecycle_status = 'SUSPENDED'`, revoking all API and dashboard access.
4. **Data Preservation Guarantee:** The tenant's MariaDB database (`_test_shop_...`), configuration keys, and backup dumps remain completely untouched.
5. Upon payment receipt or operator clearance, clicking **Reactivate Tenant** transitions status back to `ACTIVE`, immediately restoring billing operations.

---

## 7. Customer Notification Pipeline

The platform uses a provider-independent notification dispatcher (`tabSaaS Notification Log`):
- **Events:** `REGISTRATION_CONFIRMATION`, `EMAIL_VERIFICATION`, `REVIEW_APPROVED`, `REVIEW_REJECTED`, `PROVISIONING_COMPLETE`, `PROVISIONING_FAILED`, `TENANT_ACTIVATED`, `TENANT_SUSPENDED`, `TENANT_REACTIVATED`.
- **Deduplication:** Uses deterministic `dedup_key = MD5(request_id + event_type + dedup_suffix)`. Duplicate webhook or job events are marked `deduplicated: True` and suppressed to avoid spamming store owners.
- **Sandbox Adapter:** In development and pilot staging, notifications are recorded safely in MariaDB without external SMS/email costs or mock credential leakage.

---

## 8. Backup & Restore Assurance Evidence

- **Native Host Automation:** Configured via `deployment/backup/schedule_backup.ps1` with Windows Task Scheduler (`DepartmentalStore-ERP-Backup`) running daily at 02:00 AM IST.
- **Integrity Verification:** Automated gzip integrity tests (`gzip -t`) and SHA256SUMS checksum generation.
- **Tested Scratch Restore:** Restored dump `20261027_055810-frontend-database.sql.gz` into isolated site `scratch-restore.local`. Verified 100% data integrity (95 Sales Invoices, 501 Items, 134 POS Sale Sync Logs, all 10 feature flags matching). Dropped scratch site cleanly; production site `frontend` remained untouched.

---

## 9. Environment Variables Reference

| Variable | Scope | Purpose | Default / Example |
| --- | --- | --- | --- |
| `ERP_BASE_URL` | Dashboard Server | Base URL of central Frappe backend | `http://localhost:8080` |
| `DASHBOARD_API_KEY` | Dashboard Server | Service account API key with platform roles | In `.env.local` |
| `DASHBOARD_API_SECRET` | Dashboard Server | Service account API secret | In `.env.local` |
| `RAZORPAY_KEY_ID` | Platform Backend | Payment gateway sandbox key ID | `rzp_test_deptstore_sandbox` |
| `RAZORPAY_WEBHOOK_SECRET` | Platform Backend | HMAC-SHA256 webhook signature secret | In secure secrets vault |
| `PRIMARY_DOMAIN` | Control Plane | Wildcard domain apex | `departmentstore.in` |

---

## 10. Operational Checklist for Supervised Pilot (Conditional Go)

- [x] Multi-dimensional state machine deployed and verified in MariaDB.
- [x] Single-use SHA-256 verification token lifecycle verified with anti-enumeration.
- [x] Approval blocked when customer contact email is unverified.
- [x] Customer onboarding journey status portal (`/onboarding/status`) deployed with privacy guards.
- [x] Operations Cockpit (`/admin/operations`) active with overview KPI metrics and audit queues.
- [x] Notification deduplication pipeline active in `tabSaaS Notification Log`.
- [x] Zero credential leaks in git history, bundles, or logs.
- [x] Automated host backup scheduled and scratch-restore verified.
- [ ] Connect production SMTP provider (SendGrid / AWS SES) for live email dispatch.
- [ ] Complete staging ingress DNS-01 certificate challenge for `*.departmentstore.in`.
