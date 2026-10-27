import unittest

import frappe

from departmental_store.api.health import get_liveness, get_system_health


class TestHealthApi(unittest.TestCase):
    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_liveness_probe_accessible(self):
        frappe.set_user("Guest")
        res = get_liveness()
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["app"], "departmental_store")
        self.assertTrue(res.get("correlation_id"))

    def test_system_health_unauthorized_guest_denied(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            get_system_health()

    def test_system_health_admin_authorized(self):
        frappe.set_user("Administrator")
        res = get_system_health()
        self.assertIn(res["status"], ["ok", "degraded"])
        self.assertIn("database", res["checks"])
        self.assertEqual(res["checks"]["database"]["status"], "healthy")
        self.assertIn("redis", res["checks"])
        self.assertIn("storage", res["checks"])
        self.assertIn("tenants", res["checks"])
        self.assertIn("pos_sync_24h", res["checks"])
        self.assertIn("provisioning", res["checks"])
        self.assertTrue(res.get("correlation_id"))

    def test_system_health_token_authorized(self):
        frappe.set_user("Guest")
        frappe.conf.health_check_token = "test-secret-token-12345"
        try:
            res = get_system_health(token="test-secret-token-12345")
            self.assertIn(res["status"], ["ok", "degraded"])
            self.assertIn("database", res["checks"])
        finally:
            frappe.conf.pop("health_check_token", None)

    def test_pilot_status_guest_denied(self):
        frappe.set_user("Guest")
        from departmental_store.api.health import get_pilot_status
        with self.assertRaises(frappe.PermissionError):
            get_pilot_status()

    def test_pilot_status_admin_authorized(self):
        frappe.set_user("Administrator")
        from departmental_store.api.health import get_pilot_status
        res = get_pilot_status()
        self.assertEqual(res["api_version"], 1)
        self.assertIn("pilot_tenants", res)
        self.assertIn("provisioning_jobs", res)
        self.assertIn("pos_sync", res)
        self.assertIn("system_health", res)
        self.assertIn("escalation_thresholds", res)
