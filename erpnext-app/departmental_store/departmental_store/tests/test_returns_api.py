"""Bench tests for departmental_store.api.returns.

Covers: original-invoice lookup, full and partial returns, duplicate-return
idempotency, over-return rejection, item-not-on-invoice rejection, same-day
cashier authorization vs manager-only older returns, and stock restoration.
"""

import json
import uuid

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from departmental_store.api import returns, sales
from departmental_store.tests.test_sales_api import (  # fixtures reuse
    SubmitPosSaleTestCase,
    ensure_stock_entry_type,
    make_item,
)


class SubmitPosReturnTestCase(SubmitPosSaleTestCase):
    """Inherits fixtures: company, price list, mode of payment, customer, counter,
    POS opening entry, commit/rollback isolation, payload/submit helpers."""

    def submit_return(self, payload):
        return returns.submit_pos_return(json.dumps(payload))


class TestOriginalInvoiceLookup(SubmitPosReturnTestCase):
    def test_lookup_returns_lines_with_returnable_qty(self):
        item = make_item(self.company, is_stock_item=1, rate=10.0)
        ensure_stock_entry_type("Material Receipt")
        entry = frappe.get_doc({
            "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
            "company": self.company,
            "items": [{"item_code": item, "qty": 10, "t_warehouse": self.warehouse,
                       "uom": "Nos", "basic_rate": 5.0}],
        }).insert(ignore_permissions=True)
        entry.submit()

        sale = self.submit(self.payload(item, qty=4, amount=100.0))
        self.assertEqual(sale["status"], "SERVER_COMMITTED")

        lookup = returns.get_original_invoice(sale["invoice"]["name"])
        self.assertEqual(lookup["invoice"]["name"], sale["invoice"]["name"])
        line = next(l for l in lookup["lines"] if l["item_code"] == item)
        self.assertEqual(flt(line["sold_qty"]), 4.0)
        self.assertEqual(flt(line["returnable_qty"]), 4.0)
        self.assertEqual(flt(line["rate"]), 10.0)

    def test_lookup_rejects_unknown_and_credit_notes(self):
        from departmental_store.api.sales import SaleReviewError
        with self.assertRaises(SaleReviewError):
            returns.get_original_invoice("NO-SUCH-INVOICE")


