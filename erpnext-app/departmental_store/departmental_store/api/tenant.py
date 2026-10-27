"""Tenant resolution and SaaS tenancy API for the departmental store platform.

Enforces server-side hostname normalization, validation, resolution, and
tenant boundary authorization. Shared with the Next.js portal, Windows POS,
and mobile clients.
"""

import json
import re

import frappe
from frappe import _

API_VERSION = 1


class TenantLifecycleError(frappe.PermissionError):
    http_status_code = 403


class TenantSuspendedError(TenantLifecycleError):
    http_status_code = 403


class TenantArchivedError(TenantLifecycleError):
    http_status_code = 403


class TenantInactiveError(TenantLifecycleError):
    http_status_code = 403


class HostnameUnverifiedError(TenantLifecycleError):
    http_status_code = 403


class MembershipInactiveError(TenantLifecycleError):
    http_status_code = 403

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


def get_tenant_lifecycle_for_site(site_name: str, host: str = None) -> dict:
    """Retrieve cached or database tenant lifecycle and verification metadata for active site."""
    cache_key = f"saas_tenant_lifecycle:{site_name}"
    try:
        cached = frappe.cache().get_value(cache_key, shared=True)
        if cached and isinstance(cached, dict):
            return cached
    except Exception:
        pass

    record = None
    if frappe.db and hasattr(frappe.db, "table_exists") and frappe.db.table_exists("SaaS Tenant Registry"):
        reg_cols = [c[0] for c in frappe.db.sql("DESCRIBE `tabSaaS Tenant Registry`")]
        has_cd = "custom_domains" in reg_cols

        params = [site_name]
        where = "frappe_site_name = %s"
        if host:
            where += " OR primary_hostname = %s"
            params.append(host)
            if has_cd:
                where += " OR custom_domains LIKE %s"
                params.append(f'%"{host}"%')

        slug_candidate = site_name.split(".")[0]
        where += " OR slug = %s"
        params.append(slug_candidate)

        select_cols = (
            "tenant_id, slug, name, frappe_site_name, primary_hostname, "
            "hostname_status, lifecycle_status"
        )
        if has_cd:
            select_cols += ", custom_domains"

        try:
            rows = frappe.db.sql(
                f"""SELECT {select_cols}
                    FROM `tabSaaS Tenant Registry`
                    WHERE {where}
                    ORDER BY (frappe_site_name = %s) DESC
                    LIMIT 1""",
                tuple(params + [site_name]),
                as_dict=True,
            )
            if rows:
                r = rows[0]
                c_domains = []
                if r.get("custom_domains"):
                    try:
                        c_domains = json.loads(r["custom_domains"]) if isinstance(r["custom_domains"], str) else r["custom_domains"]
                    except Exception:
                        c_domains = []
                record = {
                    "tenant_id": r["tenant_id"],
                    "slug": r["slug"],
                    "name": r["name"],
                    "frappe_site_name": r["frappe_site_name"],
                    "primary_hostname": r["primary_hostname"],
                    "hostname_status": r["hostname_status"] or "PENDING",
                    "lifecycle_status": r["lifecycle_status"] or "PROVISIONING",
                    "custom_domains": c_domains,
                }
        except Exception:
            pass

    if not record:
        if site_name in {"frontend", "localhost", "127.0.0.1"}:
            record = {
                "tenant_id": "00000000-0000-4000-8000-000000000001",
                "slug": "local-store",
                "name": "Local Store",
                "frappe_site_name": site_name,
                "primary_hostname": f"{site_name}.local",
                "hostname_status": "VERIFIED",
                "lifecycle_status": "ACTIVE",
                "custom_domains": [],
            }
        else:
            has_registry = frappe.db and hasattr(frappe.db, "table_exists") and frappe.db.table_exists("SaaS Tenant Registry")
            default_host_status = "UNVERIFIED" if has_registry else "VERIFIED"
            conf_status = (getattr(frappe.local, "conf", {}) or {}).get("lifecycle_status", "ACTIVE")
            conf_host_status = (getattr(frappe.local, "conf", {}) or {}).get("hostname_status", default_host_status)
            record = {
                "tenant_id": f"TID-{site_name}",
                "slug": site_name.split(".")[0],
                "name": site_name,
                "frappe_site_name": site_name,
                "primary_hostname": site_name,
                "hostname_status": conf_host_status,
                "lifecycle_status": conf_status,
                "custom_domains": [],
            }

    try:
        frappe.cache().set_value(cache_key, record, expires_in_sec=300, shared=True)
    except Exception:
        pass

    return record


