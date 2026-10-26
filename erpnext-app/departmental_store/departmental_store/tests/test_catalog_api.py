"""Bench tests for departmental_store.api.catalog.

QA-0001 regression: a price-only change must reach counters via incremental
snapshot (checkpoint covers Item Price modified timestamps, and changed-price
items are re-sent with their current price).
"""

import uuid

import frappe
from frappe.tests.utils import FrappeTestCase

from departmental_store.api import catalog


def _suffix() -> str:
    return uuid.uuid4().hex[:8].upper()


class CatalogSnapshotTestCase(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.db.set_single_value("System Settings", "language", "en")
        frappe.local.lang = frappe.local.lang or "en"
        if not frappe.db.exists("Price List", "Standard Selling"):
            frappe.get_doc({
                "doctype": "Price List", "price_list_name": "Standard Selling",
                "selling": 1, "currency": "INR",
            }).insert(ignore_permissions=True)
        cls.price_list = "Standard Selling"

    def setUp(self):
        super().setUp()
        self._orig_commit = frappe.db.commit
        frappe.db.commit = lambda: None

    def tearDown(self):
        frappe.db.commit = self._orig_commit
        super().tearDown()

    def _make_item(self, rate: float) -> str:
        code = f"CAT-ITEM-{_suffix()}"
        if not frappe.db.exists("UOM", "Nos"):
            frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert()
        if not frappe.db.exists("Item Group", "All Item Groups"):
            frappe.get_doc({"doctype": "Item Group", "item_group_name": "All Item Groups",
                            "is_group": 1}).insert()
        frappe.get_doc({
            "doctype": "Item", "item_code": code, "item_name": f"Catalog {code}",
            "item_group": "All Item Groups", "stock_uom": "Nos",
            "is_stock_item": 0, "is_sales_item": 1,
        }).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Item Price", "price_list": self.price_list,
            "item_code": code, "selling": 1, "price_list_rate": rate,
            "currency": "INR",
        }).insert(ignore_permissions=True)
        return code

    def _set_price(self, item_code: str, rate: float) -> None:
        price_name = frappe.db.get_value("Item Price",
                                         {"price_list": self.price_list,
                                          "item_code": item_code, "selling": 1})
        frappe.db.set_value("Item Price", price_name, "price_list_rate", rate)

    def test_full_snapshot_contains_item_and_price(self):
        code = self._make_item(99.0)
        snap = catalog.catalog_snapshot()
        match = next((i for i in snap["items"] if i["item_code"] == code), None)
        self.assertIsNotNone(match)
        self.assertEqual(match["price"]["price_list_rate"], 99.0)

    def test_price_only_change_appears_in_incremental_snapshot(self):
        code = self._make_item(50.0)
        first = catalog.catalog_snapshot()
        old_checkpoint = first["checkpoint"]
        self.assertTrue(old_checkpoint)

        # Price-only change: the Item doc itself is NOT touched.
        self._set_price(code, 77.0)

        incremental = catalog.catalog_snapshot(since=old_checkpoint)
        match = next((i for i in incremental["items"] if i["item_code"] == code), None)
        self.assertIsNotNone(
            match,
            "price-only change missing from incremental snapshot (QA-0001)")
        self.assertEqual(match["price"]["price_list_rate"], 77.0)
        # The checkpoint must advance past the price change so nothing is missed
        # by the NEXT incremental pull either.
        self.assertGreater(incremental["checkpoint"], old_checkpoint)
        self.assertFalse(incremental["is_incremental"] is False)

    def test_checkpoint_covers_price_changes(self):
        code = self._make_item(10.0)
        item_modified = frappe.db.get_value("Item", code, "modified")
        self._set_price(code, 11.0)
        price_modified = frappe.db.get_value(
            "Item Price", {"price_list": self.price_list, "item_code": code,
                           "selling": 1}, "modified")
        snap = catalog.catalog_snapshot()
        self.assertGreaterEqual(str(snap["checkpoint"]), str(price_modified),
                                "checkpoint must not lag behind price changes")
        self.assertGreaterEqual(str(snap["checkpoint"]), str(item_modified))

    def test_unrelated_items_not_resent_after_price_change(self):
        kept = self._make_item(20.0)
        changed = self._make_item(30.0)
        first = catalog.catalog_snapshot()
        old_checkpoint = first["checkpoint"]
        self._set_price(changed, 33.0)
        incremental = catalog.catalog_snapshot(since=old_checkpoint)
        resent = {i["item_code"] for i in incremental["items"]}
        self.assertIn(changed, resent)
        self.assertNotIn(kept, resent,
                         "unrelated item must not be resent on incremental sync")
