import os
import shutil
import time
import uuid

import frappe
from frappe import _


def _get_request_header(header_name):
    req = getattr(frappe.local, "request", None)
    if req and hasattr(req, "headers"):
        return req.headers.get(header_name)
    return None

@frappe.whitelist(allow_guest=True)
def get_liveness():
    """
    Lightweight liveness probe for container orchestrators and reverse proxies.
    Returns 200 OK without database overhead.
    """
    correlation_id = _get_request_header("X-Correlation-ID") or str(uuid.uuid4())
    return {
        "status": "ok",
        "app": "departmental_store",
        "timestamp": time.time(),
        "correlation_id": correlation_id,
    }

@frappe.whitelist(allow_guest=True)
def get_system_health(token=None):
    """
    Comprehensive operational telemetry and dependency readiness check.

    Protected: Requires Platform Admin / System Manager role or matching HEALTH_CHECK_TOKEN.
    """
    correlation_id = _get_request_header("X-Correlation-ID") or str(uuid.uuid4())

    # 1. Authorization Gate
    is_authorized = False

    # Check user session role
    if frappe.session.user and frappe.session.user != "Guest":
        roles = frappe.get_roles(frappe.session.user)
        if "Platform Admin" in roles or "System Manager" in roles:
            is_authorized = True

    # Check shared health token (header or parameter)
    configured_token = frappe.conf.get("health_check_token") or os.environ.get("HEALTH_CHECK_TOKEN")
    header_token = _get_request_header("X-Health-Check-Token")
    auth_header = _get_request_header("Authorization") or ""
    bearer_token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else None

    presented_token = token or header_token or bearer_token
    if configured_token and presented_token and presented_token == configured_token:
        is_authorized = True

    if not is_authorized:
        frappe.throw(_("Unauthorized: Telemetry requires Platform Admin role or valid health token"),
                     frappe.PermissionError)

    health_status = "ok"
    checks = {}

    # 2. Database Health & Latency
    db_start = time.perf_counter()
    try:
        frappe.db.sql("SELECT 1")
        db_latency_ms = round((time.perf_counter() - db_start) * 1000, 2)
        threads_row = frappe.db.sql("SHOW STATUS LIKE 'Threads_connected'", as_dict=True)
        threads_connected = int(threads_row[0].Value) if threads_row else None

        checks["database"] = {
            "status": "healthy",
            "latency_ms": db_latency_ms,
            "threads_connected": threads_connected,
        }
    except Exception as e:
        health_status = "degraded"
        checks["database"] = {
            "status": "unhealthy",
            "error": str(e)[:100],
        }

    # 3. Redis Cache & Queue Readiness
    try:
        cache_start = time.perf_counter()
        cache_client = frappe.cache()
        cache_ok = bool(cache_client.ping())
        cache_latency_ms = round((time.perf_counter() - cache_start) * 1000, 2)

        from frappe.utils.background_jobs import get_redis_conn
        queue_client = get_redis_conn()
        queue_start = time.perf_counter()
        queue_ok = bool(queue_client.ping())
        queue_latency_ms = round((time.perf_counter() - queue_start) * 1000, 2)

        # Inspect Redis Queue Depths
        default_depth = queue_client.llen("default") or 0
        short_depth = queue_client.llen("short") or 0
        long_depth = queue_client.llen("long") or 0

        checks["redis"] = {
            "status": "healthy" if (cache_ok and queue_ok) else "degraded",
            "cache_latency_ms": cache_latency_ms,
            "queue_latency_ms": queue_latency_ms,
            "queue_depths": {
                "default": default_depth,
                "short": short_depth,
                "long": long_depth,
            }
        }
    except Exception as e:
        health_status = "degraded"
        checks["redis"] = {
            "status": "unhealthy",
            "error": str(e)[:100],
        }

    # 4. Provisioning Queue & Job Metrics (Control Plane only)
    try:
        if frappe.db.table_exists("SaaS Provisioning Job"):
            job_stats = frappe.db.sql("""
                SELECT status, count(*) as count
                FROM `tabSaaS Provisioning Job`
                GROUP BY status
            """, as_dict=True)
            stats_map = {r.status: r.count for r in job_stats}

            stale_threshold = frappe.utils.now_datetime() - frappe.utils.datetime.timedelta(minutes=10)
            stale_rows = frappe.db.sql("""
                SELECT count(*)
                FROM `tabSaaS Provisioning Job`
                WHERE status = 'claimed' AND modified < %s
            """, (stale_threshold,))
            stale_count = stale_rows[0][0] if stale_rows else 0

            checks["provisioning"] = {
                "pending": stats_map.get("pending", 0),
                "claimed": stats_map.get("claimed", 0),
                "completed": stats_map.get("completed", 0),
                "failed": stats_map.get("failed", 0),
                "stale_claimed": stale_count,
            }
        else:
            checks["provisioning"] = {"status": "not_applicable"}
    except Exception as e:
        checks["provisioning"] = {"error": str(e)[:100]}

    # 5. POS Synchronization Metrics (Last 24 Hours)
    try:
        if frappe.db.table_exists("POS Sale Sync Log"):
            since_24h = frappe.utils.now_datetime() - frappe.utils.datetime.timedelta(hours=24)
            pos_stats = frappe.db.sql("""
                SELECT status, count(*) as count
                FROM `tabPOS Sale Sync Log`
                WHERE creation >= %s
                GROUP BY status
            """, (since_24h,), as_dict=True)
            pos_map = {r.status: r.count for r in pos_stats}

            checks["pos_sync_24h"] = {
                "server_committed": pos_map.get("Server Committed", 0),
                "requires_review": pos_map.get("Requires Review", 0),
                "processing": pos_map.get("Processing", 0),
                "cancelled": pos_map.get("Cancelled", 0),
                "total_submitted": sum(pos_map.values()),
            }
        else:
            checks["pos_sync_24h"] = {"status": "not_applicable"}
    except Exception as e:
        checks["pos_sync_24h"] = {"error": str(e)[:100]}

    # 6. Disk Usage and Backup Freshness
    try:
        disk = shutil.disk_usage("/")
        free_gb = round(disk.free / (1024 ** 3), 2)
        total_gb = round(disk.total / (1024 ** 3), 2)
        used_percent = round(((disk.total - disk.free) / disk.total) * 100, 1)

        # Check latest backup file
        site_path = frappe.get_site_path()
        backup_dir = os.path.join(site_path, "private", "backups")
        latest_backup_time = None
        if os.path.exists(backup_dir):
            files = [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.endswith(".sql.gz")]
            if files:
                latest_backup = max(files, key=os.path.getmtime)
                import datetime
                latest_backup_time = datetime.datetime.fromtimestamp(os.path.getmtime(latest_backup)).isoformat()

        checks["storage"] = {
            "disk_free_gb": free_gb,
            "disk_total_gb": total_gb,
            "disk_used_percent": used_percent,
            "latest_backup_iso": latest_backup_time,
        }
    except Exception as e:
        checks["storage"] = {"error": str(e)[:100]}

    # 7. Tenant Summary (Control Plane only)
    try:
        if frappe.db.table_exists("SaaS Tenant Registry"):
            tenant_counts = frappe.db.sql("""
                SELECT lifecycle_status, count(*) as count
                FROM `tabSaaS Tenant Registry`
                GROUP BY lifecycle_status
            """, as_dict=True)
            tenant_map = {r.lifecycle_status: r.count for r in tenant_counts}
            pending_onboarding = (
                frappe.db.count("SaaS Onboarding Request", {"status": "pending"})
                if frappe.db.table_exists("SaaS Onboarding Request") else 0
            )

            checks["tenants"] = {
                "active": tenant_map.get("ACTIVE", 0),
                "suspended": tenant_map.get("SUSPENDED", 0),
                "pending_onboarding": pending_onboarding,
            }
        else:
            checks["tenants"] = {"status": "not_applicable"}
    except Exception as e:
        checks["tenants"] = {"error": str(e)[:100]}

    return {
        "status": health_status,
        "site": frappe.local.site,
        "correlation_id": correlation_id,
        "timestamp": frappe.utils.now(),
        "checks": checks,
    }