def enforce_tenant_lifecycle_and_membership():
    """Enforce tenant lifecycle status, hostname verification, and user membership on incoming requests.

    Registered as Frappe 'before_request' hook.
    """
    req = getattr(frappe.local, "request", None)
    if not req:
        return
    if req.method == "OPTIONS":
        return

    path = getattr(req, "path", "")
    # Infrastructure health and tenant resolution bypass lifecycle block
    if path in (
        "/api/method/frappe.ping",
        "/api/method/departmental_store.api.health.get_liveness",
        "/api/method/departmental_store.api.tenant.resolve_tenant_by_host",
    ):
        return

    site_name = frappe.local.site
    if site_name == "frontend":
        # Platform control plane site is not tenant-scoped
        return

    raw_host = req.headers.get("Host", "")
    valid, norm_host, reason = validate_hostname(raw_host)
    if not valid:
        frappe.throw(_(f"Invalid host header: {reason}"), frappe.ValidationError)

    # 1. Enforce Tenant Lifecycle Status
    tenant_info = get_tenant_lifecycle_for_site(site_name, norm_host)
    lifecycle_status = (tenant_info.get("lifecycle_status") or "ACTIVE").upper()

    if lifecycle_status == "SUSPENDED":
        frappe.throw(_("Tenant workspace has been suspended"), TenantSuspendedError)
    if lifecycle_status == "ARCHIVED":
        frappe.throw(_("Tenant workspace has been archived"), TenantArchivedError)
    if lifecycle_status in ("PROVISIONING", "VERIFICATION_PENDING", "PROVISIONED", "PENDING_REVIEW"):
        frappe.throw(_("Tenant workspace is awaiting activation"), TenantInactiveError)
    if lifecycle_status != "ACTIVE":
        frappe.throw(_("Tenant workspace is not active"), TenantInactiveError)

    # 2. Enforce Hostname Verification
    primary_host = (tenant_info.get("primary_hostname") or "").lower()
    real_site = (tenant_info.get("frappe_site_name") or site_name).lower()
    hostname_status = (tenant_info.get("hostname_status") or "VERIFIED").upper()
    custom_domains = tenant_info.get("custom_domains") or []
    if isinstance(custom_domains, str):
        try:
            custom_domains = json.loads(custom_domains)
        except Exception:
            custom_domains = []

    if norm_host == primary_host:
        if hostname_status != "VERIFIED":
            frappe.throw(_(f"Tenant hostname '{norm_host}' is awaiting verification"), HostnameUnverifiedError)
    elif norm_host in {real_site, f"{real_site}.local", "localhost", "127.0.0.1"}:
        pass
    else:
        # Custom domain must be explicitly present in tenant's custom_domains registry
        if norm_host not in custom_domains:
            frappe.throw(_(f"Hostname '{norm_host}' is unverified for this tenant workspace"), HostnameUnverifiedError)

    # 3. Enforce User Membership for authenticated non-admin users
    current_user = frappe.session.user
    if not current_user or current_user == "Guest":
        auth_header = req.headers.get("Authorization", "")
        if auth_header and auth_header.lower().startswith("token "):
            token_part = auth_header.split(" ", 1)[1].strip()
            if ":" in token_part:
                api_key = token_part.split(":", 1)[0]
                try:
                    user_match = frappe.db.get_value("User", {"api_key": api_key, "enabled": 1}, "name")
                    if user_match:
                        current_user = user_match
                except Exception:
                    pass

    if current_user and current_user not in ("Guest", "Administrator", "admin"):
        if frappe.db and hasattr(frappe.db, "table_exists") and frappe.db.table_exists("SaaS Tenant Membership"):
            tid = tenant_info.get("tenant_id")
            membership = frappe.db.sql(
                """SELECT role, status FROM `tabSaaS Tenant Membership`
                   WHERE user_id = %s AND (tenant_id = %s OR %s = '')
                   ORDER BY (status = 'ACTIVE') DESC LIMIT 1""",
                (current_user, tid, tid or ""),
                as_dict=True,
            )
            if not membership or membership[0]["status"] != "ACTIVE":
                frappe.throw(
                    _("User does not have active membership in this tenant workspace"),
                    MembershipInactiveError,
                )


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

    # 1. Query tabSaaS Tenant Registry if it exists
    if frappe.db.table_exists("SaaS Tenant Registry"):
        candidate_slug = None
        for suffix in [".localhost", ".local", ".departmentstore.in"]:
            if norm.endswith(suffix):
                candidate_slug = norm[:-len(suffix)]
                break

        reg_cols = [c[0] for c in frappe.db.sql("DESCRIBE `tabSaaS Tenant Registry`")]
        has_cd = "custom_domains" in reg_cols

        where_clause = "primary_hostname = %s"
        params = [norm]
        if candidate_slug:
            where_clause += " OR slug = %s"
            params.append(candidate_slug)
        if has_cd:
            where_clause += " OR custom_domains LIKE %s"
            params.append(f'%"{norm}"%')

        select_cols = (
            "tenant_id, slug, name, legal_name, frappe_site_name, "
            "primary_hostname, hostname_status, lifecycle_status, plan_id, "
            "state_code, currency, created_at, updated_at"
        )
        if has_cd:
            select_cols += ", custom_domains"

        records = frappe.db.sql(
            f"SELECT {select_cols} FROM `tabSaaS Tenant Registry` WHERE {where_clause}",
            tuple(params),
            as_dict=True,
        )

        if records:
            t = records[0]
            status = t["lifecycle_status"]
            c_domains = []
            if t.get("custom_domains"):
                try:
                    c_domains = json.loads(t["custom_domains"]) if isinstance(t["custom_domains"], str) else t["custom_domains"]
                except Exception:
                    c_domains = []

            if status == "SUSPENDED":
                return {
                    "api_version": API_VERSION,
                    "matched": False,
                    "tenant": None,
                    "error": {
                        "code": "TENANT_SUSPENDED",
                        "message": f"Tenant '{t['slug']}' is currently suspended",
                    },
                }
            if status == "ARCHIVED":
                return {
                    "api_version": API_VERSION,
                    "matched": False,
                    "tenant": None,
                    "error": {
                        "code": "TENANT_ARCHIVED",
                        "message": f"Tenant '{t['slug']}' has been archived",
                    },
                }
            if status in {"PROVISIONING", "PROVISIONED", "VERIFICATION_PENDING"}:
                return {
                    "api_version": API_VERSION,
                    "matched": False,
                    "tenant": None,
                    "error": {
                        "code": "TENANT_INACTIVE",
                        "message": f"Tenant '{t['slug']}' is awaiting activation verification",
                    },
                }
            if status == "ACTIVE":
                if norm == t["primary_hostname"] and t.get("hostname_status") and t["hostname_status"] != "VERIFIED":
                    return {
                        "api_version": API_VERSION,
                        "matched": False,
                        "tenant": None,
                        "error": {
                            "code": "HOSTNAME_UNVERIFIED",
                            "message": f"Hostname '{norm}' is awaiting verification",
                        },
                    }
                return {
                    "api_version": API_VERSION,
                    "matched": True,
                    "tenant": {
                        "tenant_id": t["tenant_id"],
                        "slug": t["slug"],
                        "name": t["name"],
                        "legal_name": t["legal_name"],
                        "lifecycle_status": t["lifecycle_status"],
                        "primary_hostname": t["primary_hostname"],
                        "hostname_status": t["hostname_status"],
                        "custom_domains": c_domains,
                        "frappe_site_name": t["frappe_site_name"],
                        "plan_id": t["plan_id"],
                        "state_code": t.get("state_code", "33"),
                        "currency": t.get("currency", "INR"),
                        "created_at": str(t["created_at"]),
                        "updated_at": str(t["updated_at"]),
                    },
                    "error": None,
                }

    # 2. In single-site / local deployment mode:
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


