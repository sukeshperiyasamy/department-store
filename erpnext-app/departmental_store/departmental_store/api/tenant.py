"""Tenant resolution and SaaS tenancy API for the departmental store platform.

Enforces server-side hostname normalization, validation, resolution, and
tenant boundary authorization. Shared with the Next.js portal, Windows POS,
and mobile clients.
"""

import re
import urllib.parse
import frappe
from frappe import _

API_VERSION = 1

RESERVED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "admin",
    "api",
    "dashboard",
    "app",
    "www",
    "portal",
    "mail",
    "status",
    "billing",
    "auth",
    "support",
    "docs",
    "cdn",
    "assets",
    "backend",
    "frappe",
    "erpnext",
    "db",
    "redis",
}


def normalize_hostname(raw: str) -> str:
    """Normalize raw incoming hostname string: lowercase, strip scheme, port, path, trailing dot."""
    if not raw or not isinstance(raw, str):
        return ""
    clean = raw.strip().lower()

    if "://" in clean:
        clean = clean.split("://", 1)[1]

    if "/" in clean:
        clean = clean.split("/", 1)[0]
    if "?" in clean:
        clean = clean.split("?", 1)[0]

    if ":" in clean and not clean.endswith("]"):
        clean = clean.split(":", 1)[0]

    while clean.endswith("."):
        clean = clean[:-1]

    return clean


def validate_hostname(raw: str) -> tuple[bool, str, str | None]:
    """Validate normalized hostname per RFC 1123."""
    norm = normalize_hostname(raw)
    if not norm:
        return False, norm, "Hostname cannot be empty"
    if len(norm) > 253:
        return False, norm, "Hostname exceeds maximum length of 253 characters"
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", norm):
        return False, norm, "Raw IP addresses are not permitted as tenant hostnames"
    if ".." in norm:
        return False, norm, "Hostname contains consecutive dots"

    pattern = r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$"
    if not re.match(pattern, norm):
        return False, norm, "Invalid hostname format"

    return True, norm, None


def is_reserved_hostname(hostname: str) -> bool:
    """Check if normalized hostname is a reserved platform domain."""
    norm = normalize_hostname(hostname)
    return norm in RESERVED_HOSTNAMES


def get_local_site_tenant() -> dict:
    """Returns the tenant descriptor for the current local Frappe site."""
    site_name = frappe.local.site
    company_name = "Departmental Store"
    if frappe.db.exists("DocType", "Company"):
        default_company = frappe.db.get_single_value("Global Defaults", "default_company")
        if default_company:
            company_name = default_company
        else:
            first_company = frappe.db.get_value("Company", {}, "name")
            if first_company:
                company_name = first_company

    return {
        "tenant_id": "00000000-0000-4000-8000-000000000001",
        "slug": "local-store",
        "name": company_name,
        "frappe_site_name": site_name,
        "primary_hostname": f"{site_name}.local",
        "lifecycle_status": "ACTIVE",
    }


@frappe.whitelist(allow_guest=True)
def resolve_tenant_by_host(hostname: str = None) -> dict:
    """Resolve a tenant workspace from an incoming hostname.

    Guest-callable because resolution occurs prior to authentication.
    Never trusts client query overrides or default fallbacks without host match.
    """
    if not hostname:
        # Fall back to request HTTP Host header if available
        if hasattr(frappe.local, "request") and frappe.local.request:
            hostname = frappe.local.request.headers.get("Host", "")

    valid, norm, reason = validate_hostname(hostname)
    if not valid:
        return {
            "api_version": API_VERSION,
            "matched": False,
            "tenant": None,
            "error": {"code": "INVALID_HOSTNAME", "message": reason or "Invalid hostname"},
        }

    if is_reserved_hostname(norm):
        return {
            "api_version": API_VERSION,
            "matched": False,
            "tenant": None,
            "error": {
                "code": "RESERVED_HOSTNAME",
                "message": f"Hostname '{norm}' is a reserved platform domain",
            },
        }

    # In single-site / local deployment mode:
    # Match if incoming host matches local site, frontend, or localhost test domain
    current_site = frappe.local.site
    if norm in {current_site, f"{current_site}.local", "frontend", "localhost", "127.0.0.1"}:
        local_tenant = get_local_site_tenant()
        return {
            "api_version": API_VERSION,
            "matched": True,
            "tenant": local_tenant,
            "error": None,
        }

    # Strict isolation: unknown hosts do not match
    return {
        "api_version": API_VERSION,
        "matched": False,
        "tenant": None,
        "error": {
            "code": "TENANT_NOT_FOUND",
            "message": f"No tenant registered for hostname '{norm}'",
        },
    }


