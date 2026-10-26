"""India Compliance / GST configuration and validation for the test site.

Run inside the backend container AFTER india_compliance is installed:
    bench --site frontend execute departmental_store.gst_setup.setup --kwargs "{'run': True}"

All identifiers are clearly SYNTHETIC test data (structural-format GSTIN/PAN
placeholders, never real registrations):
    GSTIN: 27XAAPCS1234A1Z5  (format-valid, fictional)
"""

import json

import frappe
from frappe.utils import flt


def setup(run: bool = False) -> str:
    """Configure GST for the demo company + create tax templates and test items."""
    if not run:
        return "Pass run=True to execute"

    if not frappe.db.exists("Installed Application", {"app": "india_compliance"}) and \
            "india_compliance" not in frappe.get_installed_apps():
        return "india_compliance is NOT installed on this site"

    demo.run(True) if False else None  # noqa: ensure demo fixtures exist via import below
    from departmental_store.seeds import demo
    demo(run=True)

    company = frappe.db.get_value("Company", {"abbr": "DEMO"}, "name")

    # --- Company GST identity (SYNTHETIC test data) ---
    frappe.db.set_value("Company", company, {
        "gstin": "27XAAPCS1234A1Z5",
        "pan": "XAAPCS1234A",
    }, update_modified=False)

    # --- GST Settings (india_compliance single) ---
    # e-invoicing / e-waybill deliberately disabled: applicability for this store is
    # a legal determination that has NOT been made. Synthetic test environment only.
    if frappe.db.exists("DocType", "GST Settings"):
        frappe.db.set_single_value("GST Settings", {
            "enable_e_invoice": 0,
            "enable_e_waybill": 0,
        }, update_modified=False)
        # Register the company GSTIN on the GST Settings "GSTIN" child table if the
        # fieldname exists in this version (v16 uses gstin_child/`gstin` table names
        # that vary; guard defensively).
        gst = frappe.get_doc("GST Settings")
        if gst.meta.has_field("gstin") and isinstance(gst.gstin, list):
            if not any(getattr(r, "gstin", "") == "27XAAPCS1234A1Z5" for r in gst.gstin):
                gst.append("gstin", {
                    "gstin": "27XAAPCS1234A1Z5",
                    "company": company,
                    "is_default": 1,
                })
                gst.save(ignore_permissions=True)

    # --- Tax accounts: india_compliance creates the standard Output/Input Tax
    # accounts per company during its setup; use those.
    accounts = {
        "cgst": "Output Tax CGST - DEMO",
        "sgst": "Output Tax SGST - DEMO",
        "igst": "Output Tax IGST - DEMO",
    }
    missing = [a for a in accounts.values()
               if not frappe.db.exists("Account", a)]
    if missing:
        return json.dumps({"error": f"GST accounts missing: {missing} — "
                                    "run india_compliance setup first"})

    # --- Templates: intra-state (CGST+SGST) and inter-state (IGST) ---
    _ensure_template(company, "Intra-state GST 5% (Demo)", [
        {"charge_type": "On Net Total", "account_head": accounts["cgst"],
         "rate": 2.5, "description": "CGST 2.5% (synthetic test template)"},
        {"charge_type": "On Net Total", "account_head": accounts["sgst"],
         "rate": 2.5, "description": "SGST 2.5% (synthetic test template)"},
    ])
    _ensure_template(company, "Intra-state GST 18% (Demo)", [
        {"charge_type": "On Net Total", "account_head": accounts["cgst"],
         "rate": 9, "description": "CGST 9% (synthetic test template)"},
        {"charge_type": "On Net Total", "account_head": accounts["sgst"],
         "rate": 9, "description": "SGST 9% (synthetic test template)"},
    ])
    _ensure_template(company, "Inter-state IGST 18% (Demo)", [
        {"charge_type": "On Net Total", "account_head": accounts["igst"],
         "rate": 18, "description": "IGST 18% (synthetic test template)"},
    ])

    frappe.db.commit()
    return json.dumps({
        "company": company,
        "templates": ["Intra-state GST 5% (Demo)", "Intra-state GST 18% (Demo)",
                      "Inter-state IGST 18% (Demo)"],
        "note": "SYNTHETIC GSTIN; e-invoicing/e-waybill disabled pending legal applicability",
    }, indent=1)


def _ensure_template(company: str, title: str, taxes: list[dict]) -> None:
    if frappe.db.exists("Sales Taxes and Charges Template", title):
        return
    frappe.get_doc({
        "doctype": "Sales Taxes and Charges Template",
        "title": title,
        "company": company,
        "taxes": taxes,
    }).insert(ignore_permissions=True)


