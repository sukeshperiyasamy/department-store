"""Seed a demo dataset on the site for end-to-end verification.

Run inside the backend container:
    bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"
"""

import json
import uuid

import frappe


def touch_one_perf_price() -> str:
    """Bump one PERF item price (for incremental snapshot measurement)."""
    import random

    name = frappe.get_all("Item Price",
                          filters={"item_code": ("like", "PERF-%"), "selling": 1},
                          pluck="name", limit=1)[0]
    frappe.db.set_value("Item Price", name, "price_list_rate", random.randrange(5, 95))
    frappe.db.commit()
    return name


def make_cashier_user_a() -> str:
    return make_cashier_user("_a")


def make_cashier_user_b() -> str:
    return make_cashier_user("_b")


def make_cashier_user(suffix: str = "") -> str:
    """Cashier test user with API keys for integration/security testing.
    `suffix` creates independent counters (e.g. "_a", "_b") so two counters can
    hold separate valid tokens simultaneously.
    Follows the ERPNext convention that billing users hold Accounts User
    (GL posting requires account access); reporting stays manager-only."""
    email = f"cashier{suffix}@demo.store"
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email,
            "first_name": "Cashier", "send_welcome_email": 0,
            "roles": [{"role": "Cashier"}, {"role": "Accounts User"}],
        }).insert(ignore_permissions=True)
    else:
        user = frappe.get_doc("User", email)
        if not any(r.role == "Accounts User" for r in user.roles):
            user.append("roles", {"role": "Accounts User"})
            user.save(ignore_permissions=True)
    from frappe.core.doctype.user.user import generate_keys
    frappe.local.form_dict.cmd = "x"
    keys = generate_keys(email)
    frappe.db.commit()
    return json.dumps(keys)


def make_race_items() -> str:
    """Two items for oversell testing: one with 2 units (sequential test) and
    one with 1 unit (parallel race test). No-arg so bench execute needs no kwargs."""
    a = _make_race_item(2)
    b = _make_race_item(1)
    return json.dumps({"race_a": a, "race_b": b})


def _ensure_demo_hsn(hsn: str) -> None:
    """India Compliance validates HSN on sales items and links Item Tax rows
    through the GST HSN Code master, so every synthetic HSN referenced by seed
    items must exist there first."""
    if not frappe.db.exists("GST HSN Code", hsn):
        frappe.get_doc({
            "doctype": "GST HSN Code", "__newname": hsn,
            "hsn_code": hsn,
            "description": "Synthetic demo HSN (test data only)",
        }).insert(ignore_permissions=True)


def _make_race_item(qty: int) -> str:
    demo(run=True)
    company = frappe.db.get_value("Company", {"abbr": "DEMO"}, "name")
    # Receive into the warehouse the POS profile bills against.
    profile_warehouse = (frappe.db.get_value("POS Profile", "QA Suite Counter", "warehouse")
                         or frappe.db.get_value("POS Profile", "Counter 1", "warehouse"))
    warehouse = profile_warehouse or frappe.db.get_value(
        "Warehouse", {"company": company, "is_group": 0}, "name")
    code = f"RACE-ITEM-{uuid.uuid4().hex[:6].upper()}"
    if not frappe.db.exists("UOM", "Nos"):
        frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert()
    _ensure_demo_hsn("999999")
    frappe.get_doc({
        "doctype": "Item", "item_code": code, "item_name": f"Race {code}",
        "item_group": "All Item Groups", "stock_uom": "Nos",
        "is_stock_item": 1, "is_sales_item": 1,
        "gst_hsn_code": "999999",
    }).insert(ignore_permissions=True)
    frappe.get_doc({
        "doctype": "Item Price", "price_list": "Standard Selling",
        "item_code": code, "selling": 1, "price_list_rate": 100,
        "currency": "INR",
    }).insert(ignore_permissions=True)
    if not frappe.db.exists("Stock Entry Type", "Material Receipt"):
        frappe.get_doc({"doctype": "Stock Entry Type", "__newname": "Material Receipt",
                        "purpose": "Material Receipt"}).insert(ignore_permissions=True)
    se = frappe.get_doc({
        "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
        "company": company,
        "items": [{"item_code": code, "qty": qty, "t_warehouse": warehouse,
                   "uom": "Nos", "basic_rate": 50}],
    }).insert(ignore_permissions=True)
    se.submit()
    frappe.db.commit()
    return code