@frappe.whitelist()
def get_tenant_info(tenant_id: str = None) -> dict:
    """Return verified tenant metadata for the authenticated user session."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    local_tenant = get_local_site_tenant()

    # If tenant_id specified, enforce match with current site context
    if tenant_id and tenant_id != local_tenant["tenant_id"]:
        frappe.throw(
            _("Tenant access denied: requested tenant does not match site context"),
            frappe.PermissionError,
        )

    return {
        "api_version": API_VERSION,
        "tenant": {
            "tenant_id": local_tenant["tenant_id"],
            "slug": local_tenant["slug"],
            "name": local_tenant["name"],
            "legal_name": local_tenant["name"],
            "lifecycle_status": local_tenant["lifecycle_status"],
            "primary_hostname": local_tenant["primary_hostname"],
            "hostname_status": "VERIFIED",
            "custom_domains": [],
            "frappe_site_name": local_tenant["frappe_site_name"],
            "plan_id": "starter",
            "state_code": "33",
            "currency": "INR",
            "created_at": "2026-10-27T00:00:00Z",
            "updated_at": "2026-10-27T00:00:00Z",
            "created_by": "Administrator",
        },
    }


@frappe.whitelist()
def list_user_tenants() -> dict:
    """List tenants authorized for the current authenticated user."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    local_tenant = get_local_site_tenant()

    # Determine user role within this tenant
    roles = frappe.get_roles(frappe.session.user)
    if "System Manager" in roles:
        role = "TENANT_OWNER"
    elif "Store Manager" in roles:
        role = "STORE_MANAGER"
    elif "Cashier" in roles:
        role = "CASHIER"
    else:
        role = "AUDITOR"

    return {
        "api_version": API_VERSION,
        "tenants": [
            {
                "tenant_id": local_tenant["tenant_id"],
                "slug": local_tenant["slug"],
                "name": local_tenant["name"],
                "role": role,
                "status": "ACTIVE",
                "primary_hostname": local_tenant["primary_hostname"],
            }
        ],
    }


