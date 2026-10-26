"""Seed a demo dataset on the site for end-to-end verification.

Run inside the backend container:
    bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"
"""

import json
import uuid

import frappe


def make_dashboard_user() -> str:
    """Least-privilege dashboard service user with an API token pair."""
    if not frappe.db.exists("User", "dashboard@demo.store"):
        frappe.get_doc({
            "doctype": "User", "email": "dashboard@demo.store",
            "first_name": "Dashboard", "send_welcome_email": 0,
            "roles": [{"role": r} for r in ("Store Manager", "Accounts Manager")],
        }).insert(ignore_permissions=True)
    from frappe.core.doctype.user.user import generate_keys
    frappe.local.form_dict.cmd = "x"
    keys = generate_keys("dashboard@demo.store")
    frappe.db.commit()
    return json.dumps(keys)


def demo(run: bool = False) -> str:
    """Creates company, tax-relevant fixtures, catalog, devices, and posts a few
    POS sales through departmental_store.api.sales.submit_pos_sale. Idempotent."""
    if not run:
        return "Pass run=True to execute"

    # Fresh pwd sites ship with an empty language, which trips a Frappe v16
    # locale bug when notifications run; set a concrete language.
    if not frappe.db.get_single_value("System Settings", "language"):
        frappe.db.set_single_value("System Settings", "language", "en")
    # Long-lived contexts may have cached the empty lang; frappe/locale.py
    # get_locale_value raises UnboundLocalError when local.lang is falsy.
    frappe.local.lang = frappe.local.lang or "en"

    abbr = "DEMO"
    if not frappe.db.exists("Company", {"abbr": abbr}):
        for warehouse_type in ("Transit", "Manufacturing", "Recovery"):
            if not frappe.db.exists("Warehouse Type", warehouse_type):
                frappe.get_doc({
                    "doctype": "Warehouse Type", "warehouse_type": warehouse_type,
                    "__newname": warehouse_type,
                }).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Company", "company_name": "Demo Departmental Store",
            "abbr": abbr, "default_currency": "INR", "country": "India",
        }).insert(ignore_permissions=True)
    company = frappe.db.get_value("Company", {"abbr": abbr}, "name")

    # v16 gates serial/batch tracking on items behind this Stock Settings toggle.
    if not frappe.db.get_single_value("Stock Settings", "enable_serial_and_batch_no_for_item"):
        frappe.db.set_single_value("Stock Settings", "enable_serial_and_batch_no_for_item", 1)

    # Fiscal year (Apr-Mar) covering today
    today = frappe.utils.getdate()
    start_year = today.year if today.month >= 4 else today.year - 1
    fy = f"{start_year}-{start_year + 1}"
    if not frappe.db.exists("Fiscal Year", fy):
        frappe.get_doc({
            "doctype": "Fiscal Year", "__newname": fy, "year": fy,
            "year_start_date": f"{start_year}-04-01",
            "year_end_date": f"{start_year + 1}-03-31",
            "companies": [{"company": company}],
        }).insert(ignore_permissions=True)

    # Customer group / territory / item group leaves
    if not frappe.db.exists("Customer Group", "All Customer Groups"):
        frappe.get_doc({"doctype": "Customer Group", "customer_group_name": "All Customer Groups", "is_group": 1}).insert(ignore_permissions=True)
    if not frappe.db.exists("Customer Group", "Walk-ins"):
        frappe.get_doc({"doctype": "Customer Group", "customer_group_name": "Walk-ins", "parent_customer_group": "All Customer Groups", "is_group": 0}).insert(ignore_permissions=True)
    if not frappe.db.exists("Territory", "All Territories"):
        frappe.get_doc({"doctype": "Territory", "territory_name": "All Territories", "is_group": 1}).insert(ignore_permissions=True)
    if not frappe.db.exists("Item Group", "All Item Groups"):
        frappe.get_doc({"doctype": "Item Group", "item_group_name": "All Item Groups", "is_group": 1}).insert(ignore_permissions=True)
    for uom in ("Nos", "Box", "Kg"):
        if not frappe.db.exists("UOM", uom):
            frappe.get_doc({"doctype": "UOM", "uom_name": uom}).insert(ignore_permissions=True)

    if not frappe.db.exists("Customer", "Walk In Customer"):
        frappe.get_doc({
            "doctype": "Customer", "customer_name": "Walk In Customer",
            "customer_type": "Individual", "customer_group": "Walk-ins",
            "territory": "All Territories",
        }).insert(ignore_permissions=True)

    if not frappe.db.exists("Price List", "Standard Selling"):
        frappe.get_doc({"doctype": "Price List", "price_list_name": "Standard Selling",
                        "selling": 1, "currency": "INR"}).insert(ignore_permissions=True)

    mop = "Cash"
    if not frappe.db.exists("Mode of Payment", mop):
        frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mop,
                        "type": "Cash", "enabled": 1}).insert(ignore_permissions=True)
    cash_account = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0})
    mop_doc = frappe.get_doc("Mode of Payment", mop)
    if cash_account and not any(a.company == company for a in mop_doc.accounts):
        mop_doc.append("accounts", {"company": company, "default_account": cash_account})
        mop_doc.save(ignore_permissions=True)

    warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name")

    profile = "Counter 1"
    if not frappe.db.exists("POS Profile", profile):
        frappe.get_doc({
            "doctype": "POS Profile", "__newname": profile,
            "company": company, "customer": "Walk In Customer",
            "warehouse": warehouse, "selling_price_list": "Standard Selling",
            "currency": "INR",
            "write_off_account": frappe.db.get_value("Account", {"company": company, "account_name": ("like", "Write Off%"), "is_group": 0}),
            "write_off_cost_center": frappe.db.get_value("Cost Center", {"company": company, "is_group": 0}),
            "payments": [{"mode_of_payment": mop, "default": 1, "account": cash_account}],
        }).insert(ignore_permissions=True)

    # Opening entry (shift) for Administrator
    if not frappe.db.exists("POS Opening Entry", {"pos_profile": profile, "user": frappe.session.user, "status": "Open"}):
        ope = frappe.get_doc({
            "doctype": "POS Opening Entry", "company": company, "pos_profile": profile,
            "user": frappe.session.user, "period_start_date": frappe.utils.today(),
            "posting_date": frappe.utils.today(), "set_posting_date": 1,
            "balance_details": [{"mode_of_payment": mop, "opening_amount": 2000}],
        }).insert(ignore_permissions=True)
        ope.submit()

    # Catalog: batch-tracked groceries and simple goods
    items = [
        ("COLGATE-200", "Colgate Toothpaste 200g", 99, True, None),
        ("RICE-BASMATI-5KG", "Basmati Rice 5kg", 450, True, None),
        ("MILK-500ML", "Fresh Milk 500ml", 28, True, "MILK-BATCH-001"),
        ("BISCUIT-PARLE", "Parle-G Biscuit", 10, True, None),
        ("SHAMPOO-340", "Shampoo Bottle 340ml", 199, True, None),
    ]
    if not frappe.db.exists("Item", "COLGATE-200"):
        def ean13(base12: str) -> str:
            digits = [int(d) for d in base12]
            total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits))
            return base12 + str((10 - total % 10) % 10)

        barcodes = {
            code: ean13(f"8901234{i:05d}")
            for i, (code, _n, _r, _s, _b) in enumerate(items)
        }
        for code, name, rate, stock, batch in items:
            frappe.get_doc({
                "doctype": "Item", "item_code": code, "item_name": name,
                "item_group": "All Item Groups", "stock_uom": "Nos",
                "is_stock_item": 1, "is_sales_item": 1,
                "has_batch_no": 1 if batch else 0,
                "ds_search_aliases": name.lower().split()[0],
            }).insert(ignore_permissions=True)
            frappe.get_doc({
                "doctype": "Item Price", "price_list": "Standard Selling",
                "item_code": code, "selling": 1, "price_list_rate": rate,
                "currency": "INR",
            }).insert(ignore_permissions=True)
            if barcodes.get(code):
                item_doc = frappe.get_doc("Item", code)
                item_doc.append("barcodes", {"barcode": barcodes[code], "barcode_type": "EAN"})
                item_doc.save(ignore_permissions=True)
            if batch:
                frappe.get_doc({
                    "doctype": "Batch", "batch_id": batch, "item": code,
                    "__newname": batch,
                }).insert(ignore_permissions=True)

    # Opening stock
    if not frappe.db.exists("Stock Entry", {"company": company, "stock_entry_type": "Material Receipt"}):
        if not frappe.db.exists("Stock Entry Type", "Material Receipt"):
            frappe.get_doc({"doctype": "Stock Entry Type", "__newname": "Material Receipt",
                            "purpose": "Material Receipt"}).insert(ignore_permissions=True)
        se = frappe.get_doc({
            "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
            "company": company,
            "items": [
                {"item_code": code, "qty": qty, "t_warehouse": warehouse,
                 "uom": "Nos", "basic_rate": rate * 0.6,
                 **({"batch_no": batch} if batch else {})}
                for code, name, rate, stock, batch in items
                for qty in (40,)
            ],
        }).insert(ignore_permissions=True)
        se.submit()

    # Device
    if not frappe.db.exists("POS Device", "counter-1"):
        frappe.get_doc({
            "doctype": "POS Device", "device_id": "counter-1",
            "counter_name": "Counter 1", "status": "Enabled",
        }).insert(ignore_permissions=True)

    frappe.db.commit()

    # Post a few sales through the idempotent API
    from departmental_store.api import sales
    posted = []
    if frappe.db.count("Sales Invoice", {"company": company, "docstatus": 1}) < 3:
        sales_list = [
            [("COLGATE-200", 2), ("BISCUIT-PARLE", 5)],
            [("RICE-BASMATI-5KG", 1)],
            [("MILK-500ML", 4), ("SHAMPOO-340", 1), ("BISCUIT-PARLE", 2)],
        ]
        for i, lines in enumerate(sales_list):
            payload = {
                "api_version": 1,
                "transaction_id": f"demo-seed-{uuid.uuid4().hex[:8]}",
                "device_id": "counter-1",
                "counter_name": "Counter 1",
                "occurred_at": frappe.utils.now_datetime().isoformat(),
                "customer": "Walk In Customer",
                "pos_profile": profile,
                "lines": [
                    {"line_id": f"l{j}", "item_code": code, "qty": qty}
                    for j, (code, qty) in enumerate(lines)
                ],
                "payments": [{"mode_of_payment": mop, "amount": 5000}],
            }
            result = sales.submit_pos_sale(payload)
            posted.append(result.get("status"))

    return json.dumps({
        "company": company, "pos_profile": profile, "warehouse": warehouse,
        "posted": posted,
    }, indent=1)
