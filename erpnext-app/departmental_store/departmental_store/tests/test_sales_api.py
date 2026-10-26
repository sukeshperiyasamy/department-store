"""Bench tests for departmental_store.api.sales.

Run inside a bench with an ERPNext site:
    bench --site <site> run-tests --app departmental_store

Covers the idempotency guarantees, server-side price enforcement, review-path
error codes, and stock/accounting effects of a submitted POS sale.
"""

import json
import uuid

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from departmental_store.api import sales


def _suffix() -> str:
    return uuid.uuid4().hex[:8].upper()


def ensure_uom(uom: str) -> None:
    if not frappe.db.exists("UOM", uom):
        frappe.get_doc({"doctype": "UOM", "uom_name": uom, "must_be_whole_number": 0}).insert()


def ensure_customer_group() -> None:
    if not frappe.db.exists("Customer Group", "All Customer Groups"):
        frappe.get_doc({
            "doctype": "Customer Group",
            "customer_group_name": "All Customer Groups",
            "is_group": 1,
        }).insert(ignore_permissions=True)


def ensure_territory() -> None:
    if not frappe.db.exists("Territory", "All Territories"):
        frappe.get_doc({
            "doctype": "Territory",
            "territory_name": "All Territories",
            "is_group": 1,
        }).insert(ignore_permissions=True)


def ensure_item_group() -> None:
    if not frappe.db.exists("Item Group", "All Item Groups"):
        frappe.get_doc({
            "doctype": "Item Group",
            "item_group_name": "All Item Groups",
            "is_group": 1,
        }).insert(ignore_permissions=True)


def ensure_stock_entry_type(name: str) -> None:
    if not frappe.db.exists("Stock Entry Type", name):
        frappe.get_doc({
            "doctype": "Stock Entry Type",
            "__newname": name,  # Prompt naming
            "purpose": name,
        }).insert(ignore_permissions=True)


def ensure_fiscal_year(company: str) -> None:
    """Indian fiscal year (Apr 1 - Mar 31) covering today, active for the company."""
    today = frappe.utils.getdate()
    start_year = today.year if today.month >= 4 else today.year - 1
    start = frappe.utils.getdate(f"{start_year}-04-01")
    end = frappe.utils.getdate(f"{start_year + 1}-03-31")
    fy_name = f"{start.year}-{end.year}"
    if frappe.db.exists("Fiscal Year", fy_name):
        fy = frappe.get_doc("Fiscal Year", fy_name)
        if not any(c.company == company for c in fy.companies):
            fy.append("companies", {"company": company})
            fy.save(ignore_permissions=True)
        return
    frappe.get_doc({
        "doctype": "Fiscal Year",
        "__newname": fy_name,
        "year": fy_name,
        "year_start_date": str(start),
        "year_end_date": str(end),
        "disabled": 0,
        "companies": [{"company": company}],
    }).insert(ignore_permissions=True)


def make_company(abbr: str) -> frappe._dict:
    name = f"POS Test Company {abbr}"
    if frappe.db.exists("Company", {"abbr": abbr}):
        return frappe.db.get_value("Company", {"abbr": abbr}, "name", as_dict=True)
    # Fresh sites may lack the standard warehouse types company creation expects.
    for warehouse_type in ("Transit", "Manufacturing", "Recovery"):
        if not frappe.db.exists("Warehouse Type", warehouse_type):
            frappe.get_doc({
                "doctype": "Warehouse Type",
                "warehouse_type": warehouse_type,
                "__newname": warehouse_type,  # Warehouse Type uses Prompt naming
            }).insert(ignore_permissions=True)
    doc = frappe.get_doc({
        "doctype": "Company",
        "company_name": name,
        "abbr": abbr,
        "default_currency": "INR",
        "country": "India",
    }).insert(ignore_permissions=True)
    ensure_fiscal_year(doc.name)
    return doc


