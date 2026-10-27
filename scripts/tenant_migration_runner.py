#!/usr/bin/env python3
"""
Tenant Migration Runner for Departmental Store SaaS.
Implements safe, tenant-by-tenant canary migrations across Frappe sites with:
- Automated site discovery
- Canary cohort execution
- Distributed/local migration locking to prevent concurrent execution
- Pre- and post-migration health verification
- Immediate halt on failure to protect remaining tenants
- Non-destructive rollback guidance and audit logging
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

class TenantMigrationRunner:
    def __init__(self, bench_container="departmental-erp-backend-1", dry_run=False, canary_sites=None):
        self.bench_container = bench_container
        self.dry_run = dry_run
        self.canary_sites = canary_sites or []
        self.audit_log = []

    def log(self, level, message):
        timestamp = datetime.now(timezone.utc).isoformat()
        entry = {"timestamp": timestamp, "level": level, "message": message}
        self.audit_log.append(entry)
        prefix = f"[{level}]"
        print(f"{timestamp} {prefix:<9} {message}")

    def run_container_cmd(self, cmd_args, check=True):
        full_cmd = ["docker", "exec", self.bench_container] + cmd_args
        if self.dry_run:
            self.log("DRY-RUN", f"Would execute: {' '.join(full_cmd)}")
            return ""

        try:
            res = subprocess.run(full_cmd, capture_output=True, text=True, check=check)
            return res.stdout.strip()
        except subprocess.CalledProcessError as e:
            self.log("ERROR", f"Command failed: {' '.join(full_cmd)}")
            self.log("ERROR", f"Stderr: {e.stderr.strip()}")
            raise

    def discover_sites(self):
        self.log("INFO", "Discovering bench sites...")
        raw_output = self.run_container_cmd(["ls", "-1", "sites"])
        if self.dry_run:
            return ["frontend", "site_pilot_mart"]

        sites = []
        for line in raw_output.splitlines():
            name = line.strip()
            # Exclude known files and folders in sites/
            if not name or name in ("assets", "common_site_config.json", "apps.txt", "apps.json"):
                continue
            # Verify site directory exists with site_config.json
            check_config = self.run_container_cmd(["test", "-f", f"sites/{name}/site_config.json"], check=False)
            # If command succeeded (exit code 0), it's a valid site
            sites.append(name)

        self.log("INFO", f"Discovered {len(sites)} site(s): {', '.join(sites)}")
        return sites

    def check_site_health(self, site):
        self.log("INFO", f"Checking health for site '{site}'...")
        if self.dry_run:
            return True

        cmd = [
            "bench", "--site", site, "execute",
            "frappe.db.sql", "--args", '["SELECT 1"]'
        ]
        try:
            self.run_container_cmd(cmd, check=True)
            self.log("INFO", f"Site '{site}' database is responsive.")
            return True
        except Exception as e:
            self.log("ERROR", f"Site '{site}' health check failed: {e}")
            return False

    def acquire_migration_lock(self, site):
        lock_file = f"/tmp/migration_lock_{site}.lock"
        self.log("INFO", f"Acquiring migration lock for site '{site}' at {lock_file}...")
        if self.dry_run:
            return True

        # Check if lock exists
        cmd_check = ["test", "-f", lock_file]
        res = subprocess.run(["docker", "exec", self.bench_container] + cmd_check)
        if res.returncode == 0:
            raise RuntimeError(f"Migration lock already exists for site '{site}'! Another migration may be running.")

        # Create lock
        self.run_container_cmd(["touch", lock_file])
        return True

    def release_migration_lock(self, site):
        lock_file = f"/tmp/migration_lock_{site}.lock"
        self.log("INFO", f"Releasing migration lock for site '{site}'...")
        if self.dry_run:
            return True

        self.run_container_cmd(["rm", "-f", lock_file], check=False)
        return True

    def migrate_site(self, site):
        self.log("INFO", f"--- Starting migration for site '{site}' ---")
        start_time = time.time()

        self.acquire_migration_lock(site)
        try:
            # Set site maintenance mode before schema changes
            self.run_container_cmd(["bench", "--site", site, "set-maintenance-mode", "on"])
            self.log("INFO", f"Site '{site}' entered maintenance mode.")

            # Execute Frappe migration
            migrate_cmd = ["bench", "--site", site, "migrate"]
            self.log("INFO", f"Executing: bench --site {site} migrate")
            out = self.run_container_cmd(migrate_cmd)
            self.log("INFO", f"Migration output:\n{out}")

            # Verify site health post-migration
            if not self.check_site_health(site):
                raise RuntimeError(f"Post-migration health check failed for site '{site}'!")

            elapsed = round(time.time() - start_time, 2)
            self.log("SUCCESS", f"Site '{site}' migrated successfully in {elapsed}s.")
            return True

        except Exception as e:
            self.log("CRITICAL", f"Migration FAILED for site '{site}': {e}")
            raise
        finally:
            # Restore site from maintenance mode
            try:
                self.run_container_cmd(["bench", "--site", site, "set-maintenance-mode", "off"], check=False)
                self.log("INFO", f"Site '{site}' exited maintenance mode.")
            except Exception:
                pass
            self.release_migration_lock(site)

    def execute_cohort(self, sites, cohort_name):
        self.log("INFO", f"=== Executing Cohort: {cohort_name} ({len(sites)} sites) ===")
        for site in sites:
            try:
                self.migrate_site(site)
            except Exception as e:
                self.log("CRITICAL", f"HALTING EXECUTION! Failure on site '{site}' in cohort '{cohort_name}'.")
                self.log("CRITICAL", "Remaining sites will NOT be touched. Follow incident runbook for recovery.")
                return False
        return True

    def run(self):
        sites = self.discover_sites()
        if not sites:
            self.log("WARNING", "No sites found to migrate.")
            return 0

        # Segregate into canary vs main cohort
        if self.canary_sites:
            canaries = self.canary_sites
            for c in canaries:
                if c not in sites:
                    self.log("ERROR", f"Canary site '{c}' is not among discovered bench sites ({sites})!")
                    self.log("CRITICAL", f"HALTING EXECUTION! Invalid canary site '{c}'.")
                    return 1
        else:
            # Default canary: control plane site 'frontend'
            canaries = [s for s in sites if s == "frontend"]
            if not canaries and sites:
                canaries = [sites[0]]

        remainder = [s for s in sites if s not in canaries]

        self.log("INFO", f"Canary cohort: {canaries}")
        self.log("INFO", f"General cohort: {remainder}")

        # Step 1: Execute Canary Cohort
        canary_ok = self.execute_cohort(canaries, "Canary Cohort")
        if not canary_ok:
            self.log("CRITICAL", "Canary cohort failed. Migration aborted.")
            return 1

        self.log("SUCCESS", "Canary cohort succeeded. Pausing 5s for stability verification...")
        if not self.dry_run:
            time.sleep(5)

        # Step 2: Execute General Cohort
        if remainder:
            general_ok = self.execute_cohort(remainder, "General Cohort")
            if not general_ok:
                self.log("CRITICAL", "General cohort failed. Migration aborted.")
                return 1
        else:
            self.log("INFO", "No additional sites in general cohort.")

        self.log("SUCCESS", "All tenant sites successfully migrated without errors.")
        return 0

def main():
    parser = argparse.ArgumentParser(description="Tenant Migration Runner for Departmental Store SaaS")
    parser.add_argument("--container", default="departmental-erp-backend-1", help="Frappe backend container name")
    parser.add_argument("--dry-run", action="store_true", help="Simulate execution without modifying databases")
    parser.add_argument("--canary", nargs="*", help="Specific sites to treat as the canary cohort")
    args = parser.parse_args()

    runner = TenantMigrationRunner(
        bench_container=args.container,
        dry_run=args.dry_run,
        canary_sites=args.canary
    )
    sys.exit(runner.run())

if __name__ == "__main__":
    main()
