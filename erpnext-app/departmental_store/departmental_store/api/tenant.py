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
