"""Automated unit and integration tests for the SaaS Provisioning Pipeline and Platform Admin APIs."""

import unittest
import frappe
from departmental_store.api.provisioning import (
    ALLOWED_STATE_TRANSITIONS,
    approve_onboarding_request,
    claim_next_provisioning_job,
    ensure_provisioning_tables,
    execute_provisioning_pipeline,
    get_onboarding_detail,
    is_valid_transition,
    list_onboarding_requests,
    record_audit_log,
    reject_onboarding_request,
    retry_provisioning_job,
    sanitize_error,
    set_tenant_status,
    process_provisioning_job,
)


class TestProvisioningApi(unittest.TestCase):
    def setUp(self):
        ensure_provisioning_tables()
        frappe.set_user("Administrator")
        self.test_slug = f"test-shop-{frappe.generate_hash(length=6).lower()}"
        self.request_id = f"ONB-TEST-{frappe.generate_hash(length=8).upper()}"

        # Seed test onboarding request
        frappe.db.sql(
            """INSERT INTO `tabSaaS Onboarding Request`
               (`name`, `business_name`, `owner_name`, `email`, `phone`, `state`, `city`,
                `preferred_slug`, `requested_plan`, `agreed_to_terms`, `status`)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'growth', 1, 'PENDING_REVIEW')""",
            (
                self.request_id,
                "Test Departmental Mart",
                "T. Owner",
                f"{self.test_slug}@example.in",
                "+91 98400 99999",
                "Tamil Nadu",
                "Chennai",
                self.test_slug,
            ),
        )
        frappe.db.commit()

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.sql("DELETE FROM `tabSaaS Provisioning Audit Log` WHERE request_id = %s", (self.request_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Provisioning Job` WHERE request_id = %s", (self.request_id,))
        frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE slug = %s", (self.test_slug,))
        frappe.db.sql("DELETE FROM `tabSaaS Onboarding Request` WHERE name = %s", (self.request_id,))
        frappe.db.commit()

    def test_state_machine_transition_rules(self):
        # Valid forward flow
        self.assertTrue(is_valid_transition("PENDING_REVIEW", "APPROVED"))
        self.assertTrue(is_valid_transition("PENDING_REVIEW", "REJECTED"))
        self.assertTrue(is_valid_transition("APPROVED", "PROVISIONING"))
        self.assertTrue(is_valid_transition("PROVISIONING", "PROVISIONED"))
        self.assertTrue(is_valid_transition("PROVISIONING", "PROVISIONING_FAILED"))
        self.assertTrue(is_valid_transition("PROVISIONED", "VERIFICATION_PENDING"))
        self.assertTrue(is_valid_transition("VERIFICATION_PENDING", "ACTIVE"))
        self.assertTrue(is_valid_transition("ACTIVE", "SUSPENDED"))
        self.assertTrue(is_valid_transition("SUSPENDED", "ACTIVE"))
        self.assertTrue(is_valid_transition("ACTIVE", "ARCHIVED"))
        self.assertTrue(is_valid_transition("PROVISIONING_FAILED", "APPROVED"))

        # Invalid transitions
        self.assertFalse(is_valid_transition("PENDING_REVIEW", "ACTIVE"))
        self.assertFalse(is_valid_transition("APPROVED", "ACTIVE"))
        self.assertFalse(is_valid_transition("REJECTED", "PROVISIONING"))
        self.assertFalse(is_valid_transition("ARCHIVED", "ACTIVE"))

    def test_platform_admin_authorization_boundaries(self):
        # 1. Guest user is rejected
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            list_onboarding_requests()

        # 2. Store Manager / Cashier without Platform Admin is rejected
        frappe.set_user("Administrator")
        test_cashier = "test_cashier_user@example.com"
        if not frappe.db.exists("User", test_cashier):
            u = frappe.new_doc("User")
            u.email = test_cashier
            u.first_name = "Cashier"
            u.append("roles", {"role": "Cashier"})
            u.insert(ignore_permissions=True)

        frappe.set_user(test_cashier)
        with self.assertRaises(frappe.PermissionError):
            list_onboarding_requests()

        # 3. System Manager without Platform Admin is also rejected (ADR-0008 isolation)
        frappe.set_user("Administrator")
        test_mgr = "test_sysmgr_tenant@example.com"
        if not frappe.db.exists("User", test_mgr):
            u = frappe.new_doc("User")
            u.email = test_mgr
            u.first_name = "Tenant SysMgr"
            u.append("roles", {"role": "System Manager"})
            u.insert(ignore_permissions=True)

        frappe.set_user(test_mgr)
        with self.assertRaises(frappe.PermissionError):
            approve_onboarding_request(self.request_id, "Attempted tenant breach")

        # 4. Administrator is accepted
        frappe.set_user("Administrator")
        res = list_onboarding_requests()
        self.assertEqual(res["api_version"], 1)
        self.assertIsInstance(res["requests"], list)

    def test_approve_onboarding_request(self):
        res = approve_onboarding_request(self.request_id, notes="Verified phone & GSTIN")
        self.assertEqual(res["status"], "APPROVED")
        self.assertTrue(res["job_id"].startswith("JOB-"))
        self.assertEqual(res["assigned_site_name"], f"{self.test_slug}.localhost")

        # Verify job row created
        job = frappe.db.sql(
            "SELECT status, tenant_slug FROM `tabSaaS Provisioning Job` WHERE job_id = %s",
            (res["job_id"],),
            as_dict=True,
        )
        self.assertTrue(job)
        self.assertEqual(job[0]["status"], "PENDING")
        self.assertEqual(job[0]["tenant_slug"], self.test_slug)

        # Verify audit log
        audit = frappe.db.sql(
            "SELECT from_status, to_status, actor FROM `tabSaaS Provisioning Audit Log` WHERE request_id = %s ORDER BY timestamp DESC",
            (self.request_id,),
            as_dict=True,
        )
        self.assertTrue(audit)
        self.assertEqual(audit[0]["from_status"], "PENDING_REVIEW")
        self.assertEqual(audit[0]["to_status"], "APPROVED")

    def test_reject_onboarding_request(self):
        res = reject_onboarding_request(self.request_id, reason="Incomplete store documentation")
        self.assertEqual(res["status"], "REJECTED")

        # Verify updated in DB
        status = frappe.db.get_value("SaaS Onboarding Request", self.request_id, "status")
        self.assertEqual(status, "REJECTED")

    def test_provisioning_worker_atomic_claim(self):
        # Approve request to generate pending job
        appr = approve_onboarding_request(self.request_id)
        job_id = appr["job_id"]

        # Worker 1 claims job
        claimed_1 = claim_next_provisioning_job(worker_id="worker-node-1")
        self.assertIsNotNone(claimed_1)
        self.assertEqual(claimed_1["job_id"], job_id)

        # Worker 2 attempts claim while job is RUNNING - must get None (preventing duplicate site creation)
        claimed_2 = claim_next_provisioning_job(worker_id="worker-node-2")
        self.assertIsNone(claimed_2)

    def test_provisioning_pipeline_execution(self):
        appr = approve_onboarding_request(self.request_id)
        job_id = appr["job_id"]
        claimed = claim_next_provisioning_job(worker_id="test-worker")
        self.assertIsNotNone(claimed)

        # Execute pipeline in test_mode to verify step transitions and registry insertion
        exec_res = execute_provisioning_pipeline(job_id, test_mode=True)
        self.assertTrue(exec_res["success"])
        self.assertEqual(exec_res["status"], "VERIFICATION_PENDING")

        # Verify tenant was created in registry
        tenant = frappe.db.sql(
            "SELECT slug, lifecycle_status, primary_hostname FROM `tabSaaS Tenant Registry` WHERE slug = %s",
            (self.test_slug,),
            as_dict=True,
        )
        self.assertTrue(tenant)
        self.assertEqual(tenant[0]["lifecycle_status"], "VERIFICATION_PENDING")
        self.assertEqual(tenant[0]["primary_hostname"], f"{self.test_slug}.departmentstore.in")

    def test_provisioning_pipeline_failure_and_retry(self):
        appr = approve_onboarding_request(self.request_id)
        job_id = appr["job_id"]
        claim_next_provisioning_job(worker_id="test-worker")

        # Trigger failure by setting an invalid slug on the job record
        frappe.db.sql("UPDATE `tabSaaS Provisioning Job` SET tenant_slug = 'bad--slug' WHERE job_id = %s", (job_id,))
        frappe.db.commit()

        exec_res = execute_provisioning_pipeline(job_id, test_mode=True)
        self.assertFalse(exec_res["success"])
        self.assertEqual(exec_res["status"], "PROVISIONING_FAILED")

        # Verify request status transitioned to PROVISIONING_FAILED
        req_status = frappe.db.sql(
            "SELECT status FROM `tabSaaS Onboarding Request` WHERE name = %s",
            (self.request_id,),
            as_dict=True,
        )[0]["status"]
        self.assertEqual(req_status, "PROVISIONING_FAILED")

        # Test retry action
        # First fix the slug back
        frappe.db.sql("UPDATE `tabSaaS Onboarding Request` SET preferred_slug = %s WHERE name = %s", (self.test_slug, self.request_id))
        frappe.db.commit()

        retry_res = retry_provisioning_job(self.request_id, reason="Resolved network configuration")
        self.assertEqual(retry_res["status"], "APPROVED")
        self.assertEqual(retry_res["retry_count"], 1)

    def test_tenant_suspension_and_reactivation(self):
        # Seed an active tenant in the registry
        tenant_id = f"TID-{frappe.generate_hash(length=8).upper()}"
        frappe.db.sql(
            """INSERT INTO `tabSaaS Tenant Registry`
               (`tenant_id`, `slug`, `name`, `legal_name`, `frappe_site_name`, `primary_hostname`,
                `hostname_status`, `lifecycle_status`, `plan_id`)
               VALUES (%s, %s, 'Sample Store', 'Sample Store LLP', 'sample.local', 'sample.dept.in', 'VERIFIED', 'ACTIVE', 'starter')""",
            (tenant_id, self.test_slug),
        )
        frappe.db.commit()

        # Suspend
        sus_res = set_tenant_status(tenant_id, "SUSPENDED", reason="Payment gateway chargeback investigation")
        self.assertEqual(sus_res["status"], "SUSPENDED")

        # Reactivate
        react_res = set_tenant_status(tenant_id, "ACTIVE", reason="Investigation cleared")
        self.assertEqual(react_res["status"], "ACTIVE")

    def test_secret_redaction(self):
        raw_error = "Database error: Access denied for user 'admin'@'db' (using password: secret_password_123) with token: bearer_xyz987"
        redacted = sanitize_error(raw_error)
        self.assertNotIn("secret_password_123", redacted)
        self.assertNotIn("bearer_xyz987", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_provisioning_worker_stale_job_reclamation(self):
        app_res = approve_onboarding_request(self.request_id, "Testing stale job reclaim")
        job_id = app_res["job_id"]

        # Simulate a worker that crashed (heartbeat older than 600 seconds)
        frappe.db.sql(
            """UPDATE `tabSaaS Provisioning Job`
               SET status = 'RUNNING', worker_id = 'crashed-worker-99',
                   heartbeat_at = NOW() - INTERVAL 900 SECOND
               WHERE job_id = %s""",
            (job_id,),
        )
        frappe.db.commit()

        # Recovery worker claims next eligible job
        claimed = claim_next_provisioning_job(worker_id="recovery-worker-1")
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["job_id"], job_id)

        # Verify job was reclaimed with incremented retry count
        job_row = frappe.db.sql(
            "SELECT status, worker_id, retry_count FROM `tabSaaS Provisioning Job` WHERE job_id = %s",
            (job_id,),
            as_dict=True,
        )[0]
        self.assertEqual(job_row["status"], "RUNNING")
        self.assertEqual(job_row["worker_id"], "recovery-worker-1")
        self.assertEqual(job_row["retry_count"], 1)

    def test_cli_argument_password_redaction(self):
        raw_cli_err = "Error: bench new-site failed with command: bench new-site --admin-password secret_pass_xyz --db-root-password mariadb_root_pwd_99 shop.localhost"
        redacted = sanitize_error(raw_cli_err)
        self.assertNotIn("secret_pass_xyz", redacted)
        self.assertNotIn("mariadb_root_pwd_99", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_process_provisioning_job_entry_point(self):
        app_res = approve_onboarding_request(self.request_id, "Testing worker entry point")
        job_id = app_res["job_id"]

        res = process_provisioning_job(job_id=job_id, test_mode=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "VERIFICATION_PENDING")