def verify_restore_stats():
    """
    Audit helper for disaster recovery restore verification.
    Can be run against any restored or staging site via bench execute.
    """
    settings = frappe.get_single("Departmental Store Settings").as_dict()
    feature_flags = {k: v for k, v in settings.items() if k.startswith("flag_") or k.startswith("enable_")}

    return {
        "site": frappe.local.site,
        "installed_apps": frappe.get_installed_apps(),
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "items": frappe.db.count("Item"),
        "pos_sync_logs": frappe.db.count("POS Sale Sync Log"),
        "tenant_registry_count": frappe.db.sql("SELECT count(*) FROM `tabSaaS Tenant Registry`")[0][0],
        "tenant_membership_count": frappe.db.sql("SELECT count(*) FROM `tabSaaS Tenant Membership`")[0][0],
        "onboarding_requests_count": frappe.db.sql("SELECT count(*) FROM `tabSaaS Onboarding Request`")[0][0],
        "provisioning_jobs_count": frappe.db.sql("SELECT count(*) FROM `tabSaaS Provisioning Job`")[0][0],
        "subscriptions_count": frappe.db.sql("SELECT count(*) FROM `tabSaaS Subscription`")[0][0],
        "active_feature_flags_count": len(feature_flags),
        "feature_flags": feature_flags,
    }

