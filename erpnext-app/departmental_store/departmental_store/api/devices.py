"""Counter device registration and sync bookkeeping."""

import frappe
from frappe.utils import now_datetime

from departmental_store.hooks import API_VERSION

MANAGER_ROLES = ["System Manager", "Store Manager"]


@frappe.whitelist()
def register_device(device_id: str | None = None, counter_name: str | None = None,
                    notes: str | None = None) -> dict:
    """Register (or update) a billing counter. Manager-only by design: a device is a
    trust anchor, cashiers cannot self-register counters."""
    frappe.only_for(MANAGER_ROLES)

    if not device_id or not isinstance(device_id, str) or len(device_id) > 100:
        raise frappe.ValidationError("device_id is required (max 100 chars)")

    if frappe.db.exists("POS Device", device_id):
        doc = frappe.get_doc("POS Device", device_id)
        if counter_name:
            doc.counter_name = counter_name
        if notes is not None:
            doc.notes = notes
        doc.save(ignore_permissions=True)
        action = "updated"
    else:
        doc = frappe.get_doc({
            "doctype": "POS Device",
            "device_id": device_id,
            "counter_name": counter_name or device_id,
            "status": "Enabled",
            "assigned_user": frappe.session.user,
            "notes": notes,
        })
        doc.insert(ignore_permissions=True)
        action = "registered"

    frappe.logger("departmental_store").info({
        "event": "device_" + action, "device_id": device_id, "user": frappe.session.user,
    })

    return {
        "api_version": API_VERSION,
        "device_id": doc.device_id,
        "counter_name": doc.counter_name,
        "status": doc.status,
        "action": action,
    }


@frappe.whitelist()
def record_sync(device_id: str | None = None, checkpoint: str | None = None) -> dict:
    """Called by a counter after a successful catalog sync (any POS user of the device)."""
    if not device_id or not isinstance(device_id, str):
        raise frappe.ValidationError("device_id is required")
    if not frappe.db.exists("POS Device", device_id):
        raise frappe.ValidationError(f"Device '{device_id}' is not registered")
    frappe.db.set_value("POS Device", device_id, {
        "last_sync_at": now_datetime(),
        "last_catalog_checkpoint": checkpoint or None,
    }, update_modified=False)
    frappe.db.commit()
    return {"api_version": API_VERSION, "device_id": device_id, "ok": True}
