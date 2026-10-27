"""Bench tests for departmental_store.api.tenant.

Validates:
- Hostname normalization (scheme, port, casing, trailing dots, paths).
- Hostname validation (RFC 1123, IP blocking, length).
- Reserved domain detection.
- Tenant resolution by hostname (matches local site, rejects unknown, rejects reserved, rejects invalid).
- Server-side authorization on get_tenant_info (guest blocked, cross-tenant blocked).
- list_user_tenants returns active tenant memberships.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from departmental_store.api import tenant


class TestTenantApi(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self._orig_user = frappe.session.user
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user(self._orig_user)
        super().tearDown()

    def test_hostname_normalization(self):
        self.assertEqual(tenant.normalize_hostname("RAMESH.EXAMPLE.COM"), "ramesh.example.com")
        self.assertEqual(tenant.normalize_hostname("ramesh.example.com:8080"), "ramesh.example.com")
        self.assertEqual(
            tenant.normalize_hostname("https://ramesh.example.com:3000/path?q=1"),
            "ramesh.example.com",
        )
        self.assertEqual(tenant.normalize_hostname("ramesh.example.com."), "ramesh.example.com")
        self.assertEqual(tenant.normalize_hostname("  shop.dept.in  "), "shop.dept.in")

    def test_hostname_validation(self):
        valid, norm, reason = tenant.validate_hostname("ramesh.departmentstore.in")
        self.assertTrue(valid)
        self.assertEqual(norm, "ramesh.departmentstore.in")

        # Rejects raw IP
        valid_ip, _, reason_ip = tenant.validate_hostname("192.168.1.1")
        self.assertFalse(valid_ip)
        self.assertIn("Raw IP", reason_ip)

        # Rejects double dots
        valid_dots, _, reason_dots = tenant.validate_hostname("bad..host.com")
        self.assertFalse(valid_dots)

        # Rejects empty
        valid_empty, _, _ = tenant.validate_hostname("")
        self.assertFalse(valid_empty)

    def test_reserved_hostname_detection(self):
        self.assertTrue(tenant.is_reserved_hostname("admin"))
        self.assertTrue(tenant.is_reserved_hostname("api"))
        self.assertTrue(tenant.is_reserved_hostname("localhost"))
        self.assertFalse(tenant.is_reserved_hostname("ramesh"))
        self.assertFalse(tenant.is_reserved_hostname("ramesh.departmentstore.in"))

    def test_resolve_tenant_by_host_local_match(self):
        res = tenant.resolve_tenant_by_host("frontend")
        self.assertEqual(res.get("api_version"), 1)
        self.assertTrue(res.get("matched"))
        self.assertIsNotNone(res.get("tenant"))
        self.assertEqual(res["tenant"]["lifecycle_status"], "ACTIVE")

    def test_resolve_tenant_by_host_unknown_rejected(self):
        res = tenant.resolve_tenant_by_host("unknown-store.example.com")
        self.assertEqual(res.get("api_version"), 1)
        self.assertFalse(res.get("matched"))
        self.assertIsNone(res.get("tenant"))
        self.assertEqual(res["error"]["code"], "TENANT_NOT_FOUND")

    def test_resolve_tenant_by_host_reserved_rejected(self):
        res = tenant.resolve_tenant_by_host("api")
        self.assertEqual(res.get("api_version"), 1)
        self.assertFalse(res.get("matched"))
        self.assertEqual(res["error"]["code"], "RESERVED_HOSTNAME")

    def test_resolve_tenant_by_host_invalid_rejected(self):
        res = tenant.resolve_tenant_by_host("bad..host")
        self.assertEqual(res.get("api_version"), 1)
        self.assertFalse(res.get("matched"))
        self.assertEqual(res["error"]["code"], "INVALID_HOSTNAME")

    def test_get_tenant_info_requires_auth(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            tenant.get_tenant_info()

    def test_get_tenant_info_returns_clean_metadata(self):
        frappe.set_user("Administrator")
        info = tenant.get_tenant_info()
        self.assertEqual(info.get("api_version"), 1)
        t = info.get("tenant")
        self.assertIsNotNone(t)
        self.assertEqual(t.get("currency"), "INR")
        self.assertEqual(t.get("state_code"), "33")
        # Ensure sensitive database credentials are NOT leaked in tenant metadata
        self.assertNotIn("db_password", t)
        self.assertNotIn("encryption_key", t)

    def test_get_tenant_info_rejects_cross_tenant_query(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.PermissionError):
            tenant.get_tenant_info("99999999-9999-4999-8999-999999999999")

    def test_list_user_tenants_requires_auth(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            tenant.list_user_tenants()

    def test_list_user_tenants_authenticated(self):
        frappe.set_user("Administrator")
        res = tenant.list_user_tenants()
        self.assertEqual(res.get("api_version"), 1)
        tenants = res.get("tenants", [])
        self.assertGreaterEqual(len(tenants), 1)
        self.assertEqual(tenants[0]["role"], "TENANT_OWNER")
