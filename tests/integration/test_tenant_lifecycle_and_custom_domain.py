#!/usr/bin/env python3
"""End-to-End Tenant Lifecycle Enforcement & Custom-Domain Routing Test (Phase 20).

Verifies the complete real HTTP request path against Frappe Nginx (port 8080):
1. Active tenant on valid platform hostname accesses protected business APIs (200 OK).
2. Suspended tenant is denied access to protected business APIs (HTTP 403 TENANT_SUSPENDED).
3. Archived tenant is denied access to protected business APIs (HTTP 403 TENANT_ARCHIVED).
4. Provisioning / Inactive tenant is denied access (HTTP 403 TENANT_INACTIVE).
5. Unverified primary hostname is denied access (HTTP 403 HOSTNAME_UNVERIFIED).
6. Verified custom domain resolves to the correct tenant site and database (200 OK).
7. Unverified custom domain fails closed (HTTP 404 Not Found).
8. Removed custom domain immediately fails closed (HTTP 404 Not Found).
9. Custom domain mapped to wrong tenant / collision attempt fails closed.
10. Forged forwarding and site-selection headers (Host / X-Frappe-Site-Name / X-Forwarded-Host)
    cannot hijack routing.
11. Unknown and mismatched hostnames fail closed (HTTP 404).
12. Authenticated user without active membership in tenant is denied (HTTP 403 MEMBERSHIP_INACTIVE).
13. User authenticated in Tenant A cannot access Tenant B records (HTTP 401/403).
14. Real-time cache invalidation: status changes take effect immediately without stale window.
15. Existing POS sales submission succeeds while ACTIVE and is blocked while SUSPENDED.
16. Guarded teardown drops disposable test sites and unlinks custom-domain symlinks.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

CONTAINER_NAME = "departmental-erp-backend-1"
FRONTEND_CONTAINER = "departmental-erp-frontend-1"
HTTP_BASE_URL = "http://127.0.0.1:8080"

SITE_A = "e2e-life-a.local"
SITE_B = "e2e-life-b.local"

CUSTOM_DOMAIN_VERIFIED_A = "pos.shopalpha-verified.local"
CUSTOM_DOMAIN_UNVERIFIED_A = "pos.shopalpha-unverified.local"
CUSTOM_DOMAIN_REMOVED_A = "pos.shopalpha-removed.local"

DB_ROOT_USER = "root"
DB_ROOT_PASSWORD = "admin"

TID_A = "TID-E2E-LIFE-A-0001"
SLUG_A = "life-tenant-a"
COMPANY_A = "Store Alpha Lifestyle"
ITEM_A = "SKU-LIFE-A-001"
ITEM_NAME_A = "Alpha Whole Grain Bread"
USER_A_ACTIVE = "cashier_a_life@example.com"
USER_A_INACTIVE = "cashier_inactive_life@example.com"
API_KEY_A = "API_KEY_LIFE_A_001"
API_SEC_A = "API_SEC_LIFE_A_001"
API_KEY_A_INACTIVE = "API_KEY_LIFE_A_INACT"
API_SEC_A_INACTIVE = "API_SEC_LIFE_A_INACT"

TID_B = "TID-E2E-LIFE-B-0002"
SLUG_B = "life-tenant-b"
COMPANY_B = "Store Beta Supermart"
ITEM_B = "SKU-LIFE-B-002"
ITEM_NAME_B = "Beta Fresh Milk"
USER_B = "cashier_b_life@example.com"
API_KEY_B = "API_KEY_LIFE_B_002"
API_SEC_B = "API_SEC_LIFE_B_002"


def run_cmd(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Execute command and return result."""
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def find_latest_backup_dump() -> Path | None:
    """Find most recent verified database dump."""
    backup_root = Path(os.environ.get("BACKUP_ROOT", Path.home() / "departmental-backups"))
    if not backup_root.exists():
        return None
    dirs = sorted([d for d in backup_root.iterdir() if d.is_dir() and not d.name.startswith(".")], reverse=True)
    for b_dir in dirs:
        sums_file = b_dir / "SHA256SUMS.txt"
        if sums_file.exists():
            with open(sums_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split(maxsplit=1)
                    if len(parts) == 2 and "database.sql.gz" in parts[1]:
                        dump_path = b_dir / parts[1].lstrip("* \t")
                        if dump_path.exists():
                            return dump_path
    return None


def http_request(
    path: str,
    host: str,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    data: dict | None = None,
) -> tuple[int, Any, dict[str, str]]:
    """Make HTTP request directly against port 8080 with specified Host header."""
    url = f"{HTTP_BASE_URL}{path}"
    req_headers = {
        "Host": host,
        "User-Agent": "DepartmentalStore-E2E-Lifecycle-Test/1.0",
        "Accept": "application/json",
    }
    if headers:
        req_headers.update(headers)

    body_bytes = None
    if data is not None:
        body_bytes = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, headers=req_headers, method=method, data=body_bytes)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status_code = resp.status
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            raw_body = resp.read().decode("utf-8")
            try:
                body_json = json.loads(raw_body)
                return status_code, body_json, resp_headers
            except json.JSONDecodeError:
                return status_code, raw_body, resp_headers
    except urllib.error.HTTPError as e:
        status_code = e.code
        resp_headers = {k.lower(): v for k, v in e.headers.items()}
        raw_body = e.read().decode("utf-8")
        try:
            body_json = json.loads(raw_body)
            return status_code, body_json, resp_headers
        except json.JSONDecodeError:
            return status_code, raw_body, resp_headers
    except urllib.error.URLError as e:
        return 0, str(e), {}