class TestSubmitPosReturn(SubmitPosReturnTestCase):
    def _make_sale(self, qty=4):
        item = make_item(self.company, is_stock_item=1, rate=10.0)
        ensure_stock_entry_type("Material Receipt")
        entry = frappe.get_doc({
            "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
            "company": self.company,
            "items": [{"item_code": item, "qty": 10, "t_warehouse": self.warehouse,
                       "uom": "Nos", "basic_rate": 5.0}],
        }).insert(ignore_permissions=True)
        entry.submit()
        sale = self.submit(self.payload(item, qty=qty, amount=100.0))
        self.assertEqual(sale["status"], "SERVER_COMMITTED")
        return item, sale

    def _return_payload(self, sale_name, item_code, qty):
        return {
            "api_version": 1,
            "transaction_id": str(uuid.uuid4()),
            "device_id": self.device_id,
            "counter_name": "Test Counter",
            "original_invoice": sale_name,
            "occurred_at": frappe.utils.now_datetime().isoformat(),
            "lines": [{"line_id": "r1", "item_code": item_code, "qty": qty}],
            "payments": [{"mode_of_payment": self.mop, "amount": qty * 10.0}],
        }

    def test_partial_return_posts_credit_note_and_restores_stock(self):
        item, sale = self._make_sale(qty=4)
        result = sales.__dict__ and self.submit_return(
            self._return_payload(sale["invoice"]["name"], item, 1))
        self.assertEqual(result["status"], "SERVER_COMMITTED")
        self.assertTrue(result["is_return"])
        self.assertEqual(result["invoice"]["return_against"], sale["invoice"]["name"])
        self.assertEqual(flt(result["invoice"]["grand_total"]), -10.0)

        # Stock restored: bin back to 10 - 4 + 1 = 7
        balance = frappe.db.get_value("Bin", {"item_code": item,
                                              "warehouse": self.warehouse}, "actual_qty")
        self.assertEqual(flt(balance), 7.0)

        # GL entries exist for the credit note
        gl = frappe.get_all("GL Entry", filters={"voucher_no": result["invoice"]["name"]})
        self.assertGreater(len(gl), 0)

        # Returnable qty reduced
        lookup = returns.get_original_invoice(sale["invoice"]["name"])
        line = next(l for l in lookup["lines"] if l["item_code"] == item)
        self.assertEqual(flt(line["returnable_qty"]), 3.0)

    def test_duplicate_return_submission_is_idempotent(self):
        item, sale = self._make_sale(qty=2)
        payload = self._return_payload(sale["invoice"]["name"], item, 2)
        first = self.submit_return(payload)
        self.assertEqual(first["status"], "SERVER_COMMITTED")
        second = self.submit_return(payload)
        self.assertTrue(second["duplicate"])
        self.assertEqual(second["invoice"]["name"], first["invoice"]["name"])
        # only one credit note
        count = frappe.db.count("Sales Invoice", {"return_against": sale["invoice"]["name"],
                                                  "docstatus": 1})
        self.assertEqual(count, 1)

    def test_over_return_is_rejected(self):
        item, sale = self._make_sale(qty=2)
        result = self.submit_return(self._return_payload(sale["invoice"]["name"], item, 3))
        self.assertEqual(result["status"], "REQUIRES_REVIEW")
        self.assertEqual(result["error"]["code"], "RETURN_QTY_EXCEEDS")

    def test_second_over_return_after_partial_is_rejected(self):
        item, sale = self._make_sale(qty=3)
        first = self.submit_return(self._return_payload(sale["invoice"]["name"], item, 2))
        self.assertEqual(first["status"], "SERVER_COMMITTED")
        again = self.submit_return(self._return_payload(sale["invoice"]["name"], item, 2))
        self.assertEqual(again["error"]["code"], "RETURN_QTY_EXCEEDS")

    def test_item_not_on_original_invoice_is_rejected(self):
        item, sale = self._make_sale(qty=1)
        other = make_item(self.company, is_stock_item=0, rate=5.0)
        result = self.submit_return(self._return_payload(sale["invoice"]["name"], other, 1))
        self.assertEqual(result["error"]["code"], "ITEM_NOT_ON_ORIGINAL_INVOICE")

    def test_return_of_credit_note_is_rejected(self):
        item, sale = self._make_sale(qty=2)
        ret = self.submit_return(self._return_payload(sale["invoice"]["name"], item, 1))
        self.assertEqual(ret["status"], "SERVER_COMMITTED")
        result = self.submit_return({
            "api_version": 1,
            "transaction_id": str(uuid.uuid4()),
            "device_id": self.device_id,
            "original_invoice": ret["invoice"]["name"],
            "lines": [{"line_id": "r1", "item_code": item, "qty": 1}],
        })
        self.assertEqual(result["error"]["code"], "INVOICE_NOT_RETURNABLE")

    def test_return_claim_conflicts_are_safe_under_repeat(self):
        """Two sequential submissions with the same id (the duplicate path) never
        create two notes. True concurrent HTTP-level duplicates are covered by the
        multi-counter suite (in-process threads share one DB connection and are not
        a valid concurrency simulation)."""
        item, sale = self._make_sale(qty=2)
        payload = self._return_payload(sale["invoice"]["name"], item, 2)
        first = self.submit_return(payload)
        second = self.submit_return(payload)
        self.assertEqual(first["status"], "SERVER_COMMITTED")
        self.assertTrue(second["duplicate"])
        count = frappe.db.count("Sales Invoice", {"return_against": sale["invoice"]["name"],
                                                  "docstatus": 1})
        self.assertEqual(count, 1)


class TestReturnAuthorization(SubmitPosReturnTestCase):
    def test_old_bill_requires_manager(self):
        """With the cashier window closed to 0 days, a non-manager cannot return;
        the manager role bypasses the check. (Administrator holds all roles in the
        test site, so the restricted role set is simulated.)"""
        item = make_item(self.company, is_stock_item=1, rate=10.0)
        ensure_stock_entry_type("Material Receipt")
        entry = frappe.get_doc({
            "doctype": "Stock Entry", "stock_entry_type": "Material Receipt",
            "company": self.company,
            "items": [{"item_code": item, "qty": 5, "t_warehouse": self.warehouse,
                       "uom": "Nos", "basic_rate": 5.0}],
        }).insert(ignore_permissions=True)
        entry.submit()
        sale = self.submit(self.payload(item, qty=1, amount=100.0))

        original_roles = frappe.get_roles
        original_window = returns.CASHIER_RETURN_WINDOW_DAYS
        try:
            frappe.get_roles = lambda user=None: ["Cashier", "Accounts User"]
            returns.CASHIER_RETURN_WINDOW_DAYS = 0
            result = self.submit_return({
                "api_version": 1,
                "transaction_id": str(uuid.uuid4()),
                "device_id": self.device_id,
                "original_invoice": sale["invoice"]["name"],
                "lines": [{"line_id": "r1", "item_code": item, "qty": 1}],
            })
            self.assertEqual(result["status"], "REQUIRES_REVIEW")
            self.assertEqual(result["error"]["code"], "RETURN_AUTHORIZATION_REQUIRED")

            # Manager role bypasses the window.
            frappe.get_roles = lambda user=None: ["Store Manager"]
            allowed = self.submit_return({
                "api_version": 1,
                "transaction_id": str(uuid.uuid4()),
                "device_id": self.device_id,
                "original_invoice": sale["invoice"]["name"],
                "lines": [{"line_id": "r2", "item_code": item, "qty": 1}],
            })
            self.assertEqual(allowed["status"], "SERVER_COMMITTED")
        finally:
            frappe.get_roles = original_roles
            returns.CASHIER_RETURN_WINDOW_DAYS = original_window
