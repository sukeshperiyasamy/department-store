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

    def test_slug_availability(self):
        # Available slug
        res = tenant.check_slug_availability("fresh-retail-mart")
        self.assertEqual(res.get("api_version"), 1)
        self.assertTrue(res.get("available"))

        # Reserved slug
        res_res = tenant.check_slug_availability("admin")
        self.assertFalse(res_res.get("available"))
        self.assertIn("reserved", res_res.get("reason", "").lower())

        # Invalid format
        res_inv = tenant.check_slug_availability("bad--slug")
        self.assertFalse(res_inv.get("available"))

    def test_submit_demo_request(self):
        demo_data = {
            "business_name": "Madurai Super Store",
            "contact_name": "Ramanathan",
            "email": "raman@example.com",
            "phone": "9876543210",
            "city": "Madurai",
            "state": "Tamil Nadu",
            "counter_count": 2,
            "message": "Interested in 2 counters with ESC/POS printers",
            "consent_given": 1,
        }
        res = tenant.submit_demo_request(demo_data)
        self.assertEqual(res.get("api_version"), 1)
        self.assertTrue(res.get("request_id", "").startswith("DEMO-"))
        self.assertEqual(res.get("status"), "Pending Review")

        # Missing consent rejected
        bad_data = dict(demo_data, consent_given=0)
        with self.assertRaises(frappe.ValidationError):
            tenant.submit_demo_request(bad_data)

    def test_submit_onboarding_request(self):
        unique_slug = f"shop-{frappe.generate_hash(length=6).lower()}"
        onboard_data = {
            "business_name": "Covai Retail Hub",
            "owner_name": "Karthik Subramanian",
            "email": "karthik@example.com",
            "phone": "9123456789",
            "state": "Tamil Nadu",
            "city": "Coimbatore",
            "preferred_slug": unique_slug,
            "requested_plan": "growth",
            "agreed_to_terms": 1,
        }
        res = tenant.submit_onboarding_request(onboard_data)
        self.assertEqual(res.get("api_version"), 1)
        self.assertTrue(res.get("request_id", "").startswith("ONBOARD-"))
        self.assertEqual(res.get("preferred_slug"), unique_slug)
        self.assertEqual(res.get("status"), "Pending Review")

        # Submitting the same slug again is rejected
        with self.assertRaises(frappe.ValidationError):
            tenant.submit_onboarding_request(onboard_data)

    def test_resolve_tenant_by_host_registry(self):
        # 1. Active tenant in registry
        slug_a = f"shopa-{frappe.generate_hash(length=6).lower()}"
        tid_a = f"TID-{frappe.generate_hash(length=8).upper()}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`)
               VALUES (%s, %s, 'Shop A Enterprise', 'Shop A LLP', %s, %s, 'VERIFIED', 'ACTIVE', 'growth')""",
            (tid_a, slug_a, f"{slug_a}.local", f"{slug_a}.localhost"),
        )

        # 2. Suspended tenant in registry
        slug_s = f"shopsus-{frappe.generate_hash(length=6).lower()}"
        tid_s = f"TID-{frappe.generate_hash(length=8).upper()}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`)
               VALUES (%s, %s, 'Suspended Shop', 'Suspended Shop LLP', %s, %s, 'VERIFIED', 'SUSPENDED', 'starter')""",
            (tid_s, slug_s, f"{slug_s}.local", f"{slug_s}.localhost"),
        )
        frappe.db.commit()

        try:
            # Active resolution by primary host
            res_a = tenant.resolve_tenant_by_host(f"{slug_a}.localhost")
            self.assertTrue(res_a.get("matched"))
            self.assertEqual(res_a["tenant"]["slug"], slug_a)
            self.assertEqual(res_a["tenant"]["lifecycle_status"], "ACTIVE")

            # Active resolution by subdomain pattern
            res_sub = tenant.resolve_tenant_by_host(f"{slug_a}.localhost")
            self.assertTrue(res_sub.get("matched"))
            self.assertEqual(res_sub["tenant"]["tenant_id"], tid_a)

            # Suspended resolution returns error TENANT_SUSPENDED
            res_sus = tenant.resolve_tenant_by_host(f"{slug_s}.localhost")
            self.assertFalse(res_sus.get("matched"))
            self.assertEqual(res_sus["error"]["code"], "TENANT_SUSPENDED")

            # Unknown host returns TENANT_NOT_FOUND
            res_unk = tenant.resolve_tenant_by_host("completely-unknown-shop.localhost")
            self.assertFalse(res_unk.get("matched"))
            self.assertEqual(res_unk["error"]["code"], "TENANT_NOT_FOUND")
        finally:
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id IN (%s, %s)", (tid_a, tid_s))
            frappe.db.commit()

    def test_cross_tenant_info_access_denial(self):
        # Ordinary user cannot query arbitrary tenant_id
        frappe.set_user("Administrator")
        cashier_email = "isolated_cashier@example.com"
        if not frappe.db.exists("User", cashier_email):
            u = frappe.new_doc("User")
            u.email = cashier_email
            u.first_name = "Cashier"
            u.append("roles", {"role": "Cashier"})
            u.insert(ignore_permissions=True)

        frappe.set_user(cashier_email)
        with self.assertRaises(frappe.PermissionError):
            tenant.get_tenant_info(tenant_id="00000000-0000-4000-8000-999999999999")
