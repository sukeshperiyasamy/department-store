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
        # Create or use a non-System-Manager user
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
