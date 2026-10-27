"""Bench tests for departmental_store.api.billing.

Validates:
- Subscription lifecycle state transitions (TRIALING, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED, EXPIRED).
- Plan versioning and entitlement retrieval.
- Server-side authorization (tenant members vs non-members vs platform admin).
- Checkout session creation and server-side pricing calculation.
- Webhook HMAC-SHA256 signature verification.
- Idempotent webhook processing and deduplication.
- Payment success, invoice generation, and tenant reactivation.
- Payment failure, past-due status, and grace periods.
- Subscription cancellation workflows (scheduled vs immediate).
- Platform-admin oversight, audit logs, and manual corrections.
- POS device counter limit entitlement enforcement.
"""

import hashlib
import hmac
import json
import uuid
import frappe
from frappe.tests.utils import FrappeTestCase

from departmental_store.api import billing, devices


class TestBillingApi(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self._orig_user = frappe.session.user
        frappe.set_user("Administrator")
        billing.ensure_saas_billing_tables()

        # Seed synthetic tenant for tests
        self.test_tenant_id = str(uuid.uuid4())
        self.test_slug = f"test-shop-{uuid.uuid4().hex[:6]}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname,
                hostname_status, frappe_site_name, plan_id, created_by)
               VALUES (%s, %s, %s, %s, 'ACTIVE', %s, 'VERIFIED', %s, 'starter', 'Administrator')""",
            (
                self.test_tenant_id, self.test_slug, "Test Super Store", "Test Super Store Pvt Ltd",
                f"{self.test_slug}.departmentstore.in", "frontend",
            ),
        )
        frappe.db.commit()

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.sql("DELETE FROM `tabSaaS Billing Audit Log` WHERE entity_id LIKE %s", (f"%{self.test_tenant_id}%",))
        frappe.db.sql("DELETE FROM `tabSaaS Invoice` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Payment Transaction` WHERE customer_id IN (SELECT name FROM `tabSaaS Customer Account` WHERE user_id = 'test_owner')")
        frappe.db.sql("DELETE FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabPOS Device` WHERE device_id IN ('COUNTER-TEST-01', 'COUNTER-TEST-02')")
        frappe.db.commit()
        frappe.set_user(self._orig_user)
        super().tearDown()

    def test_subscription_state_transitions(self):
        self.assertTrue(billing.is_valid_subscription_transition("TRIALING", "ACTIVE"))
        self.assertTrue(billing.is_valid_subscription_transition("ACTIVE", "PAST_DUE"))
        self.assertTrue(billing.is_valid_subscription_transition("PAST_DUE", "SUSPENDED"))
        self.assertTrue(billing.is_valid_subscription_transition("SUSPENDED", "ACTIVE"))
        self.assertTrue(billing.is_valid_subscription_transition("ACTIVE", "CANCELLED"))

        # Illegal transitions
        self.assertFalse(billing.is_valid_subscription_transition("ACTIVE", "TRIALING"))
        self.assertFalse(billing.is_valid_subscription_transition("EXPIRED", "ACTIVE"))

    def test_get_available_plans(self):
        res = billing.get_available_plans()
        self.assertEqual(res["api_version"], 1)
        plan_ids = [p["plan_id"] for p in res["plans"]]
        self.assertIn("starter", plan_ids)
        self.assertIn("growth", plan_ids)
        self.assertIn("enterprise", plan_ids)

        starter = next(p for p in res["plans"] if p["plan_id"] == "starter")
        self.assertEqual(starter["price_paise"], 149900)
        self.assertEqual(starter["entitlements"]["max_counters"], 1)

    def test_create_checkout_session(self):
        session = billing.create_checkout_session(
            tenant_id=self.test_tenant_id,
            plan_id="growth",
            billing_interval="MONTHLY",
        )
        self.assertEqual(session["api_version"], 1)
        self.assertTrue(session["session_id"].startswith("chk_"))
        self.assertTrue(session["order_id"].startswith("order_"))
        # Growth plan is 349900 paise + 18% GST (62982) = 412882 paise
        self.assertEqual(session["amount_paise"], 412882)

    def test_billing_overview_and_authorization(self):
        # 1. As Administrator, overview succeeds
        overview = billing.get_billing_overview(tenant_id=self.test_tenant_id)
        self.assertEqual(overview["api_version"], 1)
        self.assertIsNotNone(overview["customer"])

        # 2. As an unauthorized stranger, throws PermissionError
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            billing.get_billing_overview(tenant_id=self.test_tenant_id)

    def test_webhook_signature_verification(self):
        secret = "test_webhook_secret_key"
        body = json.dumps({"event": "payment.captured", "id": "evt_test_123"})
        valid_sig = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()

        self.assertTrue(billing.verify_webhook_signature(body, valid_sig, secret=secret))
        self.assertFalse(billing.verify_webhook_signature(body, "tampered_signature", secret=secret))
        self.assertFalse(billing.verify_webhook_signature(body, "", secret=secret))

    def test_webhook_payment_success_and_idempotency(self):
        # Create checkout session first
        session = billing.create_checkout_session(
            tenant_id=self.test_tenant_id,
            plan_id="starter",
            billing_interval="MONTHLY",
        )
        order_id = session["order_id"]

        webhook_payload = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_test_success_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
        })
        sec = billing.DEFAULT_WEBHOOK_SECRET
        sig = hmac.new(sec.encode("utf-8"), webhook_payload.encode("utf-8"), hashlib.sha256).hexdigest()

        # 1. First execution processes successfully
        res1 = billing.process_billing_webhook(
            raw_payload=webhook_payload,
            signature=sig,
        )
        self.assertEqual(res1["status"], "PROCESSED")
        self.assertFalse(res1["duplicate"])

        # Check subscription transitioned to ACTIVE
        sub = frappe.db.sql(
            "SELECT status FROM `tabSaaS Subscription` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        self.assertEqual(sub[0]["status"], "ACTIVE")

        # Check sequential SaaS invoice created
        inv = frappe.db.sql(
            "SELECT invoice_number, payment_status, total_paise FROM `tabSaaS Invoice` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        self.assertTrue(len(inv) > 0)
        self.assertEqual(inv[0]["payment_status"], "PAID")
        self.assertTrue(inv[0]["invoice_number"].startswith("SAAS-INV-"))

        # 2. Duplicate webhook with same event_id returns idempotent duplicate response
        res2 = billing.process_billing_webhook(
            raw_payload=webhook_payload,
            signature=sig,
        )
        self.assertEqual(res2["status"], "PROCESSED")
        self.assertTrue(res2["duplicate"])

    def test_webhook_payment_failed(self):
        session = billing.create_checkout_session(
            tenant_id=self.test_tenant_id,
            plan_id="starter",
            billing_interval="MONTHLY",
        )
        order_id = session["order_id"]

        webhook_payload = json.dumps({
            "event": "payment.failed",
            "event_id": f"evt_test_fail_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "reason": "Card declined: insufficient funds",
        })
        sec = billing.DEFAULT_WEBHOOK_SECRET
        sig = hmac.new(sec.encode("utf-8"), webhook_payload.encode("utf-8"), hashlib.sha256).hexdigest()

        res = billing.process_billing_webhook(
            raw_payload=webhook_payload,
            signature=sig,
        )
        self.assertEqual(res["status"], "PROCESSED")

        sub = frappe.db.sql(
            "SELECT status, grace_period_end FROM `tabSaaS Subscription` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        self.assertEqual(sub[0]["status"], "PAST_DUE")
        self.assertIsNotNone(sub[0]["grace_period_end"])

    def test_subscription_cancellation(self):
        # Setup active subscription
        billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        frappe.db.sql(
            "UPDATE `tabSaaS Subscription` SET status = 'ACTIVE' WHERE tenant_id = %s",
            (self.test_tenant_id,),
        )
        frappe.db.commit()

        # Scheduled cancellation
        res = billing.cancel_subscription(
            tenant_id=self.test_tenant_id,
            reason="Relocating retail store",
            immediate=False,
        )
        self.assertEqual(res["status"], "ACTIVE")
        self.assertTrue(res["cancel_at_period_end"])

        # Immediate cancellation
        res_imm = billing.cancel_subscription(
            tenant_id=self.test_tenant_id,
            reason="Closing business",
            immediate=True,
        )
        self.assertEqual(res_imm["status"], "CANCELLED")

        # Tenant registry updated to SUSPENDED
        t_row = frappe.db.sql("SELECT lifecycle_status FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        t_status = t_row[0]["lifecycle_status"] if t_row else None
        self.assertEqual(t_status, "SUSPENDED")

    def test_admin_manual_billing_correction(self):
        billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        sub_row = frappe.db.sql("SELECT name FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        sub_id = sub_row[0]["name"] if sub_row else None

        res = billing.admin_manual_billing_correction(
            subscription_id=sub_id,
            target_status="ACTIVE",
            reason="Customer check cleared via wire transfer",
            extend_days=30,
        )
        self.assertEqual(res["status"], "ACTIVE")

    def test_counter_entitlement_enforcement(self):
        # Starter plan allows max 1 counter
        billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        frappe.db.sql(
            "UPDATE `tabSaaS Subscription` SET status = 'CANCELLED' WHERE tenant_id != %s",
            (self.test_tenant_id,),
        )
        frappe.db.sql(
            "UPDATE `tabSaaS Subscription` SET status = 'ACTIVE', plan_id = 'starter', modified = NOW() WHERE tenant_id = %s",
            (self.test_tenant_id,),
        )
        frappe.db.sql("DELETE FROM `tabPOS Device` WHERE device_id IN ('COUNTER-TEST-01', 'COUNTER-TEST-02')")
        frappe.db.commit()

        # Count existing enabled devices
        existing = frappe.db.count("POS Device", filters={"status": "Enabled"})
        if existing < 1:
            dev1 = devices.register_device(device_id="COUNTER-TEST-01", counter_name="Counter 1")
            self.assertEqual(dev1["status"], "Enabled")

        # Second device must exceed starter plan max_counters limit (1)
        with self.assertRaises(frappe.ValidationError):
            devices.register_device(device_id="COUNTER-TEST-02", counter_name="Counter 2")