@frappe.whitelist()
def get_pilot_status():
    """
    Lightweight pilot monitoring telemetry endpoint for platform operations.
    Requires Platform Admin or System Manager role.
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("Unauthorized: Pilot telemetry requires authentication"), frappe.PermissionError)
    roles = frappe.get_roles(frappe.session.user)
    if "Platform Admin" not in roles and "System Manager" not in roles:
        frappe.throw(_("Unauthorized: Pilot telemetry requires Platform Admin or System Manager role"), frappe.PermissionError)

    # 1. Tenants summary
    tenant_map = {}
    if frappe.db.table_exists("SaaS Tenant Registry"):
        tenants = frappe.db.sql("""
            SELECT lifecycle_status, count(*) as count
            FROM `tabSaaS Tenant Registry`
            GROUP BY lifecycle_status
        """, as_dict=True)
        tenant_map = {r.lifecycle_status: r.count for r in tenants}

    # 2. In-flight and failed provisioning jobs
    job_map = {}
    if frappe.db.table_exists("SaaS Provisioning Job"):
        jobs = frappe.db.sql("""
            SELECT status, count(*) as count
            FROM `tabSaaS Provisioning Job`
            GROUP BY status
        """, as_dict=True)
        job_map = {r.status: r.count for r in jobs}

    # 3. POS Synchronization backlog & review queue
    pos_backlog = frappe.db.sql("""
        SELECT status, count(*) as count
        FROM `tabPOS Sale Sync Log`
        GROUP BY status
    """, as_dict=True)
    pos_map = {r.status: r.count for r in pos_backlog}

    # 4. System readiness (latency & storage)
    t0 = time.perf_counter()
    frappe.db.sql("SELECT 1")
    db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    disk = shutil.disk_usage("/")
    used_percent = round(((disk.total - disk.free) / disk.total) * 100, 1)

    # 5. Last backup evidence
    site_path = frappe.get_site_path()
    backup_dir = os.path.join(site_path, "private", "backups")
    latest_backup = None
    if os.path.exists(backup_dir):
        files = [f for f in os.listdir(backup_dir) if f.endswith(".sql.gz")]
        if files:
            files.sort()
            latest_backup = files[-1]

    return {
        "api_version": 1,
        "timestamp": frappe.utils.now(),
        "pilot_tenants": {
            "active": tenant_map.get("ACTIVE", 0),
            "suspended": tenant_map.get("SUSPENDED", 0),
            "provisioning": tenant_map.get("PROVISIONING", 0) + tenant_map.get("PROVISIONED", 0),
            "total": sum(tenant_map.values()),
        },
        "provisioning_jobs": {
            "pending": job_map.get("pending", 0),
            "claimed": job_map.get("claimed", 0),
            "completed": job_map.get("completed", 0),
            "failed": job_map.get("failed", 0),
        },
        "pos_sync": {
            "synced": pos_map.get("synced", 0),
            "requires_review": pos_map.get("requires_review", 0),
            "error": pos_map.get("error", 0),
            "total": sum(pos_map.values()),
        },
        "system_health": {
            "database_latency_ms": db_latency_ms,
            "disk_used_percent": used_percent,
            "latest_backup_dump": latest_backup,
            "status": "HEALTHY" if db_latency_ms < 100 and used_percent < 90 else "DEGRADED",
        },
        "escalation_thresholds": {
            "max_tolerable_db_latency_ms": 250,
            "max_tolerable_sync_backlog": 50,
            "max_tolerable_disk_used_percent": 85,
            "max_failed_provisioning_jobs": 1,
        }
    }