def make_perf_items(n: int = 300) -> str:
    """Bulk-create n items with barcodes and prices for performance testing."""
    demo(run=True)
    made = 0
    for i in range(n):
        code = f"PERF-{i:04d}"
        if frappe.db.exists("Item", code):
            continue
        base12 = f"890600{i % 1000000:06d}"
        digits = [int(d) for d in base12]
        total = sum(d * (3 if j % 2 else 1) for j, d in enumerate(digits))
        barcode = base12 + str((10 - total % 10) % 10)
        _ensure_demo_hsn("999999")
        frappe.get_doc({
            "doctype": "Item", "item_code": code,
            "item_name": f"Perf Item {i}_WIDGET-AISLE-{i % 20}",
            "item_group": "All Item Groups", "stock_uom": "Nos",
            "is_stock_item": 0, "is_sales_item": 1,
            "gst_hsn_code": "999999",
            "ds_search_aliases": f"perf{i}",
        }).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Item Price", "price_list": "Standard Selling",
            "item_code": code, "selling": 1, "price_list_rate": 10 + (i % 90),
            "currency": "INR",
        }).insert(ignore_permissions=True)
        item_doc = frappe.get_doc("Item", code)
        item_doc.append("barcodes", {"barcode": barcode, "barcode_type": "EAN"})
        item_doc.save(ignore_permissions=True)
        made += 1
    frappe.db.commit()
    return f"created {made} items (total perf items: {frappe.db.count('Item', {'item_code': ('like', 'PERF-%')})})"


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

    # Opening entry (shift) for Administrator — skip if the user already has ANY
    # open shift (ERPNext allows one open POS Opening Entry per user).
    if not frappe.db.exists("POS Opening Entry", {"user": frappe.session.user, "status": "Open"}):
        ope = frappe.get_doc({
            "doctype": "POS Opening Entry", "company": company, "pos_profile": profile,
            "user": frappe.session.user, "period_start_date": frappe.utils.today(),
            "posting_date": frappe.utils.today(), "set_posting_date": 1,
            "balance_details": [{"mode_of_payment": mop, "opening_amount": 2000}],
        }).insert(ignore_permissions=True)
        ope.submit()

    # Catalog: batch-tracked groceries and simple goods; HSN codes are plausible
    # test values so India Compliance's validate_hsn_code check passes.
    items = [
        ("COLGATE-200", "Colgate Toothpaste 200g", 99, True, None, "330610"),
        ("RICE-BASMATI-5KG", "Basmati Rice 5kg", 450, True, None, "100600"),
        ("MILK-500ML", "Fresh Milk 500ml", 28, True, "MILK-BATCH-001", "040110"),
        ("BISCUIT-PARLE", "Parle-G Biscuit", 10, True, None, "190531"),
        ("SHAMPOO-340", "Shampoo Bottle 340ml", 199, True, None, "330510"),
    ]
    if not frappe.db.exists("Item", "COLGATE-200"):
        def ean13(base12: str) -> str:
            digits = [int(d) for d in base12]
            total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits))
            return base12 + str((10 - total % 10) % 10)

        for hsn_code in {item[5] for item in items}:
            _ensure_demo_hsn(hsn_code)

        barcodes = {
            code: ean13(f"8901234{i:05d}")
            for i, (code, _n, _r, _s, _b, _h) in enumerate(items)
        }
        for code, name, rate, stock, batch, hsn in items:
            frappe.get_doc({
                "doctype": "Item", "item_code": code, "item_name": name,
                "item_group": "All Item Groups", "stock_uom": "Nos",
                "is_stock_item": 1, "is_sales_item": 1,
                "has_batch_no": 1 if batch else 0,
                "gst_hsn_code": hsn,
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
                for code, name, rate, stock, batch, _hsn in items
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


def make_qa_pos_profile() -> str:
    """Deterministic no-tax POS profile for the API suite: asserts re-pricing and
    totals without coupling to the demo GST configuration."""
    demo(run=True)
    company = frappe.db.get_value("Company", {"abbr": "DEMO"}, "name")
    warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
    cash_account = frappe.db.get_value(
        "Account", {"company": company, "account_type": "Cash", "is_group": 0})
    name = "QA Suite Counter"
    if not frappe.db.exists("POS Profile", name):
        frappe.get_doc({
            "doctype": "POS Profile", "__newname": name,
            "company": company, "customer": "Walk In Customer",
            "warehouse": warehouse, "selling_price_list": "Standard Selling",
            "currency": "INR",
            "write_off_account": frappe.db.get_value(
                "Account", {"company": company, "account_name": ("like", "Write Off%"),
                            "is_group": 0}),
            "write_off_cost_center": frappe.db.get_value(
                "Cost Center", {"company": company, "is_group": 0}),
            "payments": [{"mode_of_payment": "Cash", "default": 1,
                          "account": cash_account}],
        }).insert(ignore_permissions=True)
    # opening entry for the QA profile
    if not frappe.db.exists("POS Opening Entry", {"pos_profile": name,
                                                  "user": frappe.session.user,
                                                  "status": "Open"}):
        for row in frappe.get_all("POS Opening Entry",
                                  filters={"user": frappe.session.user,
                                           "status": "Open"}, pluck="name"):
            frappe.get_doc("POS Opening Entry", row).cancel()
        ope = frappe.get_doc({
            "doctype": "POS Opening Entry", "company": company, "pos_profile": name,
            "user": frappe.session.user, "period_start_date": frappe.utils.today(),
            "posting_date": frappe.utils.today(), "set_posting_date": 1,
            "balance_details": [{"mode_of_payment": "Cash", "opening_amount": 1000}],
        }).insert(ignore_permissions=True)
        ope.submit()
    frappe.db.commit()
    return name


def demo_run() -> str:
    """No-arg bench-execute wrapper around demo(run=True)."""
    return demo(run=True)


def ensure_scale_devices() -> list[str]:
    """Ensure devices counter-1 through counter-5 exist and are enabled."""
    devices = []
    for i in range(1, 6):
        dev_id = f"counter-{i}"
        if not frappe.db.exists("POS Device", dev_id):
            frappe.get_doc({
                "doctype": "POS Device",
                "device_id": dev_id,
                "counter_name": f"Billing Counter {i}",
                "status": "Enabled",
            }).insert(ignore_permissions=True)
        else:
            frappe.db.set_value("POS Device", dev_id, "status", "Enabled")
        devices.append(dev_id)
    frappe.db.commit()
    return devices


def replenish_scale_stock(qty: int = 5000) -> None:
    """Add sufficient stock of demo items in the QA warehouse to support high-volume scale tests."""
    company = frappe.get_all("Company", pluck="name")[0]
    warehouse = (frappe.db.get_value("POS Profile", "QA Suite Counter", "warehouse")
                 or frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name"))
    items = ["COLGATE-200", "RICE-BASMATI-5KG", "BISCUIT-PARLE", "SHAMPOO-340"]

    stock_items = []
    for it in items:
        if frappe.db.exists("Item", it):
            stock_items.append({
                "item_code": it,
                "qty": qty,
                "t_warehouse": warehouse,
                "uom": "Nos",
                "basic_rate": 10.0,
            })
    if stock_items:
        se = frappe.get_doc({
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": company,
            "items": stock_items,
        }).insert(ignore_permissions=True)
        se.submit()
        frappe.db.commit()
