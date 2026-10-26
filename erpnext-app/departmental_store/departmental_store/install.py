import frappe


def after_install() -> None:
    ensure_roles()
    ensure_item_aliases_field()
    ensure_site_language()
    frappe.db.commit()


def ensure_site_language() -> None:
    """Fresh sites with an empty language trip a Frappe v16 locale bug
    (frappe/locale.py get_locale_value UnboundLocalError) once notifications run."""
    if not frappe.db.get_single_value("System Settings", "language"):
        frappe.db.set_single_value("System Settings", "language", "en")


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
