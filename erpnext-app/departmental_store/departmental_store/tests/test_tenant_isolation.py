"""Automated End-to-End Two-Tenant Isolation Tests (Phase 4A).

Validates:
1. Hard boundary separation between synthetic Shop A and Shop B.
2. Hostname resolution to exactly one known tenant.
3. Server-side rejection of cross-tenant queries.
4. Server-side rejection of forged tenant IDs and spoofed hostnames.
5. Inactive, suspended, and unverified tenant rejection.
6. Zero default fallback for unknown hostnames.
"""

import unittest

import frappe

from departmental_store.api import billing, tenant
from departmental_store.api.provisioning import ensure_provisioning_tables
from departmental_store.api.tenant import get_tenant_info, list_user_tenants, resolve_tenant_by_host


class TestTenantIsolation(unittest.TestCase):
    def setUp(self):
        ensure_provisioning_tables()
        tenant.ensure_saas_membership_table()
        billing.ensure_saas_billing_tables()
        self._orig_user = frappe.session.user
        frappe.set_user("Administrator")

        # Synthetic Tenant A (Shop A)
        self.tenant_a_id = f"TID-A-{frappe.generate_hash(length=8).upper()}"
        self.slug_a = f"shop-a-{frappe.generate_hash(length=4).lower()}"
        self.host_a = f"{self.slug_a}.localhost"
        self.site_a = f"{self.slug_a}.local"

        # Synthetic Tenant B (Shop B)
        self.tenant_b_id = f"TID-B-{frappe.generate_hash(length=8).upper()}"
        self.slug_b = f"shop-b-{frappe.generate_hash(length=4).lower()}"
        self.host_b = f"{self.slug_b}.localhost"
        self.site_b = f"{self.slug_b}.local"

        # Synthetic Tenant C (Suspended Shop)
        self.tenant_c_id = f"TID-C-{frappe.generate_hash(length=8).upper()}"
        self.slug_c = f"shop-c-{frappe.generate_hash(length=4).lower()}"
        self.host_c = f"{self.slug_c}.localhost"

        # Register Shop A
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Shop A Supermarket', 'Shop A Retail Pvt Ltd', %s, %s,
                       'VERIFIED', 'ACTIVE', 'growth', '33', 'INR')""",
            (self.tenant_a_id, self.slug_a, self.site_a, self.host_a),
        )

        # Register Shop B
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Shop B Departmental', 'Shop B Trading LLP', %s, %s,
                       'VERIFIED', 'ACTIVE', 'starter', '33', 'INR')""",
            (self.tenant_b_id, self.slug_b, self.site_b, self.host_b),
        )

        # Register Shop C (Suspended)
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Shop C Suspended', 'Shop C Retailers', 'shop-c.local', %s,
                       'VERIFIED', 'SUSPENDED', 'starter', '33', 'INR')""",
            (self.tenant_c_id, self.slug_c, self.host_c),
        )
        frappe.db.commit()

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.cache().delete_value(f"reconcile_payments_{self.tenant_a_id}")
        frappe.cache().delete_value(f"reconcile_payments_{self.tenant_b_id}")
        frappe.db.sql(
            "DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id IN (%s, %s, %s)",
            (self.tenant_a_id, self.tenant_b_id, self.tenant_c_id),
        )
        frappe.db.sql(
            "DELETE FROM `tabSaaS Subscription` WHERE tenant_id IN (%s, %s, %s)",
            (self.tenant_a_id, self.tenant_b_id, self.tenant_c_id),
        )
        frappe.db.sql(
            "DELETE FROM `tabSaaS Invoice` WHERE tenant_id IN (%s, %s, %s)",
            (self.tenant_a_id, self.tenant_b_id, self.tenant_c_id),
        )
        frappe.db.sql(
            "DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id IN (%s, %s, %s)",
            (self.tenant_a_id, self.tenant_b_id, self.tenant_c_id),
        )
        for u_email in [
            "cashier_shop_a@example.com",
            "suspended_emp@example.com",
            "owner_a@example.com",
            "owner_b@example.com",
        ]:
            if frappe.db.exists("User", u_email):
                frappe.delete_doc("User", u_email, force=True, ignore_permissions=True)
        frappe.db.commit()
        frappe.set_user(self._orig_user)

    def test_hostname_resolution_isolation(self):
        """Shop A and Shop B hostnames resolve to their respective tenants and never cross-resolve."""
        # Host A resolves to Tenant A
        res_a = resolve_tenant_by_host(self.host_a)
        self.assertTrue(res_a["matched"])
        self.assertEqual(res_a["tenant"]["tenant_id"], self.tenant_a_id)
        self.assertEqual(res_a["tenant"]["slug"], self.slug_a)
        self.assertEqual(res_a["tenant"]["name"], "Shop A Supermarket")
        self.assertNotEqual(res_a["tenant"]["tenant_id"], self.tenant_b_id)

        # Host B resolves to Tenant B
        res_b = resolve_tenant_by_host(self.host_b)
        self.assertTrue(res_b["matched"])
        self.assertEqual(res_b["tenant"]["tenant_id"], self.tenant_b_id)
        self.assertEqual(res_b["tenant"]["slug"], self.slug_b)
        self.assertEqual(res_b["tenant"]["name"], "Shop B Departmental")
        self.assertNotEqual(res_b["tenant"]["tenant_id"], self.tenant_a_id)

    def test_no_default_tenant_on_unknown_host(self):
        """Unknown hosts must NEVER fall back to a default tenant or match Shop A / Shop B."""
        res_unknown = resolve_tenant_by_host("unregistered-shop.localhost")
        self.assertFalse(res_unknown["matched"])
        self.assertIsNone(res_unknown["tenant"])
        self.assertEqual(res_unknown["error"]["code"], "TENANT_NOT_FOUND")

    def test_suspended_tenant_rejected_at_resolution(self):
        """Suspended tenants cannot resolve to an active workspace."""
        res_c = resolve_tenant_by_host(self.host_c)
        self.assertFalse(res_c["matched"])
        self.assertEqual(res_c["error"]["code"], "TENANT_SUSPENDED")

    def test_cross_tenant_query_denied_server_side(self):
        """A user session on Shop A cannot query Shop B metadata by passing Shop B's tenant_id."""
        cashier_a = "cashier_shop_a@example.com"
        if not frappe.db.exists("User", cashier_a):
            u = frappe.new_doc("User")
            u.email = cashier_a
            u.first_name = "Cashier Shop A"
            u.append("roles", {"role": "Cashier"})
            u.insert(ignore_permissions=True)

        frappe.set_user(cashier_a)

        # Attempt to query Shop B's tenant info
        with self.assertRaises(frappe.PermissionError):
            get_tenant_info(tenant_id=self.tenant_b_id)

        # Attempt to query with forged arbitrary tenant ID
        with self.assertRaises(frappe.PermissionError):
            get_tenant_info(tenant_id="FORGED-UUID-0000-000000000000")

    def test_unverified_hostname_rejected_at_resolution(self):
        """Tenants with pending hostname verification are rejected with HOSTNAME_UNVERIFIED."""
        unverified_tid = f"TID-UNVER-{frappe.generate_hash(length=8).upper()}"
        unverified_slug = f"shop-unver-{frappe.generate_hash(length=4).lower()}"
        unverified_host = f"{unverified_slug}.localhost"

        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Unverified Shop', 'Unverified LLC', 'shop-unver.local', %s,
                       'PENDING', 'ACTIVE', 'starter', '33', 'INR')""",
            (unverified_tid, unverified_slug, unverified_host),
        )
        frappe.db.commit()

        try:
            res = resolve_tenant_by_host(unverified_host)
            self.assertFalse(res["matched"])
            self.assertEqual(res["error"]["code"], "HOSTNAME_UNVERIFIED")
        finally:
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (unverified_tid,))
            frappe.db.commit()

    def test_archived_tenant_rejected_at_resolution(self):
        """Archived tenants cannot resolve to an active workspace."""
        archived_tid = f"TID-ARCH-{frappe.generate_hash(length=8).upper()}"
        archived_slug = f"shop-arch-{frappe.generate_hash(length=4).lower()}"
        archived_host = f"{archived_slug}.localhost"

        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Archived Shop', 'Archived LLC', 'shop-arch.local', %s,
                       'VERIFIED', 'ARCHIVED', 'starter', '33', 'INR')""",
            (archived_tid, archived_slug, archived_host),
        )
        frappe.db.commit()

        try:
            res = resolve_tenant_by_host(archived_host)
            self.assertFalse(res["matched"])
            self.assertEqual(res["error"]["code"], "TENANT_ARCHIVED")
        finally:
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (archived_tid,))
            frappe.db.commit()

    def test_custom_production_domain_resolution(self):
        """Custom domains on departmentstore.in resolve correctly when verified and active."""
        prod_tid = f"TID-PROD-{frappe.generate_hash(length=8).upper()}"
        prod_slug = f"shop-prod-{frappe.generate_hash(length=4).lower()}"
        prod_host = f"{prod_slug}.departmentstore.in"

        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`, `state_code`, `currency`)
               VALUES (%s, %s, 'Production Shop', 'Production Supermarket Ltd', 'prod.local', %s,
                       'VERIFIED', 'ACTIVE', 'starter', '33', 'INR')""",
            (prod_tid, prod_slug, prod_host),
        )
        frappe.db.commit()

        try:
            res = resolve_tenant_by_host(prod_host)
            self.assertTrue(res["matched"])
            self.assertEqual(res["tenant"]["tenant_id"], prod_tid)
            self.assertEqual(res["tenant"]["primary_hostname"], prod_host)
        finally:
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (prod_tid,))
            frappe.db.commit()

    def test_cross_tenant_billing_access_denied(self):
        """A user belonging to Shop A cannot access Shop B's billing overview or create sessions."""
        user_shop_a = "cashier_shop_a@example.com"
        if not frappe.db.exists("User", user_shop_a):
            u = frappe.new_doc("User")
            u.email = user_shop_a
            u.first_name = "Cashier Shop A"
            u.append("roles", {"role": "Cashier"})
            u.insert(ignore_permissions=True)

        frappe.set_user(user_shop_a)

        # Attempt to access Shop B billing overview
        with self.assertRaises(frappe.PermissionError):
            billing.get_billing_overview(tenant_id=self.tenant_b_id)

        # Attempt to create checkout session for Shop B
        with self.assertRaises(frappe.PermissionError):
            billing.create_checkout_session(
                tenant_id=self.tenant_b_id,
                plan_id="starter",
                billing_interval="MONTHLY",
            )

    def test_suspended_membership_denied(self):
        """A user whose membership status is SUSPENDED is denied access even with valid tenant_id."""
        suspended_user = "suspended_emp@example.com"
        if not frappe.db.exists("User", suspended_user):
            u = frappe.new_doc("User")
            u.email = suspended_user
            u.first_name = "Suspended Employee"
            u.append("roles", {"role": "Store Manager"})
            u.insert(ignore_permissions=True)

        tenant.ensure_saas_membership_table()
        mem_id = f"MEM-SUSP-{frappe.generate_hash(length=8).upper()}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Membership`
               (membership_id, user_id, tenant_id, role, status)
               VALUES (%s, %s, %s, 'STORE_MANAGER', 'SUSPENDED')""",
            (mem_id, suspended_user, self.tenant_a_id),
        )
        frappe.db.commit()

        try:
            frappe.set_user(suspended_user)
            with self.assertRaises(frappe.PermissionError):
                get_tenant_info(tenant_id=self.tenant_a_id)
        finally:
            frappe.set_user("Administrator")
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE membership_id = %s", (mem_id,))
            frappe.db.commit()

    def test_cross_tenant_membership_isolation_in_listing(self):
        """Two users with distinct tenant memberships only see their own assigned workspace."""
        user_a = "owner_a@example.com"
        user_b = "owner_b@example.com"
        for email, name in [(user_a, "Owner A"), (user_b, "Owner B")]:
            if not frappe.db.exists("User", email):
                u = frappe.new_doc("User")
                u.email = email
                u.first_name = name
                u.append("roles", {"role": "Store Manager"})
                u.insert(ignore_permissions=True)

        tenant.ensure_saas_membership_table()
        mem_a = f"MEM-A-{frappe.generate_hash(length=8).upper()}"
        mem_b = f"MEM-B-{frappe.generate_hash(length=8).upper()}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Membership`
               (membership_id, user_id, tenant_id, role, status)
               VALUES (%s, %s, %s, 'TENANT_OWNER', 'ACTIVE')""",
            (mem_a, user_a, self.tenant_a_id),
        )
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Membership`
               (membership_id, user_id, tenant_id, role, status)
               VALUES (%s, %s, %s, 'TENANT_OWNER', 'ACTIVE')""",
            (mem_b, user_b, self.tenant_b_id),
        )
        frappe.db.commit()

        try:
            # User A only sees Tenant A
            frappe.set_user(user_a)
            list_a = list_user_tenants()
            self.assertEqual(len(list_a["tenants"]), 1)
            self.assertEqual(list_a["tenants"][0]["tenant_id"], self.tenant_a_id)

            # User B only sees Tenant B
            frappe.set_user(user_b)
            list_b = list_user_tenants()
            self.assertEqual(len(list_b["tenants"]), 1)
            self.assertEqual(list_b["tenants"][0]["tenant_id"], self.tenant_b_id)
        finally:
            frappe.set_user("Administrator")
            frappe.db.sql(
                "DELETE FROM `tabSaaS Tenant Membership` WHERE membership_id IN (%s, %s)",
                (mem_a, mem_b),
            )
            frappe.db.commit()

    def test_cross_tenant_cache_key_isolation(self):
        """Payment reconciliation cache keys are tenant-scoped and do not conflict."""
        key_a = f"reconcile_payments_{self.tenant_a_id}"
        key_b = f"reconcile_payments_{self.tenant_b_id}"

        frappe.cache().set_value(key_a, "IN_PROGRESS", expires_in_sec=60)
        self.assertEqual(frappe.cache().get_value(key_a), "IN_PROGRESS")
        self.assertIsNone(frappe.cache().get_value(key_b))

        frappe.cache().delete_value(key_a)
        frappe.cache().delete_value(key_b)
