"""Feature-flag settings API for the POS/dashboard.

All flags live in the Departmental Store Settings single DocType; only System
Manager may change them (enforced by DocType permissions + explicit check here).
Reads are available to any authenticated session so clients can reflect config.
Every mutation is audit-logged. Disabled modules must not run: clients gate on
this API, and the server refuses flagged operations via require_flag().
"""

import json

import frappe

SETTINGS_DOCTYPE = "Departmental Store Settings"

FLAG_FIELDS = [
    "voice_assistant_enabled",
    "voice_hold_shortcut_enabled",
    "ai_provider_enabled",
    "mcp_adapter_enabled",
    "camera_product_capture_enabled",
    "batch_expiry_enabled",
    "expiry_notifications_enabled",
    "regional_catalog_enabled",
    "receipt_printing_enabled",
    "barcode_label_printing_enabled",
]

DEFAULTS = {
    "voice_assistant_enabled": 0,
    "voice_hold_shortcut_enabled": 0,
    "ai_provider_enabled": 0,
    "mcp_adapter_enabled": 0,
    "camera_product_capture_enabled": 0,
    "batch_expiry_enabled": 1,
    "expiry_notifications_enabled": 1,
    "regional_catalog_enabled": 1,
    "receipt_printing_enabled": 1,
    "barcode_label_printing_enabled": 1,
    "expiry_warning_days": "7,30,60",
}

STORE_PROFILE_DEFAULTS = {
    "store_name": "Demo Departmental Store",
    "store_phone": "+91 98765 43210",
    "store_address": "Main Bazaar, Madurai, Tamil Nadu 625001",
    "receipt_header": "Welcome to Demo Departmental Store!",
    "receipt_footer": "Thank you for shopping with us! Please visit again.",
    "business_hours": "08:00 AM - 10:00 PM (Mon-Sun)",
    "tax_number": "33AAAAA0000A1Z5",
    "currency_symbol": "₹",
    "date_format": "DD-MM-YYYY",
}


@frappe.whitelist()
def get_store_profile() -> dict:
    """Current tenant store profile (any authenticated user)."""
    profile = {}
    for key, default_val in STORE_PROFILE_DEFAULTS.items():
        if hasattr(frappe.db, "get_single_value"):
            val = frappe.db.get_single_value(SETTINGS_DOCTYPE, key)
        else:
            val = frappe.db.get_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, key)
        profile[key] = default_val if (val is None or str(val).strip() == "") else str(val)
    return {"api_version": 1, "profile": profile}


@frappe.whitelist()
def update_store_profile(profile: dict | str | None = None) -> dict:
    """Update tenant store profile. System Manager or Store Manager only."""
    frappe.only_for(["System Manager", "Store Manager"])
    if isinstance(profile, str):
        try:
            profile = json.loads(profile)
        except Exception as err:
            raise frappe.ValidationError("Invalid profile JSON payload") from err

    if not isinstance(profile, dict):
        raise frappe.ValidationError("Profile payload must be an object")

    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        frappe.get_doc({"doctype": SETTINGS_DOCTYPE}).insert(ignore_permissions=True)

    sanitized = {}
    for key in STORE_PROFILE_DEFAULTS:
        if key in profile:
            val = str(profile[key]).strip()[:500]  # bounded character length
            if hasattr(frappe.db, "set_single_value"):
                frappe.db.set_single_value(SETTINGS_DOCTYPE, key, val)
            else:
                frappe.db.set_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, key, val)
            sanitized[key] = val

    frappe.logger("departmental_store").info({
        "event": "store_profile_updated",
        "user": frappe.session.user,
        "updated_keys": list(sanitized.keys()),
    })
    frappe.db.commit()
    return get_store_profile()


