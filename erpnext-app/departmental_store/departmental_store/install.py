import frappe


def after_install() -> None:
    ensure_roles()
    ensure_item_aliases_field()
    ensure_site_language()
    ensure_site_timezone()
    ensure_cashier_permissions()
    ensure_app_registered()
    ensure_default_settings()
    frappe.db.commit()


def ensure_default_settings() -> None:
    """Create the feature-flag settings row with intended defaults on install;
    an existing row is never overwritten (admin changes win)."""
    if not frappe.db.exists("DocType", "Departmental Store Settings"):
        return
    if frappe.db.exists("Departmental Store Settings", "Departmental Store Settings"):
        return
    frappe.get_doc({
        "doctype": "Departmental Store Settings",
        "batch_expiry_enabled": 1,
        "expiry_notifications_enabled": 1,
        "regional_catalog_enabled": 1,
        "receipt_printing_enabled": 1,
        "barcode_label_printing_enabled": 1,
        "expiry_warning_days": "7,30,60",
    }).insert(ignore_permissions=True)


def ensure_app_registered() -> dict:
    """Self-healing runbook helper: guarantees the app is listed in sites/apps.txt
    and rebuilds Frappe's module maps.

    Background: an interrupted `bench migrate` can leave sites/apps.txt without the
    custom app, after which every DocType insert fails with
    "Module Departmental Store not found" (stale app_modules redis cache plus the
    missing apps.txt line). Run via:
        bench --site <site> execute departmental_store.install.ensure_app_registered
    """
    import os

    bench_sites = os.path.join(frappe.utils.get_bench_path(), "sites")
    apps_txt = os.path.join(bench_sites, "apps.txt")
    # Truth = union of every source (DB installed apps, apps/ directory listing,
    # current apps.txt). An app present on disk or in the DB but missing from
    # apps.txt is exactly the failure mode this repairs (ISSUE-02).
    installed = frappe.get_installed_apps()
    apps_dir = os.path.join(frappe.utils.get_bench_path(), "apps")
    on_disk = os.listdir(apps_dir) if os.path.isdir(apps_dir) else []
    apps: list[str] = []
    if os.path.exists(apps_txt):
        with open(apps_txt) as f:
            apps = [line.strip() for line in f if line.strip()]
    merged: list[str] = []
    for a in installed + on_disk + apps:
        if a and a not in merged:
            merged.append(a)
    changed_apps_txt = merged != apps
    if changed_apps_txt:
        with open(apps_txt, "w") as f:
            f.write("\n".join(merged) + "\n")

    frappe.cache.delete_value("app_modules")
    frappe.cache.delete_value("installed_app_modules")
    frappe.setup_module_map(include_all_apps=True)
    # module_app maps scrubbed MODULE names -> app (e.g. "core" -> "frappe"),
    # so the correct probe is this app's own module, not the app names of
    # frappe/erpnext which never appear as module keys.
    registered = "departmental_store" in frappe.local.module_app
    frappe.db.commit()
    return {
        "apps_txt_updated": changed_apps_txt,
        "module_map_ok": registered,
        "apps_txt": merged,
        "module_count": len(frappe.local.module_app),
    }


def ensure_cashier_permissions() -> None:
    """Cashiers must be able to bill through the sync API: least-privilege custom
    permission on Sales Invoice (read/create/write/submit, no cancel/delete/
    amend — returns and credit notes stay manager/accountant work)."""
    existing = frappe.db.exists(
        "Custom DocPerm", {"parent": "Sales Invoice", "role": "Cashier"})
    if existing:
        return
    frappe.get_doc({
        "doctype": "Custom DocPerm",
        "parent": "Sales Invoice",
        "parenttype": "DocType",
        "role": "Cashier",
        "read": 1,
        "write": 1,
        "create": 1,
        "submit": 1,
        "delete": 0,
        "cancel": 0,
        "amend": 0,
    }).insert(ignore_permissions=True)


def ensure_site_language() -> None:
    """Fresh sites with an empty language trip a Frappe v16 locale bug
    (frappe/locale.py get_locale_value UnboundLocalError) once notifications run."""
    if not frappe.db.get_single_value("System Settings", "language"):
        frappe.db.set_single_value("System Settings", "language", "en")


def ensure_site_timezone() -> None:
    """Fresh pwd sites ship with an empty time_zone: Frappe then resolves dates
    in its fallback (Asia/Kolkata) while Python-level datetime.astimezone()
    follows the container's TZ env (UTC), splitting posting dates from stock
    ledger dates (QA-0005). The store operates in Tamil Nadu — pin the site
    timezone explicitly instead of relying on either default."""
    if not frappe.db.get_single_value("System Settings", "time_zone"):
        frappe.db.set_single_value("System Settings", "time_zone", "Asia/Kolkata")


ROLE_DEFINITIONS = [
    {
        "role_name": "Store Manager",
        "description": "Approvals, price overrides, purchases, inventory adjustments",
    },
    {
        "role_name": "Cashier",
        "description": "Billing at POS counters",
    },
    {
        "role_name": "Inventory Operator",
        "description": "Stock counts, batch entry, label printing",
    },
]


def ensure_roles() -> None:
    for spec in ROLE_DEFINITIONS:
        if not frappe.db.exists("Role", spec["role_name"]):
            frappe.get_doc(
                {
                    "doctype": "Role",
                    "role_name": spec["role_name"],
                    "description": spec["description"],
                    "desk_access": spec["role_name"] != "Cashier",
                }
            ).insert(ignore_permissions=True)


def ensure_item_aliases_field() -> None:
    """Custom field on Item for voice/text search aliases (comma separated)."""
    field_name = "ds_search_aliases"
    if frappe.db.exists("Custom Field", {"dt": "Item", "fieldname": field_name}):
        return
    frappe.get_doc(
        {
            "doctype": "Custom Field",
            "dt": "Item",
            "fieldname": field_name,
            "label": "Search Aliases (POS)",
            "fieldtype": "Small Text",
            "insert_after": "item_name",
            "description": "Comma separated aliases used by POS text and voice search",
        }
    ).insert(ignore_permissions=True)
