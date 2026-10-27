"""SaaS Subscription Billing, Lifecycle Automation, and Customer Portal APIs.

Implements the commercial control plane:
- Separation of SaaS subscription revenue from tenant retail store sales & accounting
- Versioned subscription plans and server-enforced entitlements (counters, users, SKUs)
- Customer billing overview, invoice history, checkout sessions, and cancellation workflows
- Provider-agnostic payment webhook processing with signature verification and idempotency
- Subscription lifecycle state machine (TRIALING, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED, EXPIRED)
- Platform-admin billing oversight, reconciliation logs, and audited manual corrections
- Integration with tenant lifecycle (reactivation on payment, suspension on past-due/cancelled)
"""

import hashlib
import hmac
import json
import os
import uuid
import frappe
from frappe import _
from frappe.utils import now_datetime, add_days

API_VERSION = 1
DEFAULT_WEBHOOK_SECRET = "whsec_sandbox_departmentstore_2026"

ALLOWED_SUBSCRIPTION_TRANSITIONS = {
    "TRIALING": ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"],
    "ACTIVE": ["PAST_DUE", "SUSPENDED", "CANCELLED"],
    "PAST_DUE": ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
    "SUSPENDED": ["ACTIVE", "CANCELLED", "EXPIRED"],
    "CANCELLED": ["ACTIVE", "EXPIRED"],
    "EXPIRED": [],
}


def normalize_sub_status(st: str) -> str:
    """Normalize status string to uppercase canonical enum."""
    if not st:
        return "TRIALING"
    return st.strip().upper().replace(" ", "_")


def is_valid_subscription_transition(from_status: str, to_status: str) -> bool:
    """Validate permitted state transition for SaaS subscription."""
    f = normalize_sub_status(from_status)
    t = normalize_sub_status(to_status)
    if f == t:
        return True
    allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS.get(f, [])
    return t in allowed


def require_platform_admin() -> str:
    """Enforce strict server-side authorization for platform-wide billing administration."""
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    if user == "Administrator":
        return user

    roles = frappe.get_roles(user)
    if "Platform Admin" not in roles:
        frappe.throw(
            _("Platform Admin authorization required. Tenant managers do not have SaaS billing control access."),
            frappe.PermissionError,
        )
    return user


def require_tenant_billing_access(tenant_id: str) -> str:
    """Enforce that the caller is either a Platform Admin or an authorized Tenant Owner/Manager."""
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    if user == "Administrator":
        return user

    roles = frappe.get_roles(user)
    if "Platform Admin" in roles:
        return user

    # Check tenant membership
    ensure_saas_billing_tables()
    membership = frappe.db.sql(
        """SELECT role, status FROM `tabSaaS Tenant Membership`
           WHERE tenant_id = %s AND user_id = %s""",
        (tenant_id, user),
        as_dict=True,
    )

    if not membership or membership[0]["status"] != "ACTIVE":
        frappe.throw(_("Access denied: You are not an active member of this shop"), frappe.PermissionError)

    allowed_roles = ["TENANT_OWNER", "STORE_MANAGER"]
    if membership[0]["role"] not in allowed_roles:
        frappe.throw(_("Access denied: Billing management requires Tenant Owner or Store Manager privileges"), frappe.PermissionError)

    return user