def ensure_price_list() -> str:
    if frappe.db.exists("Price List", "Standard Selling"):
        return "Standard Selling"
    frappe.get_doc({
        "doctype": "Price List", "price_list_name": "Standard Selling",
        "selling": 1, "currency": "INR",
    }).insert(ignore_permissions=True)
    return "Standard Selling"


def ensure_cash_mode_of_payment(company: str) -> str:
    if not frappe.db.exists("Mode of Payment", "Cash"):
        frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "Cash",
                        "type": "Cash", "enabled": 1}).insert(ignore_permissions=True)
    mop = frappe.get_doc("Mode of Payment", "Cash")
    cash_account = frappe.db.get_value(
        "Account", {"company": company, "account_type": "Cash", "is_group": 0})
    if cash_account and not any(a.company == company for a in mop.accounts):
        mop.append("accounts", {"company": company, "default_account": cash_account})
        mop.save(ignore_permissions=True)
    return "Cash"


def make_customer(company: str) -> str:
    ensure_customer_group()
    ensure_territory()
    leaf_group = "POS Customers"
    if not frappe.db.exists("Customer Group", leaf_group):
        frappe.get_doc({
            "doctype": "Customer Group",
            "customer_group_name": leaf_group,
            "parent_customer_group": "All Customer Groups",
            "is_group": 0,
        }).insert(ignore_permissions=True)
    leaf_territory = "POS Territory"
    if not frappe.db.exists("Territory", leaf_territory):
        frappe.get_doc({
            "doctype": "Territory",
            "territory_name": leaf_territory,
            "parent_territory": "All Territories",
            "is_group": 0,
        }).insert(ignore_permissions=True)
    name = f"POS Test Customer {company}"
    if not frappe.db.exists("Customer", name):
        frappe.get_doc({
            "doctype": "Customer", "customer_name": name, "customer_type": "Individual",
            "customer_group": leaf_group,
            "territory": leaf_territory,
        }).insert(ignore_permissions=True)
    return name


def make_pos_profile(company: str, customer: str, warehouse: str, price_list: str) -> str:
    name = f"Test Counter {company}"
    if frappe.db.exists("POS Profile", name):
        return name
    cash_account = frappe.db.get_value(
        "Account", {"company": company, "account_type": "Cash", "is_group": 0})
    write_off_account = frappe.db.get_value(
        "Account", {"company": company, "account_name": ("like", "Write Off%"),
                    "is_group": 0})
    cost_center = frappe.db.get_value("Cost Center", {"company": company, "is_group": 0})
    frappe.get_doc({
        "doctype": "POS Profile",
        "__newname": name,  # POS Profile uses Prompt naming
        "company": company,
        "customer": customer,
        "warehouse": warehouse,
        "selling_price_list": price_list,
        "currency": "INR",
        "write_off_account": write_off_account,
        "write_off_cost_center": cost_center,
        "payments": [{"mode_of_payment": "Cash", "default": 1,
                      "account": cash_account}],
    }).insert(ignore_permissions=True)
    return name


def make_pos_opening_entry(company: str, pos_profile: str, mop: str) -> str:
    """ERPNext requires an open POS Opening Entry (shift with opening cash)
    for the (profile, user) pair before POS Invoices can be submitted."""
    existing = frappe.db.get_value("POS Opening Entry", {
        "pos_profile": pos_profile, "user": frappe.session.user, "status": "Open",
    })
    if existing:
        return existing
    doc = frappe.get_doc({
        "doctype": "POS Opening Entry",
        "company": company,
        "pos_profile": pos_profile,
        "user": frappe.session.user,
        "period_start_date": frappe.utils.today(),
        "posting_date": frappe.utils.today(),
        "set_posting_date": 1,
        "balance_details": [{"mode_of_payment": mop, "opening_amount": 1000}],
    }).insert(ignore_permissions=True)
    doc.submit()
    return doc.name


def make_device(device_id: str, counter_name: str | None = None) -> str:
    if not frappe.db.exists("POS Device", device_id):
        frappe.get_doc({
            "doctype": "POS Device",
            "device_id": device_id,
            "counter_name": counter_name or device_id,
            "status": "Enabled",
        }).insert(ignore_permissions=True)
    return device_id


