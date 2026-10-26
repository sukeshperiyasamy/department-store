"""Tiny helpers for the apps.txt regression guard (no-arg bench execute targets)."""

import json

import frappe


def read_apps_txt() -> str:
    with open(frappe.get_app_path("frappe").split("/apps/frappe/frappe")[0]
              + "/sites/apps.txt") as f:
        return f.read()


def check_module_map() -> str:
    import frappe as f

    f.cache.delete_value("app_modules")
    f.cache.delete_value("installed_app_modules")
    f.setup_module_map()
    return json.dumps({
        "departmental_store": "departmental_store" in f.local.module_app,
        "india_compliance": "india_compliance" in f.local.module_app,
        "gst_india": "gst_india" in f.local.module_app,
        "erpnext": "erpnext" in f.local.module_app,
    })