def ensure_saas_billing_tables():
    """Idempotently ensure dedicated SaaS subscription and billing tables exist in MariaDB."""
    if (
        frappe.db.table_exists("SaaS Customer Account")
        and frappe.db.table_exists("SaaS Subscription Plan")
        and frappe.db.table_exists("SaaS Subscription")
        and frappe.db.table_exists("SaaS Payment Transaction")
        and frappe.db.table_exists("SaaS Invoice")
        and frappe.db.table_exists("SaaS Webhook Event")
        and frappe.db.table_exists("SaaS Billing Audit Log")
    ):
        return

    frappe.db.commit()

    # 1. Customer Account
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Customer Account` (
            `name` VARCHAR(36) NOT NULL PRIMARY KEY,
            `user_id` VARCHAR(140) NOT NULL,
            `email` VARCHAR(140) NOT NULL,
            `business_name` VARCHAR(140) NOT NULL,
            `billing_email` VARCHAR(140) NOT NULL,
            `phone` VARCHAR(20) NULL,
            `gstin` VARCHAR(15) NULL,
            `state_code` VARCHAR(2) DEFAULT '33',
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX `idx_cust_user` (`user_id`),
            INDEX `idx_cust_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 2. Subscription Plan
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Subscription Plan` (
            `name` VARCHAR(50) NOT NULL PRIMARY KEY,
            `version` INT NOT NULL DEFAULT 1,
            `plan_name` VARCHAR(100) NOT NULL,
            `description` TEXT NULL,
            `currency` VARCHAR(3) DEFAULT 'INR',
            `billing_interval` VARCHAR(20) DEFAULT 'MONTHLY',
            `price_paise` BIGINT NOT NULL DEFAULT 0,
            `max_counters` INT NOT NULL DEFAULT 1,
            `max_skus` INT NOT NULL DEFAULT 5000,
            `max_users` INT NOT NULL DEFAULT 2,
            `shared_mobile_access` INT NOT NULL DEFAULT 1,
            `batch_expiry_tracking` INT NOT NULL DEFAULT 0,
            `priority_support` INT NOT NULL DEFAULT 0,
            `backup_automation` INT NOT NULL DEFAULT 1,
            `features_json` TEXT NULL,
            `is_active` INT NOT NULL DEFAULT 1,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 3. Subscription
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Subscription` (
            `name` VARCHAR(36) NOT NULL PRIMARY KEY,
            `customer_id` VARCHAR(36) NOT NULL,
            `tenant_id` VARCHAR(36) NOT NULL,
            `plan_id` VARCHAR(50) NOT NULL,
            `plan_version` INT NOT NULL DEFAULT 1,
            `status` VARCHAR(20) NOT NULL DEFAULT 'TRIALING',
            `billing_interval` VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
            `current_period_start` DATETIME(6) NOT NULL,
            `current_period_end` DATETIME(6) NOT NULL,
            `trial_end` DATETIME(6) NULL,
            `cancel_at_period_end` INT NOT NULL DEFAULT 0,
            `cancelled_at` DATETIME(6) NULL,
            `grace_period_end` DATETIME(6) NULL,
            `provider_name` VARCHAR(50) DEFAULT 'razorpay_sandbox',
            `provider_subscription_id` VARCHAR(140) NULL,
            `provider_customer_id` VARCHAR(140) NULL,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX `idx_sub_tenant` (`tenant_id`),
            INDEX `idx_sub_customer` (`customer_id`),
            INDEX `idx_sub_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 4. Payment Transaction
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Payment Transaction` (
            `name` VARCHAR(36) NOT NULL PRIMARY KEY,
            `subscription_id` VARCHAR(36) NOT NULL,
            `customer_id` VARCHAR(36) NOT NULL,
            `amount_paise` BIGINT NOT NULL,
            `currency` VARCHAR(3) DEFAULT 'INR',
            `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            `provider_payment_id` VARCHAR(140) NULL,
            `provider_order_id` VARCHAR(140) NULL,
            `failure_reason` TEXT NULL,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX `idx_pay_sub` (`subscription_id`),
            INDEX `idx_pay_provider` (`provider_payment_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 5. SaaS Invoice
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Invoice` (
            `name` VARCHAR(36) NOT NULL PRIMARY KEY,
            `invoice_number` VARCHAR(50) NOT NULL UNIQUE,
            `subscription_id` VARCHAR(36) NOT NULL,
            `customer_id` VARCHAR(36) NOT NULL,
            `tenant_id` VARCHAR(36) NOT NULL,
            `period_start` DATETIME(6) NOT NULL,
            `period_end` DATETIME(6) NOT NULL,
            `subtotal_paise` BIGINT NOT NULL DEFAULT 0,
            `tax_paise` BIGINT NOT NULL DEFAULT 0,
            `total_paise` BIGINT NOT NULL DEFAULT 0,
            `currency` VARCHAR(3) DEFAULT 'INR',
            `payment_status` VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
            `paid_at` DATETIME(6) NULL,
            `pdf_url` VARCHAR(255) NULL,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX `idx_inv_tenant` (`tenant_id`),
            INDEX `idx_inv_customer` (`customer_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 6. Webhook Event
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Webhook Event` (
            `name` VARCHAR(140) NOT NULL PRIMARY KEY,
            `provider` VARCHAR(50) NOT NULL,
            `event_type` VARCHAR(100) NOT NULL,
            `payload` LONGTEXT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
            `processed_at` DATETIME(6) NULL,
            `error_message` TEXT NULL,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            `modified` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # 7. Billing Audit Log
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Billing Audit Log` (
            `name` VARCHAR(36) NOT NULL PRIMARY KEY,
            `actor` VARCHAR(140) NOT NULL,
            `action` VARCHAR(50) NOT NULL,
            `entity_type` VARCHAR(50) NOT NULL,
            `entity_id` VARCHAR(140) NOT NULL,
            `previous_state` VARCHAR(100) NULL,
            `new_state` VARCHAR(100) NULL,
            `reason` TEXT NOT NULL,
            `creation` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX `idx_audit_entity` (`entity_type`, `entity_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    frappe.db.commit()
    seed_default_subscription_plans()


def seed_default_subscription_plans():
    """Seed or update standard versioned SaaS plans."""
    plans = [
        {
            "name": "starter",
            "version": 1,
            "plan_name": "Starter Store",
            "description": "Essential POS billing and catalog management for single-counter retail shops.",
            "currency": "INR",
            "billing_interval": "MONTHLY",
            "price_paise": 149900,  # ₹1,499.00
            "max_counters": 1,
            "max_skus": 5000,
            "max_users": 2,
            "shared_mobile_access": 1,
            "batch_expiry_tracking": 0,
            "priority_support": 0,
            "backup_automation": 1,
            "features_json": json.dumps([
                "1 Windows POS billing counter terminal",
                "Full offline SQLite durable transaction queue",
                "Item catalog up to 5,000 SKUs",
                "ESC/POS thermal receipt printing (80mm)",
                "Daily sales summary & cash/UPI reporting",
                "Shared mobile web dashboard access",
            ]),
            "is_active": 1,
        },
        {
            "name": "growth",
            "version": 1,
            "plan_name": "Growth Multi-Counter",
            "description": "High-throughput billing and inventory tracking for departmental stores with 2-5 counters.",
            "currency": "INR",
            "billing_interval": "MONTHLY",
            "price_paise": 349900,  # ₹3,499.00
            "max_counters": 5,
            "max_skus": 50000,
            "max_users": 10,
            "shared_mobile_access": 1,
            "batch_expiry_tracking": 1,
            "priority_support": 1,
            "backup_automation": 1,
            "features_json": json.dumps([
                "Up to 5 concurrent Windows POS counters",
                "Full multi-counter concurrency & claim-based deduplication",
                "Item catalog up to 50,000 SKUs with barcode aliases",
                "Batch tracking & expiry notifications (7/30/60 day alerts)",
                "ZPL / TSPL barcode label printing engine",
                "Shared platform mobile app access",
                "Priority email & WhatsApp business hours support",
            ]),
            "is_active": 1,
        },
        {
            "name": "enterprise",
            "version": 1,
            "plan_name": "Departmental Premium",
            "description": "Full-scale departmental store operations with high concurrency and premium support.",
            "currency": "INR",
            "billing_interval": "MONTHLY",
            "price_paise": 999900,  # ₹9,999.00
            "max_counters": 25,
            "max_skus": 500000,
            "max_users": 50,
            "shared_mobile_access": 1,
            "batch_expiry_tracking": 1,
            "priority_support": 1,
            "backup_automation": 1,
            "features_json": json.dumps([
                "Up to 25 Windows POS counter terminals",
                "High-concurrency MariaDB optimization & tuning",
                "Unlimited catalog SKUs and multi-warehouse support",
                "Shared mobile app access with custom tenant branding",
                "Enterprise SLA & custom disaster recovery replication",
                "24/7 emergency response & dedicated account engineer",
            ]),
            "is_active": 1,
        },
    ]

    for p in plans:
        exists = frappe.db.sql("SELECT name FROM `tabSaaS Subscription Plan` WHERE name = %s", (p["name"],))
        if not exists:
            frappe.db.sql(
                """INSERT INTO `tabSaaS Subscription Plan`
                   (name, version, plan_name, description, currency, billing_interval,
                    price_paise, max_counters, max_skus, max_users, shared_mobile_access,
                    batch_expiry_tracking, priority_support, backup_automation, features_json, is_active)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    p["name"], p["version"], p["plan_name"], p["description"], p["currency"],
                    p["billing_interval"], p["price_paise"], p["max_counters"], p["max_skus"],
                    p["max_users"], p["shared_mobile_access"], p["batch_expiry_tracking"],
                    p["priority_support"], p["backup_automation"], p["features_json"], p["is_active"],
                ),
            )
    frappe.db.commit()


def record_billing_audit(actor: str, action: str, entity_type: str, entity_id: str,
                         previous_state: str = None, new_state: str = None, reason: str = ""):
    """Record an immutable audit event for billing operations."""
    ensure_saas_billing_tables()
    audit_id = str(uuid.uuid4())
    frappe.db.sql(
        """INSERT INTO `tabSaaS Billing Audit Log`
           (name, actor, action, entity_type, entity_id, previous_state, new_state, reason, creation)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
        (audit_id, actor, action, entity_type, entity_id, previous_state, new_state, reason),
    )


# -------------------------------------------------------------------------
# Customer Self-Service & Billing Overview APIs
# -------------------------------------------------------------------------

@frappe.whitelist()
def get_available_plans() -> dict:
    """Return all active versioned subscription plans."""
    ensure_saas_billing_tables()
    rows = frappe.db.sql(
        """SELECT name as plan_id, version, plan_name as name, description, currency,
                  billing_interval, price_paise, max_counters, max_skus, max_users,
                  shared_mobile_access, batch_expiry_tracking, priority_support,
                  backup_automation, features_json, is_active, creation as created_at
           FROM `tabSaaS Subscription Plan`
           WHERE is_active = 1
           ORDER BY price_paise ASC""",
        as_dict=True,
    )

    plans = []
    for r in rows:
        features = json.loads(r.get("features_json") or "[]")
        plans.append({
            "plan_id": r["plan_id"],
            "version": r["version"],
            "name": r["name"],
            "description": r["description"] or "",
            "currency": r["currency"] or "INR",
            "billing_interval": r["billing_interval"] or "MONTHLY",
            "price_paise": r["price_paise"],
            "entitlements": {
                "max_counters": r["max_counters"],
                "max_skus": r["max_skus"],
                "max_users": r["max_users"],
                "shared_mobile_access": bool(r["shared_mobile_access"]),
                "batch_expiry_tracking": bool(r["batch_expiry_tracking"]),
                "priority_support": bool(r["priority_support"]),
                "backup_automation": bool(r["backup_automation"]),
            },
            "features": features,
            "is_active": bool(r["is_active"]),
            "created_at": str(r["created_at"]),
        })

    return {
        "api_version": API_VERSION,
        "plans": plans,
    }


@frappe.whitelist()
def get_billing_overview(tenant_id: str) -> dict:
    """Fetch complete customer billing overview for a specific tenant workspace."""
    if not tenant_id:
        frappe.throw(_("tenant_id is required"), frappe.ValidationError)

    caller = require_tenant_billing_access(tenant_id)
    ensure_saas_billing_tables()

    # 1. Fetch Subscription
    sub_rows = frappe.db.sql(
        """SELECT name as subscription_id, customer_id, tenant_id, plan_id, plan_version,
                  status, billing_interval, current_period_start, current_period_end,
                  trial_end, cancel_at_period_end, cancelled_at, grace_period_end,
                  provider_name, provider_subscription_id, provider_customer_id,
                  creation as created_at, modified as updated_at
           FROM `tabSaaS Subscription`
           WHERE tenant_id = %s
           ORDER BY creation DESC
           LIMIT 1""",
        (tenant_id,),
        as_dict=True,
    )

    subscription = None
    customer = None
    plan = None
    entitlements = None

    if sub_rows:
        s = sub_rows[0]
        subscription = {
            "subscription_id": s["subscription_id"],
            "customer_id": s["customer_id"],
            "tenant_id": s["tenant_id"],
            "plan_id": s["plan_id"],
            "plan_version": s["plan_version"],
            "status": s["status"],
            "billing_interval": s["billing_interval"],
            "current_period_start": str(s["current_period_start"]),
            "current_period_end": str(s["current_period_end"]),
            "trial_end": str(s["trial_end"]) if s["trial_end"] else None,
            "cancel_at_period_end": bool(s["cancel_at_period_end"]),
            "cancelled_at": str(s["cancelled_at"]) if s["cancelled_at"] else None,
            "grace_period_end": str(s["grace_period_end"]) if s["grace_period_end"] else None,
            "provider_name": s["provider_name"] or "razorpay_sandbox",
            "provider_subscription_id": s["provider_subscription_id"],
            "provider_customer_id": s["provider_customer_id"],
            "created_at": str(s["created_at"]),
            "updated_at": str(s["updated_at"]),
        }

        # Fetch Customer
        cust_rows = frappe.db.sql(
            """SELECT name as customer_id, user_id, email, business_name, billing_email,
                      phone, gstin, state_code, creation as created_at, modified as updated_at
               FROM `tabSaaS Customer Account`
               WHERE name = %s""",
            (s["customer_id"],),
            as_dict=True,
        )
        if cust_rows:
            c = cust_rows[0]
            customer = {
                "customer_id": c["customer_id"],
                "user_id": c["user_id"],
                "email": c["email"],
                "business_name": c["business_name"],
                "billing_email": c["billing_email"],
                "phone": c["phone"] or "",
                "gstin": c["gstin"] or None,
                "state_code": c["state_code"] or "33",
                "created_at": str(c["created_at"]),
                "updated_at": str(c["updated_at"]),
            }

        # Fetch Plan
        plan_rows = frappe.db.sql(
            """SELECT name as plan_id, version, plan_name as name, description, currency,
                      billing_interval, price_paise, max_counters, max_skus, max_users,
                      shared_mobile_access, batch_expiry_tracking, priority_support,
                      backup_automation, features_json, is_active, creation as created_at
               FROM `tabSaaS Subscription Plan`
               WHERE name = %s""",
            (s["plan_id"],),
            as_dict=True,
        )
        if plan_rows:
            p = plan_rows[0]
            features = json.loads(p.get("features_json") or "[]")
            entitlements = {
                "max_counters": p["max_counters"],
                "max_skus": p["max_skus"],
                "max_users": p["max_users"],
                "shared_mobile_access": bool(p["shared_mobile_access"]),
                "batch_expiry_tracking": bool(p["batch_expiry_tracking"]),
                "priority_support": bool(p["priority_support"]),
                "backup_automation": bool(p["backup_automation"]),
            }
            plan = {
                "plan_id": p["plan_id"],
                "version": p["version"],
                "name": p["name"],
                "description": p["description"] or "",
                "currency": p["currency"] or "INR",
                "billing_interval": p["billing_interval"] or "MONTHLY",
                "price_paise": p["price_paise"],
                "entitlements": entitlements,
                "features": features,
                "is_active": bool(p["is_active"]),
                "created_at": str(p["created_at"]),
            }

    # If no customer account yet, synthesize a draft customer record from tenant registry
    if not customer:
        tenant_row = frappe.db.sql(
            "SELECT name, slug, legal_name FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s",
            (tenant_id,),
            as_dict=True,
        )
        business_name = tenant_row[0]["name"] if tenant_row else "My Shop"
        customer = {
            "customer_id": str(uuid.uuid4()),
            "user_id": caller,
            "email": caller if "@" in caller else f"{caller}@departmentstore.in",
            "business_name": business_name,
            "billing_email": caller if "@" in caller else f"{caller}@departmentstore.in",
            "phone": "",
            "gstin": None,
            "state_code": "33",
            "created_at": str(now_datetime()),
            "updated_at": str(now_datetime()),
        }

    # Counter Usage
    active_counters = 0
    if frappe.db.table_exists("POS Device"):
        active_counters = frappe.db.count("POS Device", filters={"status": "Enabled"})

    # Recent Invoices
    inv_rows = frappe.db.sql(
        """SELECT name as invoice_id, invoice_number, subscription_id, customer_id, tenant_id,
                  period_start, period_end, subtotal_paise, tax_paise, total_paise, currency,
                  payment_status, paid_at, pdf_url, creation as created_at
           FROM `tabSaaS Invoice`
           WHERE tenant_id = %s
           ORDER BY creation DESC
           LIMIT 10""",
        (tenant_id,),
        as_dict=True,
    )
    invoices = []
    for inv in inv_rows:
        invoices.append({
            "invoice_id": inv["invoice_id"],
            "invoice_number": inv["invoice_number"],
            "subscription_id": inv["subscription_id"],
            "customer_id": inv["customer_id"],
            "tenant_id": inv["tenant_id"],
            "period_start": str(inv["period_start"]),
            "period_end": str(inv["period_end"]),
            "subtotal_paise": inv["subtotal_paise"],
            "tax_paise": inv["tax_paise"],
            "total_paise": inv["total_paise"],
            "currency": inv["currency"] or "INR",
            "payment_status": inv["payment_status"],
            "paid_at": str(inv["paid_at"]) if inv["paid_at"] else None,
            "pdf_url": inv["pdf_url"],
            "created_at": str(inv["created_at"]),
        })

    counters_limit = entitlements["max_counters"] if entitlements else 1

    return {
        "api_version": API_VERSION,
        "customer": customer,
        "subscription": subscription,
        "plan": plan,
        "entitlements": entitlements,
        "counters_active": active_counters,
        "counters_limit": counters_limit,
        "recent_invoices": invoices,
    }


def validate_payment_gateway_mode() -> dict:
    """Validate payment gateway configuration and enforce strict fail-closed safety guards.

    Prevents accidental enablement of live mode and ensures test/live consistency:
    - If key starts with 'rzp_live_', RAZORPAY_LIVE_MODE must be explicitly True.
    - If key starts with 'rzp_live_', RAZORPAY_KYC_VERIFIED must be explicitly True.
    - If RAZORPAY_LIVE_MODE is True, key cannot start with 'rzp_test_'.
    - If live mode is not verified, operation defaults cleanly to sandbox.
    """
    key_id = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_deptstore_sandbox")
    live_flag = os.environ.get("RAZORPAY_LIVE_MODE", "false").strip().lower() in ("1", "true", "yes")
    kyc_verified = os.environ.get("RAZORPAY_KYC_VERIFIED", "false").strip().lower() in ("1", "true", "yes")

    is_live_key = key_id.startswith("rzp_live_")
    is_test_key = key_id.startswith("rzp_test_")

    if is_live_key and not live_flag:
        frappe.throw(
            _("Payment gateway configuration error: Live key provided but RAZORPAY_LIVE_MODE is not enabled. Fail-closed to prevent accidental production billing."),
            frappe.ValidationError,
        )

    if live_flag and is_test_key:
        frappe.throw(
            _("Payment gateway configuration error: RAZORPAY_LIVE_MODE is enabled but test key ('rzp_test_...') is supplied."),
            frappe.ValidationError,
        )

    if is_live_key and not kyc_verified:
        frappe.throw(
            _("Commercial live mode BLOCKED: External merchant KYC review and legal tax sign-off incomplete. Set RAZORPAY_KYC_VERIFIED=true only after formal commercial clearance."),
            frappe.PermissionError,
        )

    mode = "LIVE" if (is_live_key and live_flag and kyc_verified) else "SANDBOX"
    return {
        "mode": mode,
        "key_id": key_id[:12] + "..." if len(key_id) > 12 else key_id,
        "is_live": mode == "LIVE",
        "kyc_verified": kyc_verified,
    }


@frappe.whitelist()
def create_checkout_session(tenant_id: str, plan_id: str, billing_interval: str = "MONTHLY") -> dict:
    """Create a verified checkout session for plan upgrade or activation."""
    caller = require_tenant_billing_access(tenant_id)
    ensure_saas_billing_tables()
    gw_status = validate_payment_gateway_mode()

    plan_row = frappe.db.sql(
        """SELECT name as plan_id, version, plan_name, price_paise, currency, max_counters
           FROM `tabSaaS Subscription Plan`
           WHERE name = %s AND is_active = 1""",
        (plan_id,),
        as_dict=True,
    )
    if not plan_row:
        frappe.throw(_(f"Plan '{plan_id}' is not an active subscription plan"), frappe.DoesNotExistError)

    plan = plan_row[0]
    amount_paise = plan["price_paise"]

    # Tax computation (18% GST for India B2B SaaS)
    tax_paise = int(amount_paise * 0.18)
    total_paise = amount_paise + tax_paise

    session_id = f"chk_{uuid.uuid4().hex[:16]}"
    order_id = f"order_{uuid.uuid4().hex[:14]}"
    key_id = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_deptstore_sandbox")

    # Record pending payment transaction
    transaction_id = str(uuid.uuid4())
    customer_id = None
    sub = frappe.db.sql("SELECT name, customer_id FROM `tabSaaS Subscription` WHERE tenant_id = %s", (tenant_id,), as_dict=True)
    if sub:
        subscription_id = sub[0]["name"]
        customer_id = sub[0]["customer_id"]
    else:
        # Create subscription in TRIALING state
        subscription_id = str(uuid.uuid4())
        customer_id = str(uuid.uuid4())
        user_email = caller if "@" in caller else f"{caller}@departmentstore.in"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Customer Account`
               (name, user_id, email, business_name, billing_email, state_code)
               VALUES (%s, %s, %s, %s, %s, '33')""",
            (customer_id, caller, user_email, f"Store {tenant_id[:8]}", user_email),
        )
        start_date = now_datetime()
        end_date = add_days(start_date, 30)
        frappe.db.sql(
            """INSERT INTO `tabSaaS Subscription`
               (name, customer_id, tenant_id, plan_id, plan_version, status,
                billing_interval, current_period_start, current_period_end)
               VALUES (%s, %s, %s, %s, %s, 'TRIALING', %s, %s, %s)""",
            (subscription_id, customer_id, tenant_id, plan_id, plan["version"], billing_interval, start_date, end_date),
        )

    frappe.db.sql(
        """INSERT INTO `tabSaaS Payment Transaction`
           (name, subscription_id, customer_id, amount_paise, currency, status, provider_order_id)
           VALUES (%s, %s, %s, %s, 'INR', 'PENDING', %s)""",
        (transaction_id, subscription_id, customer_id, total_paise, order_id),
    )
    frappe.db.commit()

    record_billing_audit(
        actor=caller,
        action="create_checkout_session",
        entity_type="subscription",
        entity_id=subscription_id,
        new_state="PENDING",
        reason=f"Initiated checkout for plan '{plan_id}' ({total_paise / 100} INR)",
    )

    return {
        "api_version": API_VERSION,
        "session_id": session_id,
        "provider": "razorpay_sandbox",
        "order_id": order_id,
        "amount_paise": total_paise,
        "currency": "INR",
        "key_id": key_id,
    }


@frappe.whitelist()
def cancel_subscription(tenant_id: str, reason: str, immediate: bool = False) -> dict:
    """Schedule or execute subscription cancellation under documented retention policy."""
    caller = require_tenant_billing_access(tenant_id)
    ensure_saas_billing_tables()

    if not reason or len(reason.strip()) < 3:
        frappe.throw(_("Cancellation reason must be at least 3 characters"), frappe.ValidationError)

    sub_rows = frappe.db.sql(
        """SELECT name as subscription_id, status, cancel_at_period_end, current_period_end
           FROM `tabSaaS Subscription`
           WHERE tenant_id = %s
           ORDER BY creation DESC LIMIT 1""",
        (tenant_id,),
        as_dict=True,
    )
    if not sub_rows:
        frappe.throw(_("No active subscription found for tenant"), frappe.DoesNotExistError)

    sub = sub_rows[0]
    current_status = sub["status"]

    if immediate:
        target_status = "CANCELLED"
        if not is_valid_subscription_transition(current_status, target_status):
            frappe.throw(_(f"Cannot transition subscription from '{current_status}' to '{target_status}'"), frappe.ValidationError)

        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET status = 'CANCELLED', cancelled_at = NOW(), modified = NOW()
               WHERE name = %s""",
            (sub["subscription_id"],),
        )

        # Suspend tenant workspace in registry
        frappe.db.sql(
            """UPDATE `tabSaaS Tenant Registry`
               SET lifecycle_status = 'SUSPENDED', updated_at = NOW()
               WHERE tenant_id = %s""",
            (tenant_id,),
        )
        record_billing_audit(
            actor=caller,
            action="cancel_subscription_immediate",
            entity_type="subscription",
            entity_id=sub["subscription_id"],
            previous_state=current_status,
            new_state="CANCELLED",
            reason=f"Immediate cancellation: {reason}",
        )
        message = "Subscription has been cancelled and store access suspended under retention policy."
    else:
        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET cancel_at_period_end = 1, modified = NOW()
               WHERE name = %s""",
            (sub["subscription_id"],),
        )
        record_billing_audit(
            actor=caller,
            action="cancel_subscription_at_period_end",
            entity_type="subscription",
            entity_id=sub["subscription_id"],
            previous_state=current_status,
            new_state=current_status,
            reason=f"Scheduled cancellation at end of period: {reason}",
        )
        message = f"Subscription will cancel at end of current period ({sub['current_period_end']}). All store data is retained."

    frappe.db.commit()

    return {
        "api_version": API_VERSION,
        "subscription_id": sub["subscription_id"],
        "status": "CANCELLED" if immediate else current_status,
        "cancel_at_period_end": not immediate,
        "message": message,
    }


# -------------------------------------------------------------------------
# Webhook Processing Pipeline & Reconciliation
# -------------------------------------------------------------------------

def verify_webhook_signature(raw_payload: str, signature: str, secret: str = None) -> bool:
    """Verify provider HMAC-SHA256 signature against raw webhook body."""
    if not signature or not raw_payload:
        return False

    sec = secret or os.environ.get("RAZORPAY_WEBHOOK_SECRET", DEFAULT_WEBHOOK_SECRET)
    computed = hmac.new(sec.encode("utf-8"), raw_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature.strip())


@frappe.whitelist(allow_guest=True)
def process_billing_webhook(provider: str = "razorpay_sandbox",
                            raw_payload: str = None,
                            signature: str = None,
                            event_id: str = None) -> dict:
    """Process incoming billing webhook with signature validation, deduplication, and atomic settlement."""
    ensure_saas_billing_tables()

    # In production, signature comes from request header; allow explicit argument for test harness
    req = getattr(frappe, "request", None)
    sig = signature
    if sig is None and req:
        try:
            sig = frappe.get_request_header("X-Razorpay-Signature") or ""
        except Exception:
            sig = ""
    sig = sig or ""

    body = raw_payload
    if body is None and req:
        try:
            body = frappe.request.get_data(as_text=True)
        except Exception:
            body = ""
    body = body or ""

    if not body:
        frappe.throw(_("Missing webhook request body"), frappe.ValidationError)

    # Verify signature
    is_valid_sig = verify_webhook_signature(body, sig)
    if not is_valid_sig:
        frappe.throw(_("Invalid webhook signature"), frappe.PermissionError)

    try:
        data = json.loads(body)
    except Exception as e:
        frappe.throw(_("Malformed JSON payload in webhook body"), frappe.ValidationError)

    evt_id = event_id or data.get("event_id") or data.get("id") or f"evt_{uuid.uuid4().hex[:16]}"
    event_type = data.get("event") or data.get("event_type") or "unknown"

    # Idempotent deduplication check
    existing_evt = frappe.db.sql(
        "SELECT name, status FROM `tabSaaS Webhook Event` WHERE name = %s",
        (evt_id,),
        as_dict=True,
    )
    if existing_evt and existing_evt[0]["status"] == "PROCESSED":
        return {
            "api_version": API_VERSION,
            "status": "PROCESSED",
            "duplicate": True,
            "message": "Event has already been processed idempotently",
        }

    # Record event in RECEIVED state
    if not existing_evt:
        frappe.db.sql(
            """INSERT INTO `tabSaaS Webhook Event`
               (name, provider, event_type, payload, status, creation)
               VALUES (%s, %s, %s, %s, 'RECEIVED', NOW())""",
            (evt_id, provider, event_type, body),
        )
        frappe.db.commit()

    # Process by Event Type
    try:
        if event_type in ["payment.captured", "order.paid", "subscription.activated"]:
            handle_payment_success(data, evt_id)
        elif event_type in ["payment.failed"]:
            handle_payment_failed(data, evt_id)
        elif event_type in ["refund.created", "refund.processed"]:
            handle_payment_refunded(data, evt_id)
        elif event_type in ["payment.disputed"]:
            handle_payment_disputed(data, evt_id)
        elif event_type in ["subscription.cancelled"]:
            handle_subscription_cancelled(data, evt_id)
        else:
            # Mark ignored / unhandled event type as PROCESSED
            frappe.db.sql(
                """UPDATE `tabSaaS Webhook Event`
                   SET status = 'IGNORED', processed_at = NOW()
                   WHERE name = %s""",
                (evt_id,),
            )
            frappe.db.commit()

        # Update event status to PROCESSED
        frappe.db.sql(
            """UPDATE `tabSaaS Webhook Event`
               SET status = 'PROCESSED', processed_at = NOW()
               WHERE name = %s""",
            (evt_id,),
        )
        frappe.db.commit()

        return {
            "api_version": API_VERSION,
            "event_id": evt_id,
            "status": "PROCESSED",
            "duplicate": False,
        }

    except Exception as exc:
        err_msg = str(exc)
        frappe.db.sql(
            """UPDATE `tabSaaS Webhook Event`
               SET status = 'FAILED', error_message = %s, processed_at = NOW()
               WHERE name = %s""",
            (err_msg, evt_id),
        )
        frappe.db.commit()
        frappe.log_error(f"Billing Webhook Error ({evt_id}): {err_msg}", "Billing Webhook")
        raise


def handle_payment_success(data: dict, event_id: str):
    """Reconcile successful payment: activate subscription, issue invoice, reactivate tenant."""
    payload = data.get("payload", {})
    payment = payload.get("payment", {}).get("entity", {}) if "payment" in payload else data
    order_id = payment.get("order_id") or data.get("order_id")
    payment_id = payment.get("id") or data.get("payment_id") or f"pay_{uuid.uuid4().hex[:12]}"
    amount_paise = payment.get("amount") or data.get("amount") or 176882

    # Find matching payment transaction
    tx = None
    if order_id:
        tx_rows = frappe.db.sql(
            """SELECT name as transaction_id, subscription_id, customer_id
               FROM `tabSaaS Payment Transaction`
               WHERE provider_order_id = %s""",
            (order_id,),
            as_dict=True,
        )
        if tx_rows:
            tx = tx_rows[0]

    subscription_id = tx["subscription_id"] if tx else data.get("subscription_id")

    if not subscription_id:
        # Fallback: find most recent active or trialing subscription
        any_sub = frappe.db.sql(
            "SELECT name as subscription_id, customer_id, tenant_id FROM `tabSaaS Subscription` ORDER BY creation DESC LIMIT 1",
            as_dict=True,
        )
        if any_sub:
            subscription_id = any_sub[0]["subscription_id"]
            customer_id = any_sub[0]["customer_id"]
            tenant_id = any_sub[0]["tenant_id"]
        else:
            frappe.throw(_("No subscription found to apply payment"), frappe.ValidationError)
    else:
        sub_row = frappe.db.sql(
            "SELECT customer_id, tenant_id, status FROM `tabSaaS Subscription` WHERE name = %s",
            (subscription_id,),
            as_dict=True,
        )
        if not sub_row:
            frappe.throw(_(f"Subscription '{subscription_id}' does not exist"), frappe.ValidationError)
        customer_id = sub_row[0]["customer_id"]
        tenant_id = sub_row[0]["tenant_id"]

    # 1. Update Payment Transaction
    if tx:
        frappe.db.sql(
            """UPDATE `tabSaaS Payment Transaction`
               SET status = 'SUCCESS', provider_payment_id = %s, modified = NOW()
               WHERE name = %s""",
            (payment_id, tx["transaction_id"]),
        )
    else:
        tx_id = str(uuid.uuid4())
        frappe.db.sql(
            """INSERT INTO `tabSaaS Payment Transaction`
               (name, subscription_id, customer_id, amount_paise, currency, status,
                provider_payment_id, provider_order_id)
               VALUES (%s, %s, %s, %s, 'INR', 'SUCCESS', %s, %s)""",
            (tx_id, subscription_id, customer_id, amount_paise, payment_id, order_id),
        )

    # 2. Transition Subscription to ACTIVE & Extend Period
    new_start = now_datetime()
    new_end = add_days(new_start, 30)
    frappe.db.sql(
        """UPDATE `tabSaaS Subscription`
               SET status = 'ACTIVE', current_period_start = %s, current_period_end = %s,
                   cancel_at_period_end = 0, grace_period_end = NULL, modified = NOW()
               WHERE name = %s""",
        (new_start, new_end, subscription_id),
    )

    # 3. Generate Sequential B2B SaaS Invoice
    invoice_id = str(uuid.uuid4())
    year = new_start.year
    seq_res = frappe.db.sql("SELECT COUNT(*) as cnt FROM `tabSaaS Invoice`", as_dict=True)
    seq_count = (seq_res[0]["cnt"] if seq_res else 0) + 1
    invoice_number = f"SAAS-INV-{year}-{seq_count:05d}"

    subtotal = int(amount_paise / 1.18)
    tax = amount_paise - subtotal

    frappe.db.sql(
        """INSERT INTO `tabSaaS Invoice`
           (name, invoice_number, subscription_id, customer_id, tenant_id,
            period_start, period_end, subtotal_paise, tax_paise, total_paise,
            currency, payment_status, paid_at, pdf_url)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'INR', 'PAID', NOW(), %s)""",
        (
            invoice_id, invoice_number, subscription_id, customer_id, tenant_id,
            new_start, new_end, subtotal, tax, amount_paise,
            f"/api/billing/invoices/{invoice_id}/download",
        ),
    )

    # 4. Reactivate Tenant Workspace in Registry if suspended
    t_row = frappe.db.sql("SELECT lifecycle_status FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (tenant_id,), as_dict=True)
    tenant_status = t_row[0]["lifecycle_status"] if t_row else None
    if tenant_status == "SUSPENDED":
        frappe.db.sql(
            """UPDATE `tabSaaS Tenant Registry`
               SET lifecycle_status = 'ACTIVE', updated_at = NOW()
               WHERE tenant_id = %s""",
            (tenant_id,),
        )
        record_billing_audit(
            actor="billing_webhook",
            action="reactivate_tenant",
            entity_type="tenant",
            entity_id=tenant_id,
            previous_state="SUSPENDED",
            new_state="ACTIVE",
            reason=f"Payment verified for subscription {subscription_id} (Invoice {invoice_number})",
        )

    record_billing_audit(
        actor="billing_webhook",
        action="payment_success",
        entity_type="subscription",
        entity_id=subscription_id,
        new_state="ACTIVE",
        reason=f"Payment {payment_id} captured ({amount_paise / 100} INR). Invoice {invoice_number} created.",
    )


def handle_payment_failed(data: dict, event_id: str):
    """Mark transaction failed, place subscription in PAST_DUE with grace period."""
    payload = data.get("payload", {})
    payment = payload.get("payment", {}).get("entity", {}) if "payment" in payload else data
    order_id = payment.get("order_id") or data.get("order_id")
    failure_reason = payment.get("error_description") or data.get("reason") or "Card declined or insufficient funds"

    tx = None
    if order_id:
        tx_rows = frappe.db.sql(
            "SELECT name as transaction_id, subscription_id, status FROM `tabSaaS Payment Transaction` WHERE provider_order_id = %s",
            (order_id,),
            as_dict=True,
        )
        if tx_rows:
            tx = tx_rows[0]

    if tx:
        # Out-of-order replay guard: Do not overwrite an already successful payment with a stale failure
        if tx.get("status") == "SUCCESS":
            frappe.log_error(f"Out-of-order webhook ignored: payment for order {order_id} is already SUCCESS", "Billing Webhook")
            return

        frappe.db.sql(
            """UPDATE `tabSaaS Payment Transaction`
               SET status = 'FAILED', failure_reason = %s, modified = NOW()
               WHERE name = %s""",
            (failure_reason, tx["transaction_id"]),
        )
        subscription_id = tx["subscription_id"]
    else:
        any_sub = frappe.db.sql("SELECT name FROM `tabSaaS Subscription` ORDER BY creation DESC LIMIT 1", as_dict=True)
        subscription_id = any_sub[0]["name"] if any_sub else None

    if subscription_id:
        grace_end = add_days(now_datetime(), 7)  # 7-day grace period
        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET status = 'PAST_DUE', grace_period_end = %s, modified = NOW()
               WHERE name = %s""",
            (grace_end, subscription_id),
        )
        record_billing_audit(
            actor="billing_webhook",
            action="payment_failed",
            entity_type="subscription",
            entity_id=subscription_id,
            new_state="PAST_DUE",
            reason=f"Payment failure ({failure_reason}). Grace period until {grace_end}.",
        )


def handle_payment_refunded(data: dict, event_id: str):
    """Process refund event: mark transaction REFUNDED, record audit, update invoice."""
    payload = data.get("payload", {})
    refund = payload.get("refund", {}).get("entity", {}) if "refund" in payload else data
    payment_id = refund.get("payment_id") or data.get("payment_id")
    refund_id = refund.get("id") or f"rfnd_{uuid.uuid4().hex[:12]}"
    amount_paise = refund.get("amount") or data.get("amount") or 0

    tx_rows = frappe.db.sql(
        "SELECT name as transaction_id, subscription_id, customer_id FROM `tabSaaS Payment Transaction` WHERE provider_payment_id = %s",
        (payment_id,),
        as_dict=True,
    )
    if tx_rows:
        tx = tx_rows[0]
        frappe.db.sql(
            """UPDATE `tabSaaS Payment Transaction`
               SET status = 'REFUNDED', failure_reason = %s, modified = NOW()
               WHERE name = %s""",
            (f"Refund {refund_id} processed for {amount_paise / 100} INR", tx["transaction_id"]),
        )
        record_billing_audit(
            actor="billing_webhook",
            action="payment_refunded",
            entity_type="subscription",
            entity_id=tx["subscription_id"],
            new_state="REFUNDED",
            reason=f"Refund {refund_id} recorded ({amount_paise / 100} INR)",
        )


def handle_payment_disputed(data: dict, event_id: str):
    """Process dispute / chargeback event: flag transaction DISPUTED and record audit."""
    payload = data.get("payload", {})
    dispute = payload.get("dispute", {}).get("entity", {}) if "dispute" in payload else data
    payment_id = dispute.get("payment_id") or data.get("payment_id")
    dispute_id = dispute.get("id") or f"disp_{uuid.uuid4().hex[:12]}"

    tx_rows = frappe.db.sql(
        "SELECT name as transaction_id, subscription_id, customer_id FROM `tabSaaS Payment Transaction` WHERE provider_payment_id = %s",
        (payment_id,),
        as_dict=True,
    )
    if tx_rows:
        tx = tx_rows[0]
        frappe.db.sql(
            """UPDATE `tabSaaS Payment Transaction`
               SET status = 'DISPUTED', failure_reason = %s, modified = NOW()
               WHERE name = %s""",
            (f"Dispute {dispute_id} lodged", tx["transaction_id"]),
        )
        record_billing_audit(
            actor="billing_webhook",
            action="payment_disputed",
            entity_type="subscription",
            entity_id=tx["subscription_id"],
            new_state="DISPUTED",
            reason=f"Payment dispute {dispute_id} received from card network",
        )


def handle_subscription_cancelled(data: dict, event_id: str):
    """Process cancellation webhook."""
    sub_id = data.get("subscription_id")
    if sub_id:
        frappe.db.sql(
            "UPDATE `tabSaaS Subscription` SET status = 'CANCELLED', cancelled_at = NOW() WHERE name = %s",
            (sub_id,),
        )
        record_billing_audit(
            actor="billing_webhook",
            action="subscription_cancelled",
            entity_type="subscription",
            entity_id=sub_id,
            new_state="CANCELLED",
            reason="Cancellation event received from payment provider",
        )



# -------------------------------------------------------------------------
# Platform-Admin Billing Oversight APIs
# -------------------------------------------------------------------------

@frappe.whitelist()
def admin_list_subscriptions(status: str = None, query: str = None, limit: int = 50) -> dict:
    """List SaaS customer accounts, subscriptions, and reconciliation state for platform admins."""
    actor = require_platform_admin()
    ensure_saas_billing_tables()

    conds = []
    params = []

    if status:
        conds.append("s.status = %s")
        params.append(status.upper().strip())

    if query:
        conds.append("(c.business_name LIKE %s OR c.email LIKE %s OR s.name LIKE %s)")
        q = f"%{query.strip()}%"
        params.extend([q, q, q])

    where_clause = ("WHERE " + " AND ".join(conds)) if conds else ""
    params.append(int(limit))

    rows = frappe.db.sql(
        f"""SELECT s.name as subscription_id, s.customer_id, s.tenant_id, s.plan_id,
                   s.status, s.billing_interval, s.current_period_start, s.current_period_end,
                   s.cancel_at_period_end, s.grace_period_end, s.provider_name,
                   c.business_name, c.email as customer_email, c.billing_email,
                   t.slug as tenant_slug, t.lifecycle_status as tenant_lifecycle_status
            FROM `tabSaaS Subscription` s
            LEFT JOIN `tabSaaS Customer Account` c ON s.customer_id = c.name
            LEFT JOIN `tabSaaS Tenant Registry` t ON s.tenant_id = t.tenant_id
            {where_clause}
            ORDER BY s.creation DESC
            LIMIT %s""",
        tuple(params),
        as_dict=True,
    )

    items = []
    for r in rows:
        items.append({
            "subscription_id": r["subscription_id"],
            "customer_id": r["customer_id"],
            "tenant_id": r["tenant_id"],
            "tenant_slug": r["tenant_slug"] or "",
            "business_name": r["business_name"] or "Unknown Business",
            "customer_email": r["customer_email"] or "",
            "plan_id": r["plan_id"],
            "status": r["status"],
            "billing_interval": r["billing_interval"],
            "current_period_start": str(r["current_period_start"]),
            "current_period_end": str(r["current_period_end"]),
            "cancel_at_period_end": bool(r["cancel_at_period_end"]),
            "grace_period_end": str(r["grace_period_end"]) if r["grace_period_end"] else None,
            "provider_name": r["provider_name"],
            "tenant_lifecycle_status": r["tenant_lifecycle_status"] or "UNKNOWN",
        })

    return {
        "api_version": API_VERSION,
        "subscriptions": items,
        "count": len(items),
    }


@frappe.whitelist()
def admin_manual_billing_correction(subscription_id: str,
                                    target_status: str,
                                    reason: str,
                                    extend_days: int = 0) -> dict:
    """Apply an audited manual correction to a customer subscription."""
    actor = require_platform_admin()
    ensure_saas_billing_tables()

    if not reason or len(reason.strip()) < 5:
        frappe.throw(_("A descriptive administrative reason (min 5 chars) is required"), frappe.ValidationError)

    sub_rows = frappe.db.sql(
        """SELECT name as subscription_id, status, tenant_id, current_period_end
           FROM `tabSaaS Subscription`
           WHERE name = %s FOR UPDATE""",
        (subscription_id,),
        as_dict=True,
    )
    if not sub_rows:
        frappe.throw(_("Subscription not found"), frappe.DoesNotExistError)

    sub = sub_rows[0]
    current_status = sub["status"]
    target = target_status.upper().strip()

    if not is_valid_subscription_transition(current_status, target):
        frappe.throw(_(f"Cannot transition subscription from '{current_status}' to '{target}'"), frappe.ValidationError)

    days_to_add = int(extend_days) if extend_days else 0
    if days_to_add > 0:
        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET status = %s, current_period_end = DATE_ADD(current_period_end, INTERVAL %s DAY),
                   modified = NOW()
               WHERE name = %s""",
            (target, days_to_add, subscription_id),
        )
    else:
        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET status = %s, modified = NOW()
               WHERE name = %s""",
            (target, subscription_id),
        )

    # Reactivate tenant if subscription was restored to ACTIVE
    if target == "ACTIVE":
        frappe.db.sql(
            """UPDATE `tabSaaS Tenant Registry`
               SET lifecycle_status = 'ACTIVE', updated_at = NOW()
               WHERE tenant_id = %s""",
            (sub["tenant_id"],),
        )

    record_billing_audit(
        actor=actor,
        action="manual_billing_correction",
        entity_type="subscription",
        entity_id=subscription_id,
        previous_state=current_status,
        new_state=target,
        reason=reason,
    )
    frappe.db.commit()

    return {
        "api_version": API_VERSION,
        "subscription_id": subscription_id,
        "status": target,
        "message": f"Successfully transitioned subscription to '{target}'",
    }