def gst_validation_cases() -> str:
    """Post GST validation invoices and return computed results.

    Cases (expected values below are arithmetic identities of GST rate math — they
    still require a qualified accountant's sign-off for production rates/rules):
    - intra-state 5% on 1000.00 -> CGST 25.00 + SGST 25.00, grand 1050.00
    - intra-state 18% on 1000.00 -> CGST 90.00 + SGST 90.00, grand 1180.00
    - inter-state IGST 18% on 1000.00 -> IGST 180.00, grand 1180.00
    - rounding: intra-state 18% on 999.00 -> 89.91+89.91 = 179.82, grand 1178.82
    Also validates the REAL POS path: the demo POS profile is set to the 18%
    intra-state template and a sale is posted through the idempotent API.
    """
    company = frappe.db.get_value("Company", {"abbr": "DEMO"}, "name")
    results = []

    def make_item(code, rate):
        if not frappe.db.exists("Item", code):
            frappe.get_doc({
                "doctype": "Item", "item_code": code, "item_name": code,
                "item_group": "All Item Groups", "stock_uom": "Nos",
                "is_stock_item": 0, "is_sales_item": 1,
                # Generic 4-digit HSN placeholder for synthetic test items; the
                # store's real item HSN codes must be assigned by the owner.
                "gst_hsn_code": "999999",
            }).insert(ignore_permissions=True)
            frappe.get_doc({
                "doctype": "Item Price", "price_list": "Standard Selling",
                "item_code": code, "selling": 1, "price_list_rate": rate,
                "currency": "INR",
            }).insert(ignore_permissions=True)

    def post_case(name, template, qty=1, rate=1000.0):
        item_code = f"GST-CASE-{name}"
        make_item(item_code, rate)
        inv = frappe.get_doc({
            "doctype": "Sales Invoice", "is_pos": 1, "update_stock": 0,
            "company": company, "customer": "Walk In Customer",
            "currency": "INR",
            "taxes_and_charges": template,
            "items": [{"item_code": item_code, "qty": qty, "rate": rate}],
            "payments": [{"mode_of_payment": "Cash",
                          "amount": 0}],  # recalculated on validate
        }).insert(ignore_permissions=True)
        inv.submit()
        taxes = [{
            "account": t.account_head, "rate": flt(t.rate),
            "amount": flt(t.base_tax_amount), "total": flt(t.base_total)
        } for t in inv.taxes]
        inv.cancel()
        results.append({
            "case": name, "template": template,
            "net": flt(inv.base_net_total), "grand": flt(inv.base_grand_total),
            "taxes": taxes,
        })

    post_case("intra_5", "Intra-state GST 5% (Demo) - DEMO")
    post_case("intra_18", "Intra-state GST 18% (Demo) - DEMO")
    post_case("inter_18", "Inter-state IGST 18% (Demo) - DEMO")
    post_case("rounding_18_on_999", "Intra-state GST 18% (Demo) - DEMO", rate=999.0)

    # Real POS path: set the 18% intra-state template on the POS profile and post
    # through the idempotent sale API.
    frappe.db.set_value("POS Profile", "Counter 1",
                        "taxes_and_charges", "Intra-state GST 18% (Demo) - DEMO")
    from departmental_store.api import sales
    result = sales.submit_pos_sale(json.dumps({
        "api_version": 1,
        "transaction_id": f"gst-pos-case-{frappe.utils.random_string(8)}",
        "device_id": "counter-1",
        "pos_profile": "Counter 1",
        "customer": "Walk In Customer",
        "lines": [{"line_id": "l1", "item_code": "BISCUIT-PARLE", "qty": 10}],
        "payments": [{"mode_of_payment": "Cash", "amount": 500}],
    }))
    pos_inv = result["invoice"]["name"] if result.get("invoice") else None
    pos_taxes = None
    pos_net = pos_grand = None
    if pos_inv:
        inv = frappe.get_doc("Sales Invoice", pos_inv)
        pos_taxes = [{"account": t.account_head, "rate": flt(t.rate),
                      "amount": flt(t.base_tax_amount)} for t in inv.taxes]
        pos_net, pos_grand = flt(inv.base_net_total), flt(inv.base_grand_total)
    results.append({
        "case": "pos_path_18", "via": "submit_pos_sale", "invoice": pos_inv,
        "net": pos_net, "grand": pos_grand, "taxes": pos_taxes,
    })

    frappe.db.commit()
    return json.dumps(results, indent=1)
