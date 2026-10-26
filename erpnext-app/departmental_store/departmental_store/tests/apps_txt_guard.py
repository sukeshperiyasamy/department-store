"""Tiny helpers for the apps.txt regression guard (no-arg bench execute targets)."""

import json

import frappe


def read_apps_txt() -> str:
    with open(frappe.get_app_path("frappe").split("/apps/frappe/frappe")[0]
              + "/sites/apps.txt") as f:
        return f.read()


def check_module_map() -> dict:
    import frappe as f

    f.cache.delete_value("app_modules")
    f.cache.delete_value("installed_app_modules")
    f.setup_module_map()
    # dict on purpose: bench execute prints dicts as clean JSON; a json.dumps
    # string would be printed repr-escaped and break the guard's parsing.
    return {
        "departmental_store": "departmental_store" in f.local.module_app,
        # india_compliance ships no module of its own name; its real modules
        # are gst_india / income_tax_india / vat_india / audit_trail.
        "india_compliance": "income_tax_india" in f.local.module_app,
        "gst_india": "gst_india" in f.local.module_app,
        # module_app keys are scrubbed MODULE names; erpnext has no module
        # literally named "erpnext", so probe one of its real modules.
        "erpnext": "accounts" in f.local.module_app,
    }