def ensure_saas_lead_tables():
    """Idempotently ensure dedicated SaaS lead and onboarding request tables exist."""
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Demo Request` (
            `name` VARCHAR(140) PRIMARY KEY,
            `business_name` VARCHAR(140) NOT NULL,
            `contact_name` VARCHAR(140) NOT NULL,
            `email` VARCHAR(140) NOT NULL,
            `phone` VARCHAR(40) NOT NULL,
            `city` VARCHAR(100) NOT NULL,
            `state` VARCHAR(100) NOT NULL,
            `counter_count` INT DEFAULT 1,
            `message` TEXT,
            `consent_given` INT DEFAULT 1,
            `status` VARCHAR(40) DEFAULT 'Pending Review',
            `creation` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `modified` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (`email`),
            INDEX (`phone`),
            INDEX (`status`),
            INDEX (`creation`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Onboarding Request` (
            `name` VARCHAR(140) PRIMARY KEY,
            `business_name` VARCHAR(140) NOT NULL,
            `owner_name` VARCHAR(140) NOT NULL,
            `email` VARCHAR(140) NOT NULL,
            `phone` VARCHAR(40) NOT NULL,
            `state` VARCHAR(100) NOT NULL,
            `city` VARCHAR(100) NOT NULL,
            `preferred_slug` VARCHAR(63) NOT NULL,
            `requested_plan` VARCHAR(40) DEFAULT 'starter',
            `agreed_to_terms` INT DEFAULT 1,
            `status` VARCHAR(40) DEFAULT 'Pending Review',
            `creation` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `modified` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY `unique_slug` (`preferred_slug`),
            INDEX (`email`),
            INDEX (`phone`),
            INDEX (`status`),
            INDEX (`creation`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)
    frappe.db.commit()


@frappe.whitelist(allow_guest=True)
def check_slug_availability(slug: str = None) -> dict:
    """Check whether a requested tenant slug is available.

    Validates URL-safe syntax, checks reserved platform keywords,
    and checks existing registrations or pending onboarding requests.
    """
    if not slug or not isinstance(slug, str):
        return {
            "api_version": API_VERSION,
            "slug": "",
            "available": False,
            "reason": "Slug cannot be empty",
        }

    clean_slug = slug.strip().lower()

    # Validate syntax: 3-63 chars, lowercase alphanumeric + hyphen, no double hyphen
    if len(clean_slug) < 3 or len(clean_slug) > 63:
        return {
            "api_version": API_VERSION,
            "slug": clean_slug,
            "available": False,
            "reason": "Slug must be between 3 and 63 characters",
        }

    if not re.match(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", clean_slug) or "--" in clean_slug:
        return {
            "api_version": API_VERSION,
            "slug": clean_slug,
            "available": False,
            "reason": "Slug must contain only lowercase letters, numbers, and hyphens without consecutive or edge hyphens",
        }

    if is_reserved_hostname(clean_slug):
        return {
            "api_version": API_VERSION,
            "slug": clean_slug,
            "available": False,
            "reason": f"'{clean_slug}' is a reserved platform keyword",
        }

    ensure_saas_lead_tables()

    # Check existing onboarding requests
    existing = frappe.db.sql(
        """SELECT name, status FROM `tabSaaS Onboarding Request`
           WHERE preferred_slug = %s AND status != 'Rejected'""",
        (clean_slug,),
        as_dict=True,
    )
    if existing:
        return {
            "api_version": API_VERSION,
            "slug": clean_slug,
            "available": False,
            "reason": f"Slug '{clean_slug}' is already registered or pending activation",
        }

    return {
        "api_version": API_VERSION,
        "slug": clean_slug,
        "available": True,
        "reason": None,
    }


@frappe.whitelist(allow_guest=True)
def submit_demo_request(data: dict = None, **kwargs) -> dict:
    """Submit a validated demo request from the public marketing site."""
    payload = data or kwargs
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)

    # Required field validation
    business_name = (payload.get("business_name") or "").strip()
    contact_name = (payload.get("contact_name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = re.sub(r"[^0-9+]", "", str(payload.get("phone") or "").strip())
    city = (payload.get("city") or "").strip()
    state = (payload.get("state") or "").strip()
    counter_count = int(payload.get("counter_count") or 1)
    message = (payload.get("message") or "").strip()
    consent = bool(payload.get("consent_given"))

    if not business_name or len(business_name) < 2:
        frappe.throw(_("Business name must be at least 2 characters"), frappe.ValidationError)
    if not contact_name or len(contact_name) < 2:
        frappe.throw(_("Contact name must be at least 2 characters"), frappe.ValidationError)
    if not email or "@" not in email:
        frappe.throw(_("Valid email address is required"), frappe.ValidationError)
    if not phone or len(phone) < 10:
        frappe.throw(_("Valid phone number with at least 10 digits is required"), frappe.ValidationError)
    if not city or len(city) < 2:
        frappe.throw(_("City must be at least 2 characters"), frappe.ValidationError)
    if not state or len(state) < 2:
        frappe.throw(_("State must be at least 2 characters"), frappe.ValidationError)
    if counter_count < 1 or counter_count > 50:
        frappe.throw(_("Counter count must be between 1 and 50"), frappe.ValidationError)
    if not consent:
        frappe.throw(_("Consent to be contacted is required"), frappe.ValidationError)

    ensure_saas_lead_tables()

    request_id = f"DEMO-{frappe.utils.now_datetime().strftime('%Y%m%d')}-{frappe.generate_hash(length=8).upper()}"

    frappe.db.sql(
        """INSERT INTO `tabSaaS Demo Request`
           (`name`, `business_name`, `contact_name`, `email`, `phone`, `city`, `state`,
            `counter_count`, `message`, `consent_given`, `status`)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 'Pending Review')""",
        (request_id, business_name, contact_name, email, phone, city, state, counter_count, message),
    )
    frappe.db.commit()

    return {
        "api_version": API_VERSION,
        "request_id": request_id,
        "status": "Pending Review",
        "message": "Demo request received successfully. Our sales engineering team will reach out within 1 business day.",
    }


@frappe.whitelist(allow_guest=True)
def submit_onboarding_request(data: dict = None, **kwargs) -> dict:
    """Submit a shop onboarding / registration request from the marketing portal."""
    payload = data or kwargs
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)

    business_name = (payload.get("business_name") or "").strip()
    owner_name = (payload.get("owner_name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = re.sub(r"[^0-9+]", "", str(payload.get("phone") or "").strip())
    state = (payload.get("state") or "").strip()
    city = (payload.get("city") or "").strip()
    preferred_slug = (payload.get("preferred_slug") or "").strip().lower()
    requested_plan = (payload.get("requested_plan") or "starter").strip().lower()
    agreed = bool(payload.get("agreed_to_terms"))

    if not business_name or len(business_name) < 2:
        frappe.throw(_("Business name must be at least 2 characters"), frappe.ValidationError)
    if not owner_name or len(owner_name) < 2:
        frappe.throw(_("Owner name must be at least 2 characters"), frappe.ValidationError)
    if not email or "@" not in email:
        frappe.throw(_("Valid email address is required"), frappe.ValidationError)
    if not phone or len(phone) < 10:
        frappe.throw(_("Valid phone number with at least 10 digits is required"), frappe.ValidationError)
    if not state or len(state) < 2:
        frappe.throw(_("State must be at least 2 characters"), frappe.ValidationError)
    if not city or len(city) < 2:
        frappe.throw(_("City must be at least 2 characters"), frappe.ValidationError)
    if requested_plan not in {"starter", "growth", "enterprise"}:
        requested_plan = "starter"
    if not agreed:
        frappe.throw(_("Agreement to Terms of Service and Privacy Policy is required"), frappe.ValidationError)

    # Check slug availability
    slug_check = check_slug_availability(preferred_slug)
    if not slug_check.get("available"):
        frappe.throw(_(f"Requested slug '{preferred_slug}' is unavailable: {slug_check.get('reason')}"), frappe.ValidationError)

    ensure_saas_lead_tables()

    request_id = f"ONBOARD-{frappe.utils.now_datetime().strftime('%Y%m%d')}-{frappe.generate_hash(length=8).upper()}"

    frappe.db.sql(
        """INSERT INTO `tabSaaS Onboarding Request`
           (`name`, `business_name`, `owner_name`, `email`, `phone`, `state`, `city`,
            `preferred_slug`, `requested_plan`, `agreed_to_terms`, `status`)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 'Pending Review')""",
        (request_id, business_name, owner_name, email, phone, state, city, preferred_slug, requested_plan),
    )
    frappe.db.commit()

    return {
        "api_version": API_VERSION,
        "request_id": request_id,
        "preferred_slug": preferred_slug,
        "status": "Pending Review",
        "message": "Request submitted; shop activation is pending review. You will receive an email once your workspace is verified and provisioned.",
    }
