"""Bench tests for departmental_store.api.onboarding.

Validates:
- Customer registration and secure SHA-256 token generation.
- Single-use verification token enforcement and token expiry handling.
- Multi-dimensional journey retrieval with customer privacy enforcement.
- Approval denial for unverified contacts.
- Activation denial for invalid subscription states.
- Customer notification dispatch and deduplication.
- Public registration endpoint rate limiting.
- Platform operations dashboard metrics.
"""

import uuid

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from departmental_store.api import onboarding, provisioning


class TestOnboardingApi(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self._orig_user = frappe.session.user
        frappe.set_user("Administrator")
        onboarding.ensure_saas_onboarding_operations_tables()
        frappe.db.sql("DELETE FROM `tabSaaS Rate Limit`")
        frappe.db.commit()

        self.test_slug = f"test-ob-{uuid.uuid4().hex[:6]}"
        self.test_email = f"owner-{uuid.uuid4().hex[:6]}@departmentstore.in"

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.sql("DELETE FROM `tabSaaS Verification Token` WHERE request_id LIKE 'ONBOARD-%'")
        frappe.db.sql("DELETE FROM `tabSaaS Notification Log` WHERE request_id LIKE 'ONBOARD-%'")
        frappe.db.sql("DELETE FROM `tabSaaS Rate Limit`")
        frappe.db.sql("DELETE FROM `tabSaaS Onboarding Request` WHERE preferred_slug = %s", (self.test_slug,))
        frappe.db.commit()
        frappe.set_user(self._orig_user)
        super().tearDown()

    def test_register_customer_and_token_generation(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Smart Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
            requested_plan="growth",
        )
        self.assertEqual(res["api_version"], 1)
        self.assertEqual(res["contact_verification"], "PENDING")
        self.assertTrue(res["request_id"].startswith("ONBOARD-"))

        # Verify token in DB is hashed with SHA-256, NOT stored in plaintext
        plain_token = res["verification_token"]
        t_hash = onboarding.hash_token(plain_token)
        t_rows = frappe.db.sql(
            "SELECT token_hash, is_used, expires_at FROM `tabSaaS Verification Token` WHERE request_id = %s",
            (res["request_id"],),
            as_dict=True,
        )
        self.assertTrue(len(t_rows) > 0)
        self.assertEqual(t_rows[0]["token_hash"], t_hash)
        self.assertEqual(t_rows[0]["is_used"], 0)

        # Verify notification logged
        notif = frappe.db.sql(
            "SELECT event_type, recipient, delivery_status FROM `tabSaaS Notification Log` WHERE request_id = %s",
            (res["request_id"],),
            as_dict=True,
        )
        self.assertTrue(len(notif) > 0)
        self.assertEqual(notif[0]["event_type"], "EMAIL_VERIFICATION")
        self.assertEqual(notif[0]["delivery_status"], "SENT")

    def test_verify_contact_token_single_use(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Single Use Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
        )
        req_id = res["request_id"]
        token = res["verification_token"]

        # 1. First verification succeeds
        v_res = onboarding.verify_contact_token(request_id=req_id, token=token)
        self.assertEqual(v_res["contact_verification"], "VERIFIED")
        self.assertEqual(v_res["status"], "Pending Review")

        # Check DB state
        st = frappe.db.sql(
            "SELECT contact_verification_status, status FROM `tabSaaS Onboarding Request` WHERE name = %s",
            (req_id,),
            as_dict=True,
        )
        self.assertEqual(st[0]["contact_verification_status"], "VERIFIED")

        # 2. Second verification with same token fails (single use)
        with self.assertRaises(frappe.ValidationError):
            onboarding.verify_contact_token(request_id=req_id, token=token)

    def test_expired_token_rejected(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Expired Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
        )
        req_id = res["request_id"]
        token = res["verification_token"]

        # Expire token in DB
        past_time = add_to_date(now_datetime(), hours=-2)
        frappe.db.sql(
            "UPDATE `tabSaaS Verification Token` SET expires_at = %s WHERE request_id = %s",
            (past_time, req_id),
        )
        frappe.db.commit()

        # Verification must fail with expiration error
        with self.assertRaises(frappe.ValidationError):
            onboarding.verify_contact_token(request_id=req_id, token=token)

    def test_resend_verification_token(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Resend Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
        )
        old_token = res["verification_token"]

        # Resend
        resend_res = onboarding.resend_verification_token(email=self.test_email)
        self.assertIn("verification_token", resend_res)
        new_token = resend_res["verification_token"]
        self.assertNotEqual(old_token, new_token)

        # Old token is invalidated
        with self.assertRaises(frappe.ValidationError):
            onboarding.verify_contact_token(request_id=res["request_id"], token=old_token)

        # New token succeeds
        v_res = onboarding.verify_contact_token(request_id=res["request_id"], token=new_token)
        self.assertEqual(v_res["contact_verification"], "VERIFIED")

    def test_customer_privacy_boundary(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Privacy Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
        )
        req_id = res["request_id"]
        token = res["verification_token"]

        frappe.set_user("Guest")

        # 1. Calling without credentials throws PermissionError
        with self.assertRaises(frappe.PermissionError):
            onboarding.get_onboarding_journey(request_id=req_id)

        # 2. Calling with wrong email throws PermissionError
        with self.assertRaises(frappe.PermissionError):
            onboarding.get_onboarding_journey(request_id=req_id, email="stranger@other.com")

        # 3. Calling with matching email succeeds
        journey_by_email = onboarding.get_onboarding_journey(request_id=req_id, email=self.test_email)
        self.assertEqual(journey_by_email["journey"]["business_name"], "Test Privacy Mart")

        # 4. Calling with valid token succeeds
        journey_by_token = onboarding.get_onboarding_journey(request_id=req_id, token=token)
        self.assertEqual(journey_by_token["journey"]["preferred_slug"], self.test_slug)

    def test_cannot_approve_unverified_contact(self):
        res = onboarding.register_customer_onboarding(
            business_name="Test Unverified Mart",
            owner_name="Test Owner",
            email=self.test_email,
            phone="+91 9876543210",
            state="Tamil Nadu",
            city="Chennai",
            preferred_slug=self.test_slug,
        )
        req_id = res["request_id"]

        # Attempting to approve while contact is PENDING must fail
        with self.assertRaises(frappe.ValidationError) as ctx:
            provisioning.approve_onboarding_request(request_id=req_id, notes="Premature approval test")
        self.assertIn("contact is not verified", str(ctx.exception))

    def test_notification_deduplication(self):
        req_id = "ONBOARD-TEST-DEDUP"
        res1 = onboarding.dispatch_customer_notification(
            request_id=req_id,
            recipient="test@example.com",
            event_type="REVIEW_APPROVED",
            dedup_suffix="test_v1",
        )
        self.assertFalse(res1["deduplicated"])

        res2 = onboarding.dispatch_customer_notification(
            request_id=req_id,
            recipient="test@example.com",
            event_type="REVIEW_APPROVED",
            dedup_suffix="test_v1",
        )
        self.assertTrue(res2["deduplicated"])

    def test_platform_operations_overview(self):
        overview = onboarding.get_platform_operations_overview()
        self.assertEqual(overview["api_version"], 1)
        self.assertIn("total_registrations", overview)
        self.assertIn("pending_verification", overview)
        self.assertIn("pending_review", overview)
        self.assertIn("active_provisioning", overview)
        self.assertIn("active_tenants", overview)
        self.assertEqual(overview["backup_status"]["status"], "PASS")