def execute_lifecycle_and_custom_domain_test() -> dict[str, Any]:
    """Execute complete end-to-end lifecycle enforcement and custom domain routing test."""
    print("=" * 80, flush=True)
    print("PHASE 20 — TENANT LIFECYCLE ENFORCEMENT & CUSTOM-DOMAIN ROUTING VERIFICATION", flush=True)
    print("=" * 80, flush=True)

    report: dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_type": "E2E_TENANT_LIFECYCLE_AND_CUSTOM_DOMAIN",
        "site_a": SITE_A,
        "site_b": SITE_B,
        "http_base_url": HTTP_BASE_URL,
        "status": "INITIALIZING",
        "checks": {},
        "errors": [],
    }

    # 1. Preflight checks
    for c_name in [CONTAINER_NAME, FRONTEND_CONTAINER]:
        chk = run_cmd(["docker", "inspect", "-f", "{{.State.Running}}", c_name], check=False)
        if chk.returncode != 0 or "true" not in chk.stdout.lower():
            report["status"] = "BLOCKED"
            report["errors"].append(f"Required container '{c_name}' is not running.")
            return report

    ping_status, ping_body, _ = http_request("/api/method/frappe.ping", host="frontend")
    if ping_status != 200 or not isinstance(ping_body, dict) or ping_body.get("message") != "pong":
        report["status"] = "BLOCKED"
        report["errors"].append(f"Port 8080 unreachable: status={ping_status}, body={ping_body}")
        return report
    print("[+] Baseline connectivity verified on port 8080 (frontend -> pong).", flush=True)

    # 2. Locate backup dump
    db_dump = find_latest_backup_dump()
    if not db_dump:
        report["status"] = "BLOCKED"
        report["errors"].append("No valid database backup dump found.")
        return report
    print(f"[*] Found verified backup archive: {db_dump.name}", flush=True)

    tmp_dir = f"/tmp/e2e_life_{int(time.time())}"
    run_cmd(["docker", "exec", CONTAINER_NAME, "mkdir", "-p", tmp_dir])
    run_cmd(["docker", "cp", str(db_dump), f"{CONTAINER_NAME}:{tmp_dir}/dump.sql.gz"])

    sites_to_clean = []
    symlinks_to_clean = [CUSTOM_DOMAIN_VERIFIED_A, CUSTOM_DOMAIN_UNVERIFIED_A, CUSTOM_DOMAIN_REMOVED_A]

    try:
        # 3. Provision Site A and Site B
        for site in [SITE_A, SITE_B]:
            existing_sites = run_cmd(["docker", "exec", CONTAINER_NAME, "ls", "-1", "/home/frappe/frappe-bench/sites"]).stdout
            if site in existing_sites:
                print(f"[!] Prior site '{site}' detected. Dropping cleanly...", flush=True)
                run_cmd(
                    ["docker", "exec", CONTAINER_NAME, "bench", "drop-site", site, "--force",
                     "--db-root-username", DB_ROOT_USER, "--db-root-password", DB_ROOT_PASSWORD],
                    check=False,
                )

            print(f"[*] Provisioning disposable site '{site}'...", flush=True)
            run_cmd([
                "docker", "exec", CONTAINER_NAME, "bench", "new-site", site,
                "--no-mariadb-socket",
                "--admin-password", "admin",
                "--db-root-username", DB_ROOT_USER,
                "--db-root-password", DB_ROOT_PASSWORD,
            ])
            sites_to_clean.append(site)

            run_cmd([
                "docker", "exec", CONTAINER_NAME, "bench", "--site", site, "restore",
                f"{tmp_dir}/dump.sql.gz",
                "--db-root-username", DB_ROOT_USER,
                "--db-root-password", DB_ROOT_PASSWORD,
            ])

        print("[+] Disposable sites provisioned and restored from base backup.", flush=True)

        # 4. Seed and configure Site A and Site B
        seed_script = f"""
import json
import frappe
from departmental_store.api import tenant, provisioning, billing

# === SEED SITE A ===
frappe.init(site="{SITE_A}")
frappe.connect()
frappe.set_user("Administrator")
tenant.ensure_saas_lead_tables()
provisioning.ensure_provisioning_tables()
tenant.ensure_saas_membership_table()
billing.ensure_saas_billing_tables()

# Set Site A company
if frappe.db.exists("Company", "{COMPANY_A}"):
    frappe.delete_doc("Company", "{COMPANY_A}", force=True, ignore_permissions=True)
comp_a = frappe.new_doc("Company")
comp_a.company_name = "{COMPANY_A}"
comp_a.default_currency = "INR"
comp_a.country = "India"
comp_a.insert(ignore_permissions=True)
frappe.db.set_single_value("Global Defaults", "default_company", "{COMPANY_A}")

# Set Site A Item
if frappe.db.exists("Item", "{ITEM_A}"):
    frappe.delete_doc("Item", "{ITEM_A}", force=True, ignore_permissions=True)
item_a = frappe.new_doc("Item")
item_a.item_code = "{ITEM_A}"
item_a.item_name = "{ITEM_NAME_A}"
item_a.item_group = "All Item Groups"
item_a.stock_uom = "Nos"
item_a.is_stock_item = 0
item_a.standard_rate = 55.0
item_a.gst_hsn_code = "999999"
item_a.insert(ignore_permissions=True)

# Set Site A Active Cashier User
if frappe.db.exists("User", "{USER_A_ACTIVE}"):
    frappe.delete_doc("User", "{USER_A_ACTIVE}", force=True, ignore_permissions=True)
u_a = frappe.new_doc("User")
u_a.email = "{USER_A_ACTIVE}"
u_a.first_name = "Cashier Alpha Active"
u_a.send_welcome_email = 0
u_a.insert(ignore_permissions=True)
u_a.add_roles("Cashier", "Stock User", "Item Manager")
u_a.api_key = "{API_KEY_A}"
u_a.api_secret = "{API_SEC_A}"
u_a.save(ignore_permissions=True)

# Set Site A Inactive/Suspended Membership User
if frappe.db.exists("User", "{USER_A_INACTIVE}"):
    frappe.delete_doc("User", "{USER_A_INACTIVE}", force=True, ignore_permissions=True)
u_inact = frappe.new_doc("User")
u_inact.email = "{USER_A_INACTIVE}"
u_inact.first_name = "Cashier Alpha Inactive"
u_inact.send_welcome_email = 0
u_inact.insert(ignore_permissions=True)
u_inact.add_roles("Cashier", "Stock User", "Item Manager")
u_inact.api_key = "{API_KEY_A_INACTIVE}"
u_inact.api_secret = "{API_SEC_A_INACTIVE}"
u_inact.save(ignore_permissions=True)

# Set Tenants in tabSaaS Tenant Registry
frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id IN ('{TID_A}', '{TID_B}')")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Registry`
    (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname, hostname_status, frappe_site_name, custom_domains)
    VALUES ('{TID_A}', '{SLUG_A}', '{COMPANY_A}', 'Alpha Life Pvt Ltd', 'ACTIVE', '{SITE_A}', 'VERIFIED', '{SITE_A}', '[\"{CUSTOM_DOMAIN_VERIFIED_A}\"]')
\"\"\")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Registry`
    (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname, hostname_status, frappe_site_name, custom_domains)
    VALUES ('{TID_B}', '{SLUG_B}', '{COMPANY_B}', 'Beta Mart LLP', 'ACTIVE', '{SITE_B}', 'VERIFIED', '{SITE_B}', '[]')
\"\"\")

# Set Memberships
frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id = '{TID_A}'")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Membership`
    (membership_id, user_id, tenant_id, role, status)
    VALUES ('MEM-A-ACTIVE', '{USER_A_ACTIVE}', '{TID_A}', 'CASHIER', 'ACTIVE')
\"\"\")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Membership`
    (membership_id, user_id, tenant_id, role, status)
    VALUES ('MEM-A-INACTIVE', '{USER_A_INACTIVE}', '{TID_A}', 'CASHIER', 'SUSPENDED')
\"\"\")
frappe.db.commit()
frappe.destroy()

# === SEED SITE B ===
frappe.init(site="{SITE_B}")
frappe.connect()
frappe.set_user("Administrator")
tenant.ensure_saas_lead_tables()
provisioning.ensure_provisioning_tables()
tenant.ensure_saas_membership_table()
billing.ensure_saas_billing_tables()

# Set Site B company
if frappe.db.exists("Company", "{COMPANY_B}"):
    frappe.delete_doc("Company", "{COMPANY_B}", force=True, ignore_permissions=True)
comp_b = frappe.new_doc("Company")
comp_b.company_name = "{COMPANY_B}"
comp_b.default_currency = "INR"
comp_b.country = "India"
comp_b.insert(ignore_permissions=True)
frappe.db.set_single_value("Global Defaults", "default_company", "{COMPANY_B}")

# Set Site B Item
if frappe.db.exists("Item", "{ITEM_B}"):
    frappe.delete_doc("Item", "{ITEM_B}", force=True, ignore_permissions=True)
item_b = frappe.new_doc("Item")
item_b.item_code = "{ITEM_B}"
item_b.item_name = "{ITEM_NAME_B}"
item_b.item_group = "All Item Groups"
item_b.stock_uom = "Nos"
item_b.is_stock_item = 0
item_b.standard_rate = 38.0
item_b.gst_hsn_code = "999999"
item_b.insert(ignore_permissions=True)

# Set Site B Cashier User
if frappe.db.exists("User", "{USER_B}"):
    frappe.delete_doc("User", "{USER_B}", force=True, ignore_permissions=True)
u_b = frappe.new_doc("User")
u_b.email = "{USER_B}"
u_b.first_name = "Cashier Beta"
u_b.send_welcome_email = 0
u_b.insert(ignore_permissions=True)
u_b.add_roles("Cashier", "Stock User", "Item Manager")
u_b.api_key = "{API_KEY_B}"
u_b.api_secret = "{API_SEC_B}"
u_b.save(ignore_permissions=True)

# Set Tenants in tabSaaS Tenant Registry
frappe.db.sql("DELETE FROM `tabSaaS Tenant Registry` WHERE tenant_id IN ('{TID_A}', '{TID_B}')")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Registry`
    (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname, hostname_status, frappe_site_name, custom_domains)
    VALUES ('{TID_A}', '{SLUG_A}', '{COMPANY_A}', 'Alpha Life Pvt Ltd', 'ACTIVE', '{SITE_A}', 'VERIFIED', '{SITE_A}', '[\"{CUSTOM_DOMAIN_VERIFIED_A}\"]')
\"\"\")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Registry`
    (tenant_id, slug, name, legal_name, lifecycle_status, primary_hostname, hostname_status, frappe_site_name, custom_domains)
    VALUES ('{TID_B}', '{SLUG_B}', '{COMPANY_B}', 'Beta Mart LLP', 'ACTIVE', '{SITE_B}', 'VERIFIED', '{SITE_B}', '[]')
\"\"\")

# Set Site B Membership
frappe.db.sql("DELETE FROM `tabSaaS Tenant Membership` WHERE tenant_id = '{TID_B}'")
frappe.db.sql(\"\"\"
    INSERT INTO `tabSaaS Tenant Membership`
    (membership_id, user_id, tenant_id, role, status)
    VALUES ('MEM-B-ACTIVE', '{USER_B}', '{TID_B}', 'CASHIER', 'ACTIVE')
\"\"\")
frappe.db.commit()
frappe.destroy()

# Create symlink for verified custom domain
provisioning._manage_custom_domain_symlink("{SITE_A}", "{CUSTOM_DOMAIN_VERIFIED_A}", action="create")
print("Seeding complete.")
"""
        seed_cmd = [
            "docker", "exec", "-i", "-w", "/home/frappe/frappe-bench/sites",
            CONTAINER_NAME, "/home/frappe/frappe-bench/env/bin/python",
        ]
        res = subprocess.run(seed_cmd, input=seed_script, text=True, capture_output=True, check=False)
        if res.returncode != 0:
            print("Seed script failed stdout:", res.stdout, flush=True)
            print("Seed script failed stderr:", res.stderr, flush=True)
            raise RuntimeError(f"Seed script failed: {res.stderr}")
        print("[+] Seed script finished successfully.", flush=True)

        # Clear bench cache and shared Redis lifecycle keys so all hooks take effect cleanly
        clear_cache_cmd = f"""
import frappe
frappe.init(site="frontend")
frappe.connect()
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_A}", shared=True)
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_B}", shared=True)
"""
        subprocess.run(seed_cmd, input=clear_cache_cmd, text=True, check=True)
        for site in [SITE_A, SITE_B]:
            run_cmd(["docker", "exec", CONTAINER_NAME, "bench", "--site", site, "clear-cache"])

        auth_header_a = {"Authorization": f"token {API_KEY_A}:{API_SEC_A}"}
        auth_header_a_inactive = {"Authorization": f"token {API_KEY_A_INACTIVE}:{API_SEC_A_INACTIVE}"}
        auth_header_b = {"Authorization": f"token {API_KEY_B}:{API_SEC_B}"}

        # ---------------------------------------------------------------------
        # CHECK 01: Baseline Liveness & Resolution
        # ---------------------------------------------------------------------
        c1_code, c1_res, _ = http_request("/api/method/frappe.ping", host=SITE_A)
        c1_pass = c1_code == 200 and isinstance(c1_res, dict) and c1_res.get("message") == "pong"
        report["checks"]["01_baseline_liveness"] = {
            "status": "PASS" if c1_pass else "FAIL",
            "http_status": c1_code,
            "response": c1_res,
        }
        print(f"[{'PASS' if c1_pass else 'FAIL'}] 01_baseline_liveness (ping={c1_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 02: Active Tenant A on Valid Subdomain Reads Protected API
        # ---------------------------------------------------------------------
        c2_code, c2_res, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        c2_pass = (
            c2_code == 200
            and isinstance(c2_res, dict)
            and c2_res.get("data", {}).get("item_code") == ITEM_A
            and c2_res.get("data", {}).get("item_name") == ITEM_NAME_A
        )
        report["checks"]["02_active_tenant_a_reads_protected_api"] = {
            "status": "PASS" if c2_pass else "FAIL",
            "http_status": c2_code,
            "item_name": c2_res.get("data", {}).get("item_name") if isinstance(c2_res, dict) else None,
        }
        print(f"[{'PASS' if c2_pass else 'FAIL'}] 02_active_tenant_a_reads_protected_api (status={c2_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 03: Active Tenant B on Valid Subdomain Reads Protected API
        # ---------------------------------------------------------------------
        c3_code, c3_res, _ = http_request(f"/api/resource/Item/{ITEM_B}", host=SITE_B, headers=auth_header_b)
        c3_pass = (
            c3_code == 200
            and isinstance(c3_res, dict)
            and c3_res.get("data", {}).get("item_code") == ITEM_B
            and c3_res.get("data", {}).get("item_name") == ITEM_NAME_B
        )
        report["checks"]["03_active_tenant_b_reads_protected_api"] = {
            "status": "PASS" if c3_pass else "FAIL",
            "http_status": c3_code,
            "item_name": c3_res.get("data", {}).get("item_name") if isinstance(c3_res, dict) else None,
        }
        print(f"[{'PASS' if c3_pass else 'FAIL'}] 03_active_tenant_b_reads_protected_api (status={c3_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 04: Suspended Tenant Fails Closed on Protected Business APIs
        # ---------------------------------------------------------------------
        # Suspend Tenant A
        set_sus_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
provisioning.set_tenant_status("{TID_A}", "SUSPENDED", "Test audit suspension")
"""
        subprocess.run(seed_cmd, input=set_sus_cmd, text=True, check=True)

        c4_code, c4_res, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        c4_res_str = str(c4_res)
        c4_pass = (
            c4_code == 403
            and ("TENANT_SUSPENDED" in c4_res_str or "TenantSuspendedError" in c4_res_str or "suspended" in c4_res_str.lower())
        )
        report["checks"]["04_suspended_tenant_fails_closed"] = {
            "status": "PASS" if c4_pass else "FAIL",
            "http_status": c4_code,
            "response_snippet": c4_res_str[:120],
        }
        print(f"[{'PASS' if c4_pass else 'FAIL'}] 04_suspended_tenant_fails_closed (status={c4_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 05: Archived Tenant Fails Closed on Protected Business APIs
        # ---------------------------------------------------------------------
        set_arch_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
provisioning.set_tenant_status("{TID_A}", "ARCHIVED", "Test store decommission")
"""
        subprocess.run(seed_cmd, input=set_arch_cmd, text=True, check=True)

        c5_code, c5_res, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        c5_res_str = str(c5_res)
        c5_pass = (
            c5_code == 403
            and ("TENANT_ARCHIVED" in c5_res_str or "TenantArchivedError" in c5_res_str or "archived" in c5_res_str.lower())
        )
        report["checks"]["05_archived_tenant_fails_closed"] = {
            "status": "PASS" if c5_pass else "FAIL",
            "http_status": c5_code,
            "response_snippet": c5_res_str[:120],
        }
        print(f"[{'PASS' if c5_pass else 'FAIL'}] 05_archived_tenant_fails_closed (status={c5_code})", flush=True)

        # Reactivate Tenant A for subsequent checks (direct reset since ARCHIVED is a terminal state in the state machine)
        reactivate_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.db.sql("UPDATE `tabSaaS Tenant Registry` SET lifecycle_status = 'ACTIVE' WHERE tenant_id = '{TID_A}'")
frappe.db.commit()
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_A}", shared=True)
frappe.cache().delete_value("saas_tenant_lifecycle:{CUSTOM_DOMAIN_VERIFIED_A}", shared=True)
provisioning._manage_custom_domain_symlink("{SITE_A}", "{CUSTOM_DOMAIN_VERIFIED_A}", action="create")
"""
        subprocess.run(seed_cmd, input=reactivate_cmd, text=True, check=True)

        # ---------------------------------------------------------------------
        # CHECK 06: Provisioning / Inactive Tenant Fails Closed
        # ---------------------------------------------------------------------
        set_prov_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
frappe.db.sql("UPDATE `tabSaaS Tenant Registry` SET lifecycle_status = 'PROVISIONING' WHERE tenant_id = '{TID_A}'")
frappe.db.commit()
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_A}", shared=True)
"""
        subprocess.run(seed_cmd, input=set_prov_cmd, text=True, check=True)

        c6_code, c6_res, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        c6_res_str = str(c6_res)
        c6_pass = (
            c6_code == 403
            and ("TENANT_INACTIVE" in c6_res_str or "TenantInactiveError" in c6_res_str or "activation" in c6_res_str.lower())
        )
        report["checks"]["06_provisioning_tenant_fails_closed"] = {
            "status": "PASS" if c6_pass else "FAIL",
            "http_status": c6_code,
            "response_snippet": c6_res_str[:120],
        }
        print(f"[{'PASS' if c6_pass else 'FAIL'}] 06_provisioning_tenant_fails_closed (status={c6_code})", flush=True)

        # Reset Tenant A to ACTIVE
        subprocess.run(seed_cmd, input=reactivate_cmd, text=True, check=True)

        # ---------------------------------------------------------------------
        # CHECK 07: Unverified Primary Hostname Fails Closed
        # ---------------------------------------------------------------------
        set_unver_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
frappe.db.sql("UPDATE `tabSaaS Tenant Registry` SET hostname_status = 'UNVERIFIED' WHERE tenant_id = '{TID_A}'")
frappe.db.commit()
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_A}", shared=True)
"""
        subprocess.run(seed_cmd, input=set_unver_cmd, text=True, check=True)

        c7_code, c7_res, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        c7_res_str = str(c7_res)
        c7_pass = (
            c7_code == 403
            and ("HOSTNAME_UNVERIFIED" in c7_res_str or "HostnameUnverifiedError" in c7_res_str or "verification" in c7_res_str.lower())
        )
        report["checks"]["07_unverified_hostname_fails_closed"] = {
            "status": "PASS" if c7_pass else "FAIL",
            "http_status": c7_code,
            "response_snippet": c7_res_str[:120],
        }
        print(f"[{'PASS' if c7_pass else 'FAIL'}] 07_unverified_hostname_fails_closed (status={c7_code})", flush=True)

        # Reset Tenant A hostname to VERIFIED
        reset_ver_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
provisioning.verify_tenant_hostname("{TID_A}")
frappe.cache().delete_value("saas_tenant_lifecycle:{CUSTOM_DOMAIN_VERIFIED_A}", shared=True)
provisioning._manage_custom_domain_symlink("{SITE_A}", "{CUSTOM_DOMAIN_VERIFIED_A}", action="create")
"""
        subprocess.run(seed_cmd, input=reset_ver_cmd, text=True, check=True)

        # ---------------------------------------------------------------------
        # CHECK 08: Verified Custom Domain Resolves Correct Site & Schema
        # ---------------------------------------------------------------------
        c8_code, c8_res, _ = http_request(
            f"/api/resource/Item/{ITEM_A}",
            host=CUSTOM_DOMAIN_VERIFIED_A,
            headers=auth_header_a,
        )
        c8_pass = (
            c8_code == 200
            and isinstance(c8_res, dict)
            and c8_res.get("data", {}).get("item_code") == ITEM_A
            and c8_res.get("data", {}).get("item_name") == ITEM_NAME_A
        )
        report["checks"]["08_verified_custom_domain_resolves_site"] = {
            "status": "PASS" if c8_pass else "FAIL",
            "http_status": c8_code,
            "resolved_item": c8_res.get("data", {}).get("item_name") if isinstance(c8_res, dict) else None,
        }
        print(f"[{'PASS' if c8_pass else 'FAIL'}] 08_verified_custom_domain_resolves_site (status={c8_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 09: Unverified Custom Domain Fails Closed
        # ---------------------------------------------------------------------
        c9_code, c9_res, _ = http_request(
            f"/api/resource/Item/{ITEM_A}",
            host=CUSTOM_DOMAIN_UNVERIFIED_A,
            headers=auth_header_a,
        )
        c9_pass = c9_code == 404 and "does not exist" in str(c9_res)
        report["checks"]["09_unverified_custom_domain_fails_closed"] = {
            "status": "PASS" if c9_pass else "FAIL",
            "http_status": c9_code,
            "response_snippet": str(c9_res)[:120],
        }
        print(f"[{'PASS' if c9_pass else 'FAIL'}] 09_unverified_custom_domain_fails_closed (status={c9_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 10: Removed Custom Domain Immediately Fails Closed
        # ---------------------------------------------------------------------
        remove_cd_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
provisioning.remove_custom_domain("{TID_A}", "{CUSTOM_DOMAIN_VERIFIED_A}")
"""
        subprocess.run(seed_cmd, input=remove_cd_cmd, text=True, check=True)

        c10_code, c10_res, _ = http_request(
            f"/api/resource/Item/{ITEM_A}",
            host=CUSTOM_DOMAIN_VERIFIED_A,
            headers=auth_header_a,
        )
        c10_pass = (
            c10_code in (403, 404)
            and ("does not exist" in str(c10_res) or "HostnameUnverifiedError" in str(c10_res) or "unverified" in str(c10_res).lower())
        )
        report["checks"]["10_removed_custom_domain_immediately_fails_closed"] = {
            "status": "PASS" if c10_pass else "FAIL",
            "http_status": c10_code,
            "response_snippet": str(c10_res)[:120],
        }
        print(f"[{'PASS' if c10_pass else 'FAIL'}] 10_removed_custom_domain_immediately_fails_closed (status={c10_code})", flush=True)

        # Re-verify custom domain for subsequent header test
        re_verify_cmd = f"""
import frappe
frappe.init(site="{SITE_A}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
provisioning.verify_custom_domain("{TID_A}", "{CUSTOM_DOMAIN_VERIFIED_A}")
"""
        subprocess.run(seed_cmd, input=re_verify_cmd, text=True, check=True)

        # ---------------------------------------------------------------------
        # CHECK 11: Custom Domain Collision & Reassignment Security
        # ---------------------------------------------------------------------
        collision_cmd = f"""
import frappe
frappe.init(site="{SITE_B}")
frappe.connect()
from departmental_store.api import provisioning
frappe.set_user("Administrator")
try:
    provisioning.verify_custom_domain("{TID_B}", "{CUSTOM_DOMAIN_VERIFIED_A}")
    print("COLLISION_ALLOWED")
except frappe.ValidationError:
    print("COLLISION_BLOCKED")
"""
        coll_res = subprocess.run(seed_cmd, input=collision_cmd, text=True, capture_output=True, check=True)
        c11_pass = "COLLISION_BLOCKED" in coll_res.stdout
        report["checks"]["11_custom_domain_collision_blocked"] = {
            "status": "PASS" if c11_pass else "FAIL",
            "collision_blocked": c11_pass,
        }
        print(f"[{'PASS' if c11_pass else 'FAIL'}] 11_custom_domain_collision_blocked (blocked={c11_pass})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 12: Forged Forwarding & Site-Selection Headers Cannot Override Routing
        # ---------------------------------------------------------------------
        c12_code, c12_res, _ = http_request(
            f"/api/resource/Item/{ITEM_A}",
            host=SITE_A,
            headers={
                **auth_header_a,
                "X-Frappe-Site-Name": SITE_B,
                "X-Forwarded-Host": SITE_B,
            },
        )
        c12_pass = (
            c12_code == 200
            and isinstance(c12_res, dict)
            and c12_res.get("data", {}).get("item_code") == ITEM_A
        )
        report["checks"]["12_forged_forwarding_headers_cannot_override_routing"] = {
            "status": "PASS" if c12_pass else "FAIL",
            "http_status": c12_code,
            "routed_to_tenant_a": c12_pass,
        }
        print(f"[{'PASS' if c12_pass else 'FAIL'}] 12_forged_forwarding_headers_cannot_override_routing (status={c12_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 13: Unknown Hostname Fails Closed
        # ---------------------------------------------------------------------
        c13_code, c13_res, _ = http_request("/api/resource/Item", host="unknown-tenant-rogue-999.local")
        c13_pass = c13_code == 404 and "does not exist" in str(c13_res)
        report["checks"]["13_unknown_hostname_fails_closed"] = {
            "status": "PASS" if c13_pass else "FAIL",
            "http_status": c13_code,
            "fails_closed": c13_pass,
        }
        print(f"[{'PASS' if c13_pass else 'FAIL'}] 13_unknown_hostname_fails_closed (status={c13_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 14: Authenticated User Without Active Membership Denied
        # ---------------------------------------------------------------------
        c14_code, c14_res, _ = http_request(
            f"/api/resource/Item/{ITEM_A}",
            host=SITE_A,
            headers=auth_header_a_inactive,
        )
        c14_res_str = str(c14_res)
        c14_pass = (
            c14_code == 403
            and ("MEMBERSHIP_INACTIVE" in c14_res_str or "MembershipInactiveError" in c14_res_str or "membership" in c14_res_str.lower())
        )
        report["checks"]["14_inactive_membership_denied"] = {
            "status": "PASS" if c14_pass else "FAIL",
            "http_status": c14_code,
            "response_snippet": c14_res_str[:120],
        }
        print(f"[{'PASS' if c14_pass else 'FAIL'}] 14_inactive_membership_denied (status={c14_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 15: Cross-Tenant Authenticated Access Denied
        # ---------------------------------------------------------------------
        # User A attempts to access Site B using Site A credentials
        c15_code, _c15_res, _ = http_request(
            f"/api/resource/Item/{ITEM_B}",
            host=SITE_B,
            headers=auth_header_a,
        )
        c15_pass = c15_code in (401, 403)
        report["checks"]["15_cross_tenant_access_denied"] = {
            "status": "PASS" if c15_pass else "FAIL",
            "http_status": c15_code,
            "access_denied": c15_pass,
        }
        print(f"[{'PASS' if c15_pass else 'FAIL'}] 15_cross_tenant_access_denied (status={c15_code})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 16: Instant Status Invalidation Across Cache
        # ---------------------------------------------------------------------
        # 1. Tenant A is active -> 200
        t16_a, _, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        # 2. Suspend Tenant A
        subprocess.run(seed_cmd, input=set_sus_cmd, text=True, check=True)
        # 3. Next immediate request must be 403 without waiting for cache TTL
        t16_b, _, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)
        # 4. Reactivate Tenant A
        subprocess.run(seed_cmd, input=reactivate_cmd, text=True, check=True)
        # 5. Next immediate request must be 200
        t16_c, _, _ = http_request(f"/api/resource/Item/{ITEM_A}", host=SITE_A, headers=auth_header_a)

        c16_pass = (t16_a == 200 and t16_b == 403 and t16_c == 200)
        report["checks"]["16_instant_cache_invalidation"] = {
            "status": "PASS" if c16_pass else "FAIL",
            "active_1": t16_a,
            "suspended": t16_b,
            "active_2": t16_c,
            "instant_invalidation": c16_pass,
        }
        print(f"[{'PASS' if c16_pass else 'FAIL'}] 16_instant_cache_invalidation (active={t16_a}, sus={t16_b}, re={t16_c})", flush=True)

        # ---------------------------------------------------------------------
        # CHECK 17: POS Sales Submission Lifecycle Enforcement
        # ---------------------------------------------------------------------
        # Active tenant can submit sale via POS sync API
        pos_payload = {
            "transaction_id": f"TX-LIFE-001-{int(time.time())}",
            "pos_opening_shift": "POS-SHIFT-001",
            "pos_profile": "Standard POS",
            "counter_id": "COUNTER-01",
            "cashier": USER_A_ACTIVE,
            "customer": "Walk-in Customer",
            "posting_date": time.strftime("%Y-%m-%d"),
            "posting_time": time.strftime("%H:%M:%S"),
            "lines": [
                {
                    "item_code": ITEM_A,
                    "qty": 1,
                    "rate": 55.0,
                    "amount": 55.0,
                    "uom": "Nos",
                }
            ],
            "payments": [
                {
                    "mode_of_payment": "Cash",
                    "amount": 55.0,
                }
            ],
        }

        # While Active:
        c17_act_code, _c17_act_res, _ = http_request(
            "/api/method/departmental_store.api.sales.submit_pos_sale",
            host=SITE_A,
            headers=auth_header_a,
            method="POST",
            data={"payload": json.dumps(pos_payload)},
        )

        # Now suspend tenant:
        subprocess.run(seed_cmd, input=set_sus_cmd, text=True, check=True)

        # Next submission while Suspended:
        pos_payload_2 = dict(pos_payload)
        pos_payload_2["transaction_id"] = f"TX-LIFE-002-{int(time.time())}"
        c17_sus_code, c17_sus_res, _ = http_request(
            "/api/method/departmental_store.api.sales.submit_pos_sale",
            host=SITE_A,
            headers=auth_header_a,
            method="POST",
            data={"payload": json.dumps(pos_payload_2)},
        )

        # Restore tenant to ACTIVE for clean state
        subprocess.run(seed_cmd, input=reactivate_cmd, text=True, check=True)

        c17_pass = (
            c17_act_code == 200
            and c17_sus_code == 403
            and ("TENANT_SUSPENDED" in str(c17_sus_res) or "TenantSuspendedError" in str(c17_sus_res) or "suspended" in str(c17_sus_res).lower())
        )
        report["checks"]["17_pos_sales_lifecycle_enforcement"] = {
            "status": "PASS" if c17_pass else "FAIL",
            "active_submit_code": c17_act_code,
            "suspended_submit_code": c17_sus_code,
            "lifecycle_enforced": c17_pass,
        }
        print(f"[{'PASS' if c17_pass else 'FAIL'}] 17_pos_sales_lifecycle_enforcement (act={c17_act_code}, sus={c17_sus_code})", flush=True)

        # Overall Status
        all_passed = all(c.get("status") == "PASS" for c in report["checks"].values())
        report["status"] = "PASS" if all_passed else "FAIL"

    except Exception as exc:  # noqa: BLE001
        report["status"] = "ERROR"
        report["errors"].append(str(exc))
        import traceback
        traceback.print_exc()

    finally:
        # ---------------------------------------------------------------------
        # Guarded Cleanup: Drop disposable sites and unlink symlinks
        # ---------------------------------------------------------------------
        print("[*] Performing guarded teardown of disposable resources...", flush=True)
        # Unlink symlinks
        unlink_script = f"""
import frappe
frappe.init(site="frontend")
frappe.connect()
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_A}", shared=True)
frappe.cache().delete_value("saas_tenant_lifecycle:{SITE_B}", shared=True)
from departmental_store.api import provisioning
for sym in {symlinks_to_clean}:
    provisioning._manage_custom_domain_symlink("{SITE_A}", sym, action="remove")
    provisioning._manage_custom_domain_symlink("{SITE_B}", sym, action="remove")
"""
        subprocess.run(seed_cmd, input=unlink_script, text=True, check=False)

        for site in sites_to_clean:
            print(f"[*] Dropping disposable test site '{site}'...", flush=True)
            run_cmd(
                ["docker", "exec", CONTAINER_NAME, "bench", "drop-site", site, "--force",
                 "--db-root-username", DB_ROOT_USER, "--db-root-password", DB_ROOT_PASSWORD],
                check=False,
            )

        run_cmd(["docker", "exec", CONTAINER_NAME, "rm", "-rf", tmp_dir], check=False)
        print("[+] Guarded teardown complete.", flush=True)

    return report


if __name__ == "__main__":
    report_res = execute_lifecycle_and_custom_domain_test()
    print("\n" + "=" * 80)
    print("TEST REPORT SUMMARY:")
    print("=" * 80)
    print(json.dumps(report_res, indent=2))

    total = len(report_res.get("checks", {}))
    passed = sum(1 for c in report_res.get("checks", {}).values() if c.get("status") == "PASS")
    print(f"\nResult: {passed}/{total} checks passed. Overall Status: {report_res['status']}")

    if report_res["status"] != "PASS":
        sys.exit(1)
    sys.exit(0)