@frappe.whitelist()
def submit_support_request(
    category: str = "OTHER",
    subject: str = "",
    description: str = "",
    priority: str = "NORMAL",
    diagnostics: str | dict | None = None,
) -> dict:
    """Submit an in-app customer support request with sanitized system diagnostics."""
    if frappe.session.user == "Guest":
        raise frappe.PermissionError("Authentication required to submit support requests.")

    clean_category = str(category).strip().upper()[:50]
    clean_subject = str(subject).strip()[:140]
    clean_description = str(description).strip()[:2000]
    clean_priority = str(priority).strip().upper()[:20]

    if not clean_subject:
        raise frappe.ValidationError("Support ticket subject is required.")
    if not clean_description:
        raise frappe.ValidationError("Support ticket description is required.")

    if isinstance(diagnostics, str):
        try:
            diag_obj = json.loads(diagnostics)
        except Exception:
            diag_obj = {"raw": diagnostics[:500]}
    elif isinstance(diagnostics, dict):
        diag_obj = diagnostics
    else:
        diag_obj = {}

    # Redact sensitive diagnostic keys
    redacted_diag = {}
    for k, v in diag_obj.items():
        if any(secret_term in str(k).lower() for secret_term in ["secret", "pass", "token", "auth", "key"]):
            redacted_diag[k] = "[REDACTED]"
        else:
            redacted_diag[k] = v

    ticket_id = f"TKT-{frappe.utils.now_datetime().strftime('%Y%m%d%H%M%S')}-{frappe.generate_hash(length=6).upper()}"

    frappe.logger("departmental_store").info({
        "event": "support_ticket_created",
        "ticket_id": ticket_id,
        "user": frappe.session.user,
        "category": clean_category,
        "priority": clean_priority,
        "subject": clean_subject,
        "diagnostics": redacted_diag,
    })

    return {
        "api_version": 1,
        "ticket_id": ticket_id,
        "status": "RECEIVED",
        "category": clean_category,
        "priority": clean_priority,
        "created_at": frappe.utils.now_datetime().isoformat(),
        "estimated_response_hours": 4 if clean_priority in ("HIGH", "URGENT") else 24,
    }


@frappe.whitelist()
def get_settings() -> dict:
    """Current feature configuration and store profile (any authenticated user; non-secret)."""
    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        return {
            "api_version": 1,
            "flags": {k: bool(v) for k, v in DEFAULTS.items() if k in FLAG_FIELDS},
            "expiry_warning_days": DEFAULTS["expiry_warning_days"],
            "profile": STORE_PROFILE_DEFAULTS.copy(),
        }
    doc = frappe.get_doc(SETTINGS_DOCTYPE)
    flags = {}
    for f in FLAG_FIELDS:
        value = doc.get(f)
        flags[f] = bool(DEFAULTS[f]) if value is None else bool(value)

    profile = {}
    for key, default_val in STORE_PROFILE_DEFAULTS.items():
        val = doc.get(key)
        profile[key] = default_val if (val is None or str(val).strip() == "") else str(val)

    return {
        "api_version": 1,
        "flags": flags,
        "expiry_warning_days": doc.get("expiry_warning_days") or DEFAULTS["expiry_warning_days"],
        "profile": profile,
    }


@frappe.whitelist()
def set_flag(flag: str | None = None, value: str | int | None = None) -> dict:
    """Change one feature flag. System Manager only; audit-logged."""
    frappe.only_for(["System Manager"])
    if flag not in FLAG_FIELDS:
        raise frappe.ValidationError(f"Unknown flag '{flag}'")
    new_value = 1 if frappe.utils.cint(value) else 0

    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        frappe.get_doc({"doctype": SETTINGS_DOCTYPE}).insert(ignore_permissions=True)

    old_value = frappe.db.get_single_value(SETTINGS_DOCTYPE, flag) if hasattr(frappe.db, "get_single_value") else frappe.db.get_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, flag)
    if hasattr(frappe.db, "set_single_value"):
        frappe.db.set_single_value(SETTINGS_DOCTYPE, flag, new_value)
    else:
        frappe.db.set_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, flag, new_value)
    frappe.logger("departmental_store").info({
        "event": "feature_flag_changed", "flag": flag,
        "old": bool(old_value) if old_value is not None else None,
        "new": bool(new_value), "user": frappe.session.user,
    })
    frappe.db.commit()
    return {"api_version": 1, "flag": flag, "value": bool(new_value)}


def require_flag(flag: str) -> None:
    """Server-side guard: refuse flagged operations when the module is disabled."""
    settings = frappe.db.get_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, flag) \
        if frappe.db.exists("DocType", SETTINGS_DOCTYPE) else None
    enabled = bool(DEFAULTS[flag]) if settings is None else bool(settings)
    if not enabled:
        raise frappe.PermissionError(f"Module '{flag}' is disabled in Departmental Store Settings")