def make_item(company: str, is_stock_item: int = 0, with_price: bool = True,
              rate: float = 10.0) -> str:
    code = f"POS-ITEM-{_suffix()}"
    ensure_uom("Nos")
    ensure_item_group()
    frappe.get_doc({
        "doctype": "Item", "item_code": code, "item_name": f"Test Item {code}",
        "item_group": "All Item Groups", "stock_uom": "Nos",
        "is_stock_item": is_stock_item, "is_sales_item": 1, "is_purchase_item": 0,
    }).insert(ignore_permissions=True)
    if with_price:
        frappe.get_doc({
            "doctype": "Item Price", "price_list": ensure_price_list(),
            "item_code": code, "selling": 1, "price_list_rate": rate,
            "currency": "INR",
        }).insert(ignore_permissions=True)
    return code


class SubmitPosSaleTestCase(FrappeTestCase):
    """Base with fixture isolation: frappe.db.commit/rollback are no-ops during the
    test so the API's internal commits cannot leak test data."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.abbr = _suffix()[:4]
        cls.company_doc = make_company(cls.abbr)
        cls.company = cls.company_doc.name
        cls.price_list = ensure_price_list()
        cls.mop = ensure_cash_mode_of_payment(cls.company)
        cls.customer = make_customer(cls.company)
        cls.warehouse = frappe.db.get_value(
            "Warehouse", {"company": cls.company, "is_group": 0, "disabled": 0}, "name")
        cls.pos_profile = make_pos_profile(cls.company, cls.customer, cls.warehouse,
                                           cls.price_list)
        cls.device_id = make_device(f"test-counter-{cls.abbr}", "Test Counter")
        # Platform uses Sales Invoice in POS mode (ADR-0002): v16 POS Invoices do
        # not move stock per bill; Sales Invoice with is_pos does.
        make_pos_opening_entry(cls.company, cls.pos_profile, cls.mop)

    def setUp(self):
        super().setUp()
        self._orig_commit = frappe.db.commit
        self._orig_rollback = frappe.db.rollback
        frappe.db.commit = lambda: None
        frappe.db.rollback = lambda: None

    def tearDown(self):
        frappe.db.commit = self._orig_commit
        frappe.db.rollback = self._orig_rollback
        super().tearDown()

    def payload(self, item_code: str, qty: float = 2, rate: float | None = None,
                amount: float = 100.0, **overrides) -> dict:
        line = {"line_id": str(uuid.uuid4()), "item_code": item_code, "qty": qty}
        if rate is not None:
            line["rate"] = rate
        data = {
            "api_version": 1,
            "transaction_id": str(uuid.uuid4()),
            "device_id": self.device_id,
            "counter_name": "Test Counter",
            "pos_profile": self.pos_profile,
            "customer": self.customer,
            "lines": [line],
            "payments": [{"mode_of_payment": self.mop, "amount": amount}],
            "totals": {"grand_total": amount},
        }
        data.update(overrides)
        return data

    def submit(self, data: dict) -> dict:
        return sales.submit_pos_sale(json.dumps(data))


class TestIdempotency(SubmitPosSaleTestCase):
    def test_resubmission_returns_same_invoice_and_duplicate_flag(self):
        item = make_item(self.company)
        data = self.payload(item)
        first = self.submit(data)
        self.assertEqual(first["status"], "SERVER_COMMITTED")
        self.assertFalse(first["duplicate"])

        second = self.submit(data)
        self.assertEqual(second["status"], "SERVER_COMMITTED")
        self.assertTrue(second["duplicate"])
        self.assertEqual(second["invoice"]["name"], first["invoice"]["name"])

        self.assertEqual(frappe.db.count("POS Sale Sync Log",
                                         {"transaction_id": data["transaction_id"]}), 1)


class TestReviewPaths(SubmitPosSaleTestCase):
    def test_unknown_item_requires_review(self):
        data = self.payload("NO-SUCH-ITEM-XYZ")
        result = self.submit(data)
        self.assertEqual(result["status"], "REQUIRES_REVIEW")
        self.assertEqual(result["error"]["code"], "ITEM_NOT_FOUND")
        self.assertIsNone(result["invoice"])

        again = self.submit(data)
        self.assertTrue(again["duplicate"])
        self.assertEqual(again["status"], "REQUIRES_REVIEW")

    def test_missing_price_requires_review(self):
        item = make_item(self.company, with_price=False)
        result = self.submit(self.payload(item))
        self.assertEqual(result["error"]["code"], "PRICE_MISSING")

    def test_unknown_device_requires_review(self):
        item = make_item(self.company)
        result = self.submit(self.payload(item, device_id="ghost-device"))
        self.assertEqual(result["error"]["code"], "DEVICE_UNKNOWN")

    def test_payment_shortfall_requires_review(self):
        item = make_item(self.company, rate=50.0)
        result = self.submit(self.payload(item, qty=3, amount=10.0))
        self.assertEqual(result["error"]["code"], "PAYMENT_SHORTFALL")

    def test_client_rate_ignored_without_manager_role(self):
        item = make_item(self.company, rate=10.0)
        result = self.submit(self.payload(item, qty=2, rate=999.0, amount=1000.0))
        self.assertEqual(result["status"], "SERVER_COMMITTED")
        self.assertEqual(flt(result["invoice"]["grand_total"]), 20.0)
        self.assertLess(result["invoice"]["grand_total"], 999.0)


class TestSalePosting(SubmitPosSaleTestCase):
    def test_service_item_sale_posts_invoice_without_stock(self):
        item = make_item(self.company, is_stock_item=0)
        result = self.submit(self.payload(item, qty=2, amount=20.0))
        self.assertEqual(result["status"], "SERVER_COMMITTED")
        self.assertEqual(result["invoice"]["grand_total"], 20.0)
        self.assertEqual(result["invoice"]["change_amount"], 0)

    def test_stock_item_sale_moves_stock_and_posts_gl(self):
        item = make_item(self.company, is_stock_item=1, rate=10.0)
        ensure_stock_entry_type("Material Receipt")
        entry = frappe.get_doc({
            "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
            "company": self.company,
            "items": [{"item_code": item, "qty": 10, "t_warehouse": self.warehouse,
                       "uom": "Nos", "basic_rate": 5.0}],
        }).insert(ignore_permissions=True)
        entry.submit()

        result = self.submit(self.payload(item, qty=4, amount=100.0))
        self.assertEqual(result["status"], "SERVER_COMMITTED")

        sle = frappe.get_all("Stock Ledger Entry", filters={"voucher_no": result["invoice"]["name"]})
        self.assertGreater(len(sle), 0)
        balance = frappe.db.get_value("Bin", {"item_code": item, "warehouse": self.warehouse},
                                      "actual_qty")
        self.assertEqual(flt(balance), 6.0)

        gl = frappe.get_all("GL Entry", filters={"voucher_no": result["invoice"]["name"]})
        self.assertGreater(len(gl), 0)

    def test_change_amount_returned_for_excess_cash(self):
        item = make_item(self.company, rate=10.0)
        result = self.submit(self.payload(item, qty=2, amount=50.0))
        self.assertEqual(result["invoice"]["grand_total"], 20.0)
        self.assertEqual(result["invoice"]["change_amount"], 30.0)


class TestCheckTransaction(SubmitPosSaleTestCase):
    def test_unknown_transaction(self):
        result = sales.check_transaction(str(uuid.uuid4()))
        self.assertEqual(result["status"], "UNKNOWN")

    def test_known_transaction_returns_recorded_result(self):
        item = make_item(self.company)
        data = self.payload(item)
        self.submit(data)
        result = sales.check_transaction(data["transaction_id"])
        self.assertEqual(result["status"], "SERVER_COMMITTED")
        self.assertEqual(result["transaction_id"], data["transaction_id"])
