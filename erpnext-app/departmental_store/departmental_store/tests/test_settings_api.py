"""Bench tests for departmental_store.api.settings.

Validates:
- get_settings returns all 10 feature flags and expiry warning days.
- set_flag allows System Manager to toggle flags, commits change, and audit-logs.
- set_flag rejects unauthorized users (e.g. Cashier) with PermissionError.
- set_flag rejects invalid/unknown flag names with ValidationError.
- require_flag enforces server-side guards when module is disabled.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from departmental_store.api import settings


class TestSettingsApi(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self._orig_user = frappe.session.user
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user(self._orig_user)
        super().tearDown()

    def test_get_settings_structure(self):
        result = settings.get_settings()
        self.assertEqual(result.get("api_version"), 1)
        flags = result.get("flags", {})
        for field in settings.FLAG_FIELDS:
            self.assertIn(field, flags)
            self.assertIsInstance(flags[field], bool)
        self.assertIn("expiry_warning_days", result)

    def test_set_flag_as_system_manager(self):
        frappe.set_user("Administrator")
        # Turn voice_assistant_enabled on then off
        res1 = settings.set_flag("voice_assistant_enabled", 1)
        self.assertEqual(res1.get("flag"), "voice_assistant_enabled")
        self.assertTrue(res1.get("value"))

        cfg = settings.get_settings()
        self.assertTrue(cfg["flags"]["voice_assistant_enabled"])

        res2 = settings.set_flag("voice_assistant_enabled", 0)
        self.assertEqual(res2.get("flag"), "voice_assistant_enabled")
        self.assertFalse(res2.get("value"))

        cfg2 = settings.get_settings()
        self.assertFalse(cfg2["flags"]["voice_assistant_enabled"])

    def test_set_flag_rejects_unauthorized_user(self):
        # Create or use a non-System-Manager user (Cashier)
        cashier_email = "test_cashier_settings@demo.store"
        if not frappe.db.exists("User", cashier_email):
            frappe.get_doc({
                "doctype": "User",
                "email": cashier_email,
                "first_name": "Test Cashier",
                "roles": [{"role": "Cashier"}],
            }).insert(ignore_permissions=True)

        frappe.set_user(cashier_email)
        with self.assertRaises(frappe.PermissionError):
            settings.set_flag("regional_catalog_enabled", 0)

    def test_set_flag_rejects_store_manager_without_system_manager(self):
        # Store Manager role is authorized to read settings but NOT mutate configuration
        mgr_email = "test_store_mgr_settings@demo.store"
        if not frappe.db.exists("User", mgr_email):
            frappe.get_doc({
                "doctype": "User",
                "email": mgr_email,
                "first_name": "Test Store Manager",
                "roles": [{"role": "Store Manager"}],
            }).insert(ignore_permissions=True)

        frappe.set_user(mgr_email)
        with self.assertRaises(frappe.PermissionError):
            settings.set_flag("regional_catalog_enabled", 0)

    def test_get_settings_no_secret_leakage(self):
        frappe.set_user("Administrator")
        cfg = settings.get_settings()
        # Verify no sensitive keywords or credentials leak in public settings response
        for k in cfg.keys():
            self.assertNotIn("password", k.lower())
            self.assertNotIn("secret", k.lower())
            self.assertNotIn("token", k.lower())
            self.assertNotIn("key", k.lower())

    def test_server_status_database_health(self):
        from departmental_store.api import reports
        frappe.set_user("Administrator")
        status = reports.server_status()
        self.assertIn("database", status)
        db = status["database"]
        self.assertEqual(db.get("engine"), "MariaDB")
        self.assertIn("version", db)
        self.assertIn("innodb_deadlocks", db)
        self.assertIsInstance(db["innodb_deadlocks"], int)

    def test_set_flag_rejects_unknown_flag(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            settings.set_flag("non_existent_feature_flag", 1)

    def test_require_flag_guard(self):
        frappe.set_user("Administrator")
        settings.set_flag("camera_product_capture_enabled", 0)
        with self.assertRaises(frappe.PermissionError):
            settings.require_flag("camera_product_capture_enabled")

        settings.set_flag("camera_product_capture_enabled", 1)
        # Should not raise when enabled
        settings.require_flag("camera_product_capture_enabled")

        # Clean up
        settings.set_flag("camera_product_capture_enabled", 0)

    def test_get_store_profile_structure(self):
        frappe.set_user("Administrator")
        res = settings.get_store_profile()
        self.assertEqual(res.get("api_version"), 1)
        self.assertIn("profile", res)
        p = res["profile"]
        self.assertIn("store_name", p)
        self.assertIn("store_phone", p)
        self.assertIn("store_address", p)
        self.assertIn("receipt_header", p)
        self.assertIn("receipt_footer", p)
        self.assertIn("business_hours", p)
        self.assertIn("tax_number", p)
        self.assertIn("currency_symbol", p)

    def test_update_store_profile_authorized(self):
        frappe.set_user("Administrator")
        payload = {
            "store_name": "Test Modern Supermarket",
            "store_phone": "+91 99999 88888",
            "receipt_header": "Welcome to Test Modern!",
        }
        res = settings.update_store_profile(payload)
        self.assertEqual(res["profile"]["store_name"], "Test Modern Supermarket")
        self.assertEqual(res["profile"]["store_phone"], "+91 99999 88888")
        self.assertEqual(res["profile"]["receipt_header"], "Welcome to Test Modern!")

        # Reset back to default
        settings.update_store_profile({"store_name": "Demo Departmental Store"})

    def test_update_store_profile_unauthorized(self):
        cashier_email = "test_cashier_settings@demo.store"
        frappe.set_user(cashier_email)
        with self.assertRaises(frappe.PermissionError):
            settings.update_store_profile({"store_name": "Hacked Store"})

    def test_submit_support_request_success(self):
        frappe.set_user("Administrator")
        res = settings.submit_support_request(
            category="POS_SYNC",
            subject="Counter 2 offline sync issue",
            description="Offline bills taking over 2 minutes to drain during peak rush",
            priority="HIGH",
            diagnostics={"counter_count": 3, "secret_key": "sensitive_123"},
        )
        self.assertEqual(res["api_version"], 1)
        self.assertEqual(res["status"], "RECEIVED")
        self.assertTrue(res["ticket_id"].startswith("TKT-"))
        self.assertEqual(res["category"], "POS_SYNC")
        self.assertEqual(res["priority"], "HIGH")
        self.assertEqual(res["estimated_response_hours"], 4)

    def test_submit_support_request_validation(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            settings.submit_support_request(subject="", description="Valid description")
        with self.assertRaises(frappe.ValidationError):
            settings.submit_support_request(subject="Valid Subject", description="")