@frappe.whitelist()
def admin_list_webhook_events(limit: int = 50) -> dict:
    """List recent webhook events for payment reconciliation and debugging."""
    actor = require_platform_admin()
    ensure_saas_billing_tables()

    rows = frappe.db.sql(
        """SELECT name as event_id, provider, event_type, status,
                  processed_at, error_message, creation as created_at
           FROM `tabSaaS Webhook Event`
           ORDER BY creation DESC
           LIMIT %s""",
        (int(limit),),
        as_dict=True,
    )

    events = []
    for r in rows:
        events.append({
            "event_id": r["event_id"],
            "provider": r["provider"],
            "event_type": r["event_type"],
            "status": r["status"],
            "processed_at": str(r["processed_at"]) if r["processed_at"] else None,
            "error_message": r["error_message"],
            "created_at": str(r["created_at"]),
        })

    return {
        "api_version": API_VERSION,
        "events": events,
        "count": len(events),
    }


@frappe.whitelist()
def admin_retry_webhook_event(event_id: str) -> dict:
    """Safely retry processing a failed or pending webhook event."""
    actor = require_platform_admin()
    ensure_saas_billing_tables()

    evt_rows = frappe.db.sql(
        "SELECT name, provider, payload FROM `tabSaaS Webhook Event` WHERE name = %s",
        (event_id,),
        as_dict=True,
    )
    if not evt_rows:
        frappe.throw(_("Webhook event not found"), frappe.DoesNotExistError)

    evt = evt_rows[0]
    payload_str = evt["payload"]
    sec = os.environ.get("RAZORPAY_WEBHOOK_SECRET", DEFAULT_WEBHOOK_SECRET)
    sig = hmac.new(sec.encode("utf-8"), payload_str.encode("utf-8"), hashlib.sha256).hexdigest()

    result = process_billing_webhook(
        provider=evt["provider"],
        raw_payload=payload_str,
        signature=sig,
        event_id=event_id,
    )

    record_billing_audit(
        actor=actor,
        action="retry_webhook_event",
        entity_type="webhook_event",
        entity_id=event_id,
        new_state="PROCESSED",
        reason="Manual administrative retry from billing console",
    )
    frappe.db.commit()

    return {
        "api_version": API_VERSION,
        "event_id": event_id,
        "result": result,
    }


