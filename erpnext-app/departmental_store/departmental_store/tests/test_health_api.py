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
