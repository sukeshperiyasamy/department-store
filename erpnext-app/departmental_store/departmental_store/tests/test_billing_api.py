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
        frappe.cache().delete_value(f"reconcile_payments_{self.test_tenant_id}")
        frappe.cache().delete_value("reconcile_payments_global")
        if hasattr(self, "secondary_tenant_id") and self.secondary_tenant_id:
            frappe.cache().delete_value(f"reconcile_payments_{self.secondary_tenant_id}")
            frappe.db.sql("DELETE FROM `tabSaaS Invoice` WHERE tenant_id = %s", (self.secondary_tenant_id,))
            frappe.db.sql("DELETE FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.secondary_tenant_id,))
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id = %s", (self.secondary_tenant_id,))
            frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.secondary_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Billing Audit Log` WHERE entity_id LIKE %s", (f"%{self.test_tenant_id}%",))
        frappe.db.sql("DELETE FROM `tabSaaS Invoice` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Payment Transaction` WHERE customer_id IN (SELECT name FROM `tabSaaS Customer Account` WHERE user_id = 'test_owner')")
        frappe.db.sql("DELETE FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.test_tenant_id,))
        frappe.db.sql("DELETE FROM `tabPOS Device` WHERE device_id IN ('COUNTER-TEST-01', 'COUNTER-TEST-02')")
        for u in ["test_cashier_billing@demo.store", "test_mgr_billing@demo.store"]:
            if frappe.db.exists("User", u):
                frappe.delete_doc("User", u, force=True, ignore_permissions=True)
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

    def test_webhook_missing_and_invalid_signatures(self):
        body = json.dumps({"event": "payment.captured", "id": "evt_test_sig"})
        sec = billing.DEFAULT_WEBHOOK_SECRET
        valid_sig = hmac.new(sec.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()

        # Missing signature throws PermissionError
        with self.assertRaises(frappe.PermissionError):
            billing.process_billing_webhook(raw_payload=body, signature="")

        # Tampered signature throws PermissionError
        with self.assertRaises(frappe.PermissionError):
            billing.process_billing_webhook(raw_payload=body, signature="sha256_fake_tampered_sig")

        # Missing body throws ValidationError
        with self.assertRaises(frappe.ValidationError):
            billing.process_billing_webhook(raw_payload="", signature=valid_sig)

    def test_webhook_out_of_order_replay_guard(self):
        # 1. Establish successful payment first
        session = billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        order_id = session["order_id"]
        sec = billing.DEFAULT_WEBHOOK_SECRET

        success_payload = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_success_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
        })
        sig_success = hmac.new(sec.encode("utf-8"), success_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=success_payload, signature=sig_success)

        # 2. Replay an out-of-order stale payment.failed event for the same order
        fail_payload = json.dumps({
            "event": "payment.failed",
            "event_id": f"evt_stale_fail_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "reason": "Old delayed failure notice",
        })
        sig_fail = hmac.new(sec.encode("utf-8"), fail_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=fail_payload, signature=sig_fail)

        # 3. Transaction and subscription must STILL be SUCCESS / ACTIVE
        tx = frappe.db.sql(
            "SELECT status FROM `tabSaaS Payment Transaction` WHERE provider_order_id = %s",
            (order_id,),
            as_dict=True,
        )
        self.assertEqual(tx[0]["status"], "SUCCESS")

        sub = frappe.db.sql(
            "SELECT status FROM `tabSaaS Subscription` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        self.assertEqual(sub[0]["status"], "ACTIVE")

    def test_webhook_refund_and_dispute_processing(self):
        # Setup captured payment transaction
        tx_id = str(uuid.uuid4())
        pay_id = f"pay_{uuid.uuid4().hex[:8]}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Payment Transaction`
               (name, subscription_id, customer_id, amount_paise, currency, status, provider_payment_id)
               VALUES (%s, 'sub-test-rfnd', 'cust-test', 176882, 'INR', 'SUCCESS', %s)""",
            (tx_id, pay_id),
        )
        frappe.db.commit()

        sec = billing.DEFAULT_WEBHOOK_SECRET

        # 1. Process refund
        refund_payload = json.dumps({
            "event": "refund.processed",
            "event_id": f"evt_rfnd_{uuid.uuid4().hex[:8]}",
            "payment_id": pay_id,
            "amount": 176882,
        })
        sig_rfnd = hmac.new(sec.encode("utf-8"), refund_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=refund_payload, signature=sig_rfnd)

        tx_after_rfnd = frappe.db.sql("SELECT status FROM `tabSaaS Payment Transaction` WHERE name = %s", (tx_id,), as_dict=True)
        self.assertEqual(tx_after_rfnd[0]["status"], "REFUNDED")

        # 2. Process dispute
        dispute_payload = json.dumps({
            "event": "payment.disputed",
            "event_id": f"evt_disp_{uuid.uuid4().hex[:8]}",
            "payment_id": pay_id,
        })
        sig_disp = hmac.new(sec.encode("utf-8"), dispute_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=dispute_payload, signature=sig_disp)

        tx_after_disp = frappe.db.sql("SELECT status FROM `tabSaaS Payment Transaction` WHERE name = %s", (tx_id,), as_dict=True)
        self.assertEqual(tx_after_disp[0]["status"], "DISPUTED")

    def test_payment_gateway_mode_fail_closed_guards(self):
        import os

        # Normal sandbox configuration passes cleanly
        mode_info = billing.validate_payment_gateway_mode()
        self.assertEqual(mode_info["mode"], "SANDBOX")

        old_key = os.environ.get("RAZORPAY_KEY_ID")
        old_live = os.environ.get("RAZORPAY_LIVE_MODE")
        old_kyc = os.environ.get("RAZORPAY_KYC_VERIFIED")
        try:
            # 1. Missing or empty key fails closed
            os.environ["RAZORPAY_KEY_ID"] = ""
            with self.assertRaises(frappe.ValidationError):
                billing.validate_payment_gateway_mode()

            os.environ["RAZORPAY_KEY_ID"] = "   "
            with self.assertRaises(frappe.ValidationError):
                billing.validate_payment_gateway_mode()

            # 2. Malformed key prefix (must start with rzp_test_ or rzp_live_)
            os.environ["RAZORPAY_KEY_ID"] = "sk_test_fake12345"
            with self.assertRaises(frappe.ValidationError):
                billing.validate_payment_gateway_mode()

            # 3. Accidental live key without RAZORPAY_LIVE_MODE raises ValidationError
            os.environ["RAZORPAY_KEY_ID"] = "rzp_live_accidental123"
            os.environ["RAZORPAY_LIVE_MODE"] = "false"
            with self.assertRaises(frappe.ValidationError):
                billing.validate_payment_gateway_mode()

            # 4. Test key with RAZORPAY_LIVE_MODE enabled raises ValidationError
            os.environ["RAZORPAY_KEY_ID"] = "rzp_test_validkey123"
            os.environ["RAZORPAY_LIVE_MODE"] = "true"
            with self.assertRaises(frappe.ValidationError):
                billing.validate_payment_gateway_mode()

            # 5. Live key + live mode but KYC not verified raises PermissionError
            os.environ["RAZORPAY_KEY_ID"] = "rzp_live_commercial123"
            os.environ["RAZORPAY_LIVE_MODE"] = "true"
            os.environ["RAZORPAY_KYC_VERIFIED"] = "false"
            with self.assertRaises(frappe.PermissionError):
                billing.validate_payment_gateway_mode()
        finally:
            if old_key is not None:
                os.environ["RAZORPAY_KEY_ID"] = old_key
            else:
                os.environ.pop("RAZORPAY_KEY_ID", None)
            if old_live is not None:
                os.environ["RAZORPAY_LIVE_MODE"] = old_live
            else:
                os.environ.pop("RAZORPAY_LIVE_MODE", None)
            if old_kyc is not None:
                os.environ["RAZORPAY_KYC_VERIFIED"] = old_kyc
            else:
                os.environ.pop("RAZORPAY_KYC_VERIFIED", None)

    def test_reconciliation_authorization_boundaries(self):
        # 1. Setup secondary synthetic tenant
        self.secondary_tenant_id = str(uuid.uuid4())
        secondary_slug = f"secondary-{uuid.uuid4().hex[:6]}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname,
                hostname_status, frappe_site_name, plan_id, created_by)
               VALUES (%s, %s, 'Secondary Store', 'Secondary Store Ltd', 'ACTIVE', %s, 'VERIFIED', 'frontend', 'starter', 'Administrator')""",
            (self.secondary_tenant_id, secondary_slug, f"{secondary_slug}.departmentstore.in"),
        )

        # 2. Setup Cashier user and Store Manager user
        cashier_email = "test_cashier_billing@demo.store"
        if not frappe.db.exists("User", cashier_email):
            frappe.get_doc({
                "doctype": "User",
                "email": cashier_email,
                "first_name": "Test Cashier Billing",
                "roles": [{"role": "Cashier"}],
            }).insert(ignore_permissions=True)

        mgr_email = "test_mgr_billing@demo.store"
        if not frappe.db.exists("User", mgr_email):
            frappe.get_doc({
                "doctype": "User",
                "email": mgr_email,
                "first_name": "Test Manager Billing",
                "roles": [{"role": "Store Manager"}],
            }).insert(ignore_permissions=True)

        # Assign cashier as CASHIER and manager as STORE_MANAGER for test_tenant_id
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Membership` (membership_id, tenant_id, user_id, role, status)
               VALUES (%s, %s, %s, 'CASHIER', 'ACTIVE')""",
            (f"MEM-CSH-{uuid.uuid4().hex[:8]}", self.test_tenant_id, cashier_email),
        )
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Membership` (membership_id, tenant_id, user_id, role, status)
               VALUES (%s, %s, %s, 'STORE_MANAGER', 'ACTIVE')""",
            (f"MEM-MGR-{uuid.uuid4().hex[:8]}", self.test_tenant_id, mgr_email),
        )
        frappe.db.commit()

        # Check 1: Guest caller is rejected
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments()
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id)

        # Check 2: Cashier caller is rejected (requires STORE_MANAGER or TENANT_OWNER)
        frappe.set_user(cashier_email)
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id)

        # Check 3: Store Manager attempting platform-wide reconciliation is rejected
        frappe.set_user(mgr_email)
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments(tenant_id=None)

        # Check 4: Store Manager attempting cross-tenant reconciliation is rejected
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments(tenant_id=self.secondary_tenant_id)

        # Check 5: Requesting non-existent tenant throws DoesNotExistError
        with self.assertRaises(frappe.DoesNotExistError):
            billing.reconcile_subscription_payments(tenant_id="nonexistent-tid-000")

        # Check 6: Store Manager attempting auto_heal=True is rejected (Platform Admin only)
        with self.assertRaises(frappe.PermissionError):
            billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id, auto_heal=True)

        # Check 7: Store Manager reconciling their own shop succeeds
        res = billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id, auto_heal=False)
        self.assertEqual(res["api_version"], 1)
        self.assertEqual(res["tenant_id"], self.test_tenant_id)

        # Check 8: Platform Admin (Administrator) can reconcile platform-wide and auto-heal
        frappe.set_user("Administrator")
        admin_res = billing.reconcile_subscription_payments(tenant_id=None, auto_heal=False)
        self.assertEqual(admin_res["api_version"], 1)
        self.assertIsNone(admin_res["tenant_id"])

    def test_reconciliation_concurrency_lock(self):
        frappe.set_user("Administrator")
        lock_key = f"reconcile_payments_{self.test_tenant_id}"
        frappe.cache().set_value(lock_key, "1", expires_in_sec=120)
        try:
            res_locked = billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id)
            self.assertEqual(res_locked["status"], "LOCKED")
            self.assertIn("already in progress", res_locked["message"])
        finally:
            frappe.cache().delete_value(lock_key)

        # After releasing lock, reconciliation proceeds cleanly
        res = billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id)
        self.assertEqual(res["api_version"], 1)

    def test_webhook_unknown_order_fails_closed(self):
        # Webhook referring to unknown order must fail closed with ValidationError
        fake_payload = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_fake_{uuid.uuid4().hex[:8]}",
            "order_id": "order_non_existent_fake_99999",
            "payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
        })
        sec = billing.DEFAULT_WEBHOOK_SECRET
        sig = hmac.new(sec.encode("utf-8"), fake_payload.encode("utf-8"), hashlib.sha256).hexdigest()

        with self.assertRaises(frappe.ValidationError):
            billing.process_billing_webhook(raw_payload=fake_payload, signature=sig)

    def test_webhook_tenant_mismatch_rejected(self):
        # Create valid checkout session for tenant
        session = billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        order_id = session["order_id"]

        # Payload supplies mismatched tenant_id
        forged_payload = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_mismatch_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
            "tenant_id": "forged_other_tenant_id_999",
        })
        sec = billing.DEFAULT_WEBHOOK_SECRET
        sig = hmac.new(sec.encode("utf-8"), forged_payload.encode("utf-8"), hashlib.sha256).hexdigest()

        with self.assertRaises(frappe.PermissionError):
            billing.process_billing_webhook(raw_payload=forged_payload, signature=sig)

    def test_webhook_duplicate_capture_no_duplicate_invoice(self):
        session = billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        order_id = session["order_id"]
        sec = billing.DEFAULT_WEBHOOK_SECRET

        # Event 1: payment.captured
        p1 = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_cap_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": f"pay_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
        })
        s1 = hmac.new(sec.encode("utf-8"), p1.encode("utf-8"), hashlib.sha256).hexdigest()
        r1 = billing.process_billing_webhook(raw_payload=p1, signature=s1)
        self.assertEqual(r1["status"], "PROCESSED")

        inv_count_1 = frappe.db.count("SaaS Invoice", filters={"tenant_id": self.test_tenant_id})
        self.assertEqual(inv_count_1, 1)

        sub_before = frappe.db.sql(
            "SELECT current_period_end FROM `tabSaaS Subscription` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        period_end_before = str(sub_before[0]["current_period_end"])

        # Event 2: order.paid with DIFFERENT event_id for the SAME order
        p2 = json.dumps({
            "event": "order.paid",
            "event_id": f"evt_orderpaid_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": f"pay_same_{uuid.uuid4().hex[:8]}",
            "amount": 176882,
        })
        s2 = hmac.new(sec.encode("utf-8"), p2.encode("utf-8"), hashlib.sha256).hexdigest()
        r2 = billing.process_billing_webhook(raw_payload=p2, signature=s2)
        self.assertEqual(r2["status"], "PROCESSED")

        # Invariant checks: invoice count remains 1; subscription period end is not extended twice
        inv_count_2 = frappe.db.count("SaaS Invoice", filters={"tenant_id": self.test_tenant_id})
        self.assertEqual(inv_count_2, 1)

        sub_after = frappe.db.sql(
            "SELECT current_period_end FROM `tabSaaS Subscription` WHERE tenant_id = %s",
            (self.test_tenant_id,),
            as_dict=True,
        )
        self.assertEqual(str(sub_after[0]["current_period_end"]), period_end_before)

    def test_webhook_full_vs_partial_refund_distinction(self):
        session = billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        order_id = session["order_id"]
        pay_id = f"pay_rfnd_{uuid.uuid4().hex[:8]}"
        sec = billing.DEFAULT_WEBHOOK_SECRET

        cap_payload = json.dumps({
            "event": "payment.captured",
            "event_id": f"evt_cap_for_rfnd_{uuid.uuid4().hex[:8]}",
            "order_id": order_id,
            "payment_id": pay_id,
            "amount": 176882,
        })
        sig_cap = hmac.new(sec.encode("utf-8"), cap_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=cap_payload, signature=sig_cap)

        # 1. Partial refund (50000 paise out of 176882 paise)
        part_rfnd_payload = json.dumps({
            "event": "refund.processed",
            "event_id": f"evt_part_rfnd_{uuid.uuid4().hex[:8]}",
            "payment_id": pay_id,
            "amount": 50000,
        })
        sig_part = hmac.new(sec.encode("utf-8"), part_rfnd_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=part_rfnd_payload, signature=sig_part)

        tx_part = frappe.db.sql("SELECT status FROM `tabSaaS Payment Transaction` WHERE provider_payment_id = %s", (pay_id,), as_dict=True)
        self.assertEqual(tx_part[0]["status"], "PARTIALLY_REFUNDED")

        inv_part = frappe.db.sql("SELECT payment_status FROM `tabSaaS Invoice` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(inv_part[0]["payment_status"], "PARTIALLY_REFUNDED")

        sub_part = frappe.db.sql("SELECT status FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(sub_part[0]["status"], "ACTIVE")

        tenant_part = frappe.db.sql("SELECT lifecycle_status FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(tenant_part[0]["lifecycle_status"], "ACTIVE")

        # 2. Full refund (176882 paise)
        full_rfnd_payload = json.dumps({
            "event": "refund.processed",
            "event_id": f"evt_full_rfnd_{uuid.uuid4().hex[:8]}",
            "payment_id": pay_id,
            "amount": 176882,
        })
        sig_full = hmac.new(sec.encode("utf-8"), full_rfnd_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        billing.process_billing_webhook(raw_payload=full_rfnd_payload, signature=sig_full)

        tx_full = frappe.db.sql("SELECT status FROM `tabSaaS Payment Transaction` WHERE provider_payment_id = %s", (pay_id,), as_dict=True)
        self.assertEqual(tx_full[0]["status"], "REFUNDED")

        inv_full = frappe.db.sql("SELECT payment_status FROM `tabSaaS Invoice` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(inv_full[0]["payment_status"], "REFUNDED")

        sub_full = frappe.db.sql("SELECT status FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(sub_full[0]["status"], "CANCELLED")

        tenant_full = frappe.db.sql("SELECT lifecycle_status FROM `tabSaaS Tenant Registry` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(tenant_full[0]["lifecycle_status"], "SUSPENDED")

    def test_reconciliation_auto_heal_discrepancy_handling(self):
        # Setup expired ACTIVE subscription
        billing.create_checkout_session(tenant_id=self.test_tenant_id, plan_id="starter")
        frappe.db.sql(
            """UPDATE `tabSaaS Subscription`
               SET status = 'ACTIVE', current_period_end = DATE_SUB(NOW(), INTERVAL 5 DAY)
               WHERE tenant_id = %s""",
            (self.test_tenant_id,),
        )
        frappe.db.commit()

        # Run reconciliation with auto_heal=True as Administrator
        frappe.set_user("Administrator")
        report = billing.reconcile_subscription_payments(tenant_id=self.test_tenant_id, auto_heal=True)
        self.assertEqual(report["api_version"], 1)

        # Verify discrepancy was identified and healed
        expired_discrepancies = [d for d in report["discrepancies"] if d["type"] == "EXPIRED_PERIOD_ACTIVE"]
        self.assertTrue(len(expired_discrepancies) > 0)
        self.assertEqual(expired_discrepancies[0]["healed"], "HEALED_MARKED_PAST_DUE")

        # Verify database record updated to PAST_DUE
        sub_row = frappe.db.sql("SELECT status FROM `tabSaaS Subscription` WHERE tenant_id = %s", (self.test_tenant_id,), as_dict=True)
        self.assertEqual(sub_row[0]["status"], "PAST_DUE")