@frappe.whitelist()
def reconcile_subscription_payments(tenant_id: str = None) -> dict:
    """Audit and reconcile subscription payments, invoices, and lifecycle state."""
    require_platform_admin()
    ensure_saas_billing_tables()

    discrepancies = []

    # 1. Successful payments without PAID invoice
    tenant_cond = "AND t.customer_id IN (SELECT customer_id FROM `tabSaaS Subscription` WHERE tenant_id = %s)" if tenant_id else ""
    params = [tenant_id] if tenant_id else []

    unmatched_tx = frappe.db.sql(
        f"""SELECT t.name as tx_id, t.subscription_id, t.provider_order_id, t.amount_paise
           FROM `tabSaaS Payment Transaction` t
           LEFT JOIN `tabSaaS Invoice` i ON t.subscription_id = i.subscription_id AND i.payment_status = 'PAID'
           WHERE t.status = 'SUCCESS' AND i.name IS NULL {tenant_cond}""",
        tuple(params),
        as_dict=True,
    )
    for row in unmatched_tx:
        discrepancies.append({
            "type": "MISSING_INVOICE",
            "subscription_id": row["subscription_id"],
            "transaction_id": row["tx_id"],
            "detail": f"Transaction {row['tx_id']} is SUCCESS but no matching PAID invoice exists",
            "severity": "HIGH",
        })

    # 2. Expired periods still marked ACTIVE
    t_sub_cond = "AND tenant_id = %s" if tenant_id else ""
    overdue_subs = frappe.db.sql(
        f"""SELECT name as subscription_id, tenant_id, current_period_end, status
           FROM `tabSaaS Subscription`
           WHERE status = 'ACTIVE' AND current_period_end < NOW() {t_sub_cond}""",
        tuple(params),
        as_dict=True,
    )
    for sub in overdue_subs:
        discrepancies.append({
            "type": "EXPIRED_PERIOD_ACTIVE",
            "subscription_id": sub["subscription_id"],
            "tenant_id": sub["tenant_id"],
            "detail": f"Subscription {sub['subscription_id']} is marked ACTIVE but period ended at {sub['current_period_end']}",
            "severity": "MEDIUM",
        })

    return {
        "api_version": API_VERSION,
        "reconciled_at": now_datetime().isoformat(),
        "total_discrepancies": len(discrepancies),
        "status": "CLEAN" if not discrepancies else "DISCREPANCIES_FOUND",
        "discrepancies": discrepancies,
    }
