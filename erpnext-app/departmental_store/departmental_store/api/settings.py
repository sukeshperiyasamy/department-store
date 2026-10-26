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


@frappe.whitelist()
def get_settings() -> dict:
    """Current feature configuration (any authenticated user; non-secret)."""
    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        return {"api_version": 1, "flags": {k: bool(v) for k, v in DEFAULTS.items()
                                            if k in FLAG_FIELDS},
                "expiry_warning_days": DEFAULTS["expiry_warning_days"]}
    doc = frappe.get_doc(SETTINGS_DOCTYPE)
    flags = {}
    for f in FLAG_FIELDS:
        value = doc.get(f)
        flags[f] = bool(DEFAULTS[f]) if value is None else bool(value)
    return {
        "api_version": 1,
        "flags": flags,
        "expiry_warning_days": doc.get("expiry_warning_days") or DEFAULTS["expiry_warning_days"],
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

    old_value = frappe.db.get_value(SETTINGS_DOCTYPE, SETTINGS_DOCTYPE, flag)
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