def ensure_saas_membership_table():
    """Idempotently ensure tabSaaS Tenant Membership table exists."""
    if frappe.db.table_exists("SaaS Tenant Membership"):
        return

    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabSaaS Tenant Membership` (
            `membership_id` VARCHAR(140) PRIMARY KEY,
            `user_id` VARCHAR(140) NOT NULL,
            `tenant_id` VARCHAR(140) NOT NULL,
            `role` VARCHAR(40) NOT NULL,
            `status` VARCHAR(40) DEFAULT 'ACTIVE',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (`user_id`),
            INDEX (`tenant_id`),
            INDEX (`user_id`, `tenant_id`),
            INDEX (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)
    frappe.db.commit()


@frappe.whitelist()
def get_tenant_info(tenant_id: str = None) -> dict:
    """Return verified tenant metadata for the authenticated user session."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    user = frappe.session.user
    roles = frappe.get_roles(user)
    is_admin = ("System Manager" in roles or user in {"Administrator", "admin"})

    local_tenant = get_local_site_tenant()

    # If tenant_id specified, check tabSaaS Tenant Registry if it exists
    if tenant_id:
        if frappe.db.table_exists("SaaS Tenant Registry"):
            reg_cols = [c[0] for c in frappe.db.sql("DESCRIBE `tabSaaS Tenant Registry`")]
            has_cd = "custom_domains" in reg_cols
            select_cols = (
                "tenant_id, slug, name, legal_name, frappe_site_name, "
                "primary_hostname, hostname_status, lifecycle_status, plan_id, "
                "state_code, currency, created_at, updated_at, created_by"
            )
            if has_cd:
                select_cols += ", custom_domains"

            records = frappe.db.sql(
                f"SELECT {select_cols} FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s",
                (tenant_id,),
                as_dict=True,
            )
            if records:
                t = records[0]
                c_domains = []
                if t.get("custom_domains"):
                    try:
                        c_domains = json.loads(t["custom_domains"]) if isinstance(t["custom_domains"], str) else t["custom_domains"]
                    except Exception:
                        c_domains = []

                # Enforce membership check for non-admin
                if not is_admin and frappe.db.table_exists("SaaS Tenant Membership"):
                    mem = frappe.db.sql(
                        """SELECT status FROM `tabSaaS Tenant Membership`
                           WHERE user_id = %s AND tenant_id = %s AND status = 'ACTIVE'""",
                        (user, tenant_id),
                        as_dict=True,
                    )
                    if not mem:
                        frappe.throw(
                            _("Tenant access denied: user does not have active membership in this tenant"),
                            frappe.PermissionError,
                        )

                if t["lifecycle_status"] == "SUSPENDED":
                    frappe.throw(
                        _(f"Tenant workspace '{t['name']}' has been suspended"),
                        TenantSuspendedError,
                    )
                if t["lifecycle_status"] == "ARCHIVED":
                    frappe.throw(
                        _(f"Tenant workspace '{t['name']}' has been archived"),
                        TenantArchivedError,
                    )

                return {
                    "api_version": API_VERSION,
                    "tenant": {
                        "tenant_id": t["tenant_id"],
                        "slug": t["slug"],
                        "name": t["name"],
                        "legal_name": t["legal_name"],
                        "lifecycle_status": t["lifecycle_status"],
                        "primary_hostname": t["primary_hostname"],
                        "hostname_status": t["hostname_status"],
                        "custom_domains": c_domains,
                        "frappe_site_name": t["frappe_site_name"],
                        "plan_id": t["plan_id"],
                        "state_code": t.get("state_code", "33"),
                        "currency": t.get("currency", "INR"),
                        "created_at": str(t["created_at"]),
                        "updated_at": str(t["updated_at"]),
                        "created_by": t.get("created_by", "Platform Admin"),
                    },
                }

        # Otherwise check if tenant_id matches local_tenant
        if tenant_id != local_tenant["tenant_id"]:
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

    user = frappe.session.user
    ensure_saas_membership_table()

    # 1. Check if user has explicit memberships in tabSaaS Tenant Membership
    memberships = []
    if frappe.db.table_exists("SaaS Tenant Membership") and frappe.db.table_exists("SaaS Tenant Registry"):
        rows = frappe.db.sql(
            """SELECT m.membership_id, m.tenant_id, m.role, m.status AS membership_status,
                      t.slug, t.name, t.primary_hostname, t.lifecycle_status, t.hostname_status
               FROM `tabSaaS Tenant Membership` m
               JOIN `tabSaaS Tenant Registry` t ON m.tenant_id = t.tenant_id
               WHERE m.user_id = %s
               ORDER BY t.name ASC""",
            (user,),
            as_dict=True,
        )
        for r in rows:
            if r.get("lifecycle_status") == "ARCHIVED":
                continue
            status = "SUSPENDED" if (r.get("membership_status") == "SUSPENDED" or r.get("lifecycle_status") == "SUSPENDED") else r.get("lifecycle_status", "ACTIVE")
            memberships.append({
                "tenant_id": r["tenant_id"],
                "slug": r["slug"],
                "name": r["name"],
                "role": r["role"],
                "status": status,
                "primary_hostname": r.get("primary_hostname", ""),
            })

    if memberships:
        return {
            "api_version": API_VERSION,
            "tenants": memberships,
        }

    # 2. Check if multi-tenant registry has active tenants but this non-admin user has NO memberships
    # (Strict tenant isolation: unassigned users see empty tenant list)
    roles = frappe.get_roles(user)
    has_registry_records = False
    if frappe.db.table_exists("SaaS Tenant Registry"):
        has_registry_records = bool(frappe.db.sql("SELECT 1 FROM `tabSaaS Tenant Registry` LIMIT 1"))

    is_admin = ("System Manager" in roles or user in {"Administrator", "admin"})

    if has_registry_records and not is_admin:
        return {
            "api_version": API_VERSION,
            "tenants": [],
        }

    # 3. Fallback for administrator / single-site local store
    local_tenant = get_local_site_tenant()
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


@frappe.whitelist()
def get_current_user_profile() -> dict:
    """Return user profile and authorized tenants for the active session."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Authentication required"), frappe.PermissionError)

    user = frappe.session.user
    full_name = frappe.db.get_value("User", user, "full_name") or user
    email = frappe.db.get_value("User", user, "email") or user
    roles = frappe.get_roles(user)
    tenants_result = list_user_tenants()

    return {
        "api_version": API_VERSION,
        "user_id": user,
        "full_name": full_name,
        "email": email,
        "roles": roles,
        "tenants": tenants_result.get("tenants", []),
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
