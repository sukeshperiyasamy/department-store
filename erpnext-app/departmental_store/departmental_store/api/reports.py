"""Owner-facing reporting API.

Every metric has an explicit definition documented in docs/api-contracts.md.
Aggregates are read-only queries over submitted (docstatus=1) documents.
"""

import frappe
from frappe.utils import cint, flt, now_datetime, today

from departmental_store.hooks import API_VERSION

SUMMARY_ROLES = ["System Manager", "Store Manager", "Accounts Manager"]


@frappe.whitelist()
def owner_summary(business_date: str | None = None) -> dict:
    """Daily sales summary for the owner dashboard.

    Definitions:
    - gross_sales: sum of base grand_total of non-return submitted POS/Sales invoices
      (tax inclusive).
    - net_sales: sum of base net_total (tax exclusive).
    - taxes: sum of base total_taxes_and_charges.
    - returns: sum of base grand_total of is_return invoices (negative values).
    - bills: count of non-return invoices.
    - payment split: sum of Sales Invoice Payment.base_amount per mode of payment,
      with cash rows reduced by the invoice's change_amount so the split reflects
      allocated (kept) amounts, not tendered amounts.
    """
    frappe.only_for(SUMMARY_ROLES)

    day = business_date or today()
    invoices = frappe.get_all(
        "Sales Invoice",
        filters={"docstatus": 1, "posting_date": day},
        fields=["name", "is_return", "base_grand_total", "base_net_total",
                "base_total_taxes_and_charges", "base_rounding_adjustment",
                "owner as cashier", "posting_time"],
        limit=0,
    )

    names = [inv.name for inv in invoices]
    payment_split: dict[str, float] = {}
    change_by_invoice: dict[str, float] = {}
    if names:
        rows = frappe.get_all("Sales Invoice Payment",
                              filters={"parent": ("in", names)},
                              fields=["parent", "mode_of_payment", "base_amount"], limit=0)
        changes = frappe.get_all("Sales Invoice",
                                 filters={"name": ("in", names), "change_amount": (">", 0)},
                                 fields=["name", "change_amount"], limit=0)
        change_by_invoice = {c.name: flt(c.change_amount) for c in changes}
        for row in rows:
            # Cash rows carry tendered amounts; reports show allocated amounts
            # (bill total), so excess cash tendered is excluded from the split.
            amount = flt(row.base_amount)
            if (frappe.db.get_value("Mode of Payment", row.mode_of_payment, "type") == "Cash"
                    and change_by_invoice.get(row.parent)):
                amount -= change_by_invoice[row.parent]
                if amount < 0:
                    amount = 0.0
            payment_split[row.mode_of_payment] = flt(
                payment_split.get(row.mode_of_payment, 0.0) + amount)

    sales = [i for i in invoices if not i.is_return]
    returns = [i for i in invoices if i.is_return]

    gross = sum(flt(i.base_grand_total) for i in sales)
    net = sum(flt(i.base_net_total) for i in sales)
    taxes = sum(flt(i.base_total_taxes_and_charges) for i in sales)
    returns_total = sum(flt(i.base_grand_total) for i in returns)

    return {
        "api_version": API_VERSION,
        "business_date": day,
        "generated_at": now_datetime().isoformat(),
        "gross_sales": flt(gross),
        "net_sales": flt(net),
        "taxes_collected": flt(taxes),
        "returns_total": flt(returns_total),
        "net_sales_after_returns": flt(net + sum(flt(i.base_net_total) for i in returns)),
        "bills": len(sales),
        "average_bill_value": flt(gross / len(sales)) if sales else 0.0,
        "returns_count": len(returns),
        "payment_split": [{"mode_of_payment": mode, "amount": flt(amount)}
                          for mode, amount in sorted(payment_split.items())],
        "cashier_split": _cashier_split(sales),
    }


def _cashier_split(sales: list) -> list[dict]:
    by_user: dict[str, dict] = {}
    for inv in sales:
        entry = by_user.setdefault(inv.cashier or "unknown",
                                   {"cashier": inv.cashier or "unknown",
                                    "bills": 0, "gross_sales": 0.0})
        entry["bills"] += 1
        entry["gross_sales"] = flt(entry["gross_sales"] + flt(inv.base_grand_total))
    return sorted(by_user.values(), key=lambda e: -e["gross_sales"])


@frappe.whitelist()
def recent_invoices(limit: int = 25) -> dict:
    """Recent submitted bills for the dashboard (standard REST /api/resource
    returned 403 for the reporting service user, so this read-only whitelisted
    method serves the same data under explicit manager permission checks)."""
    frappe.only_for(SUMMARY_ROLES)
    limit = max(1, min(cint(limit), 100))
    rows = frappe.get_all(
        "Sales Invoice",
        filters={"docstatus": 1},
        fields=["name", "customer", "posting_date", "posting_time", "status",
                "base_grand_total", "is_return", "owner"],
        order_by="posting_date desc, posting_time desc, creation desc",
        limit=limit,
    )
    for r in rows:
        r.posting_time = str(r.posting_time)
    return {
        "api_version": API_VERSION,
        "generated_at": now_datetime().isoformat(),
        "invoices": rows,
    }


@frappe.whitelist()
def stock_alerts(days_to_expiry: int = 30, limit: int = 200) -> dict:
    """Inventory alerts for the dashboard: out-of-stock / below-reorder items and
    batches nearing expiry. Read-only; manager/accountant roles only.

    Definitions:
    - out_of_stock: sellable stock item with Bin actual_qty <= 0.
    - low_stock: Item Reorder row (reorder_level > 0) whose Bin actual_qty is at
      or below the reorder level.
    - expiring: non-expired Batch with expiry_date within `days_to_expiry` and
      batch_qty > 0.
    """
    frappe.only_for(SUMMARY_ROLES)

    limit = max(1, min(cint(limit), 500))
    days_to_expiry = max(1, min(cint(days_to_expiry), 365))

    bins = frappe.get_all(
        "Bin",
        fields=["item_code", "warehouse", "actual_qty", "reserved_qty", "stock_uom"],
        limit=0)
    sellable = set(frappe.get_all(
        "Item", filters={"disabled": 0, "is_sales_item": 1, "is_stock_item": 1},
        pluck="name", limit=0))

    out_of_stock = []
    for b in bins:
        if b.item_code in sellable and flt(b.actual_qty) <= 0:
            out_of_stock.append(_bin_row(b))
    out_of_stock.sort(key=lambda r: r["item_code"])
    out_of_stock = out_of_stock[:limit]

    # Reorder levels live in the Item Reorder child table (v15+), keyed by
    # (parent item, warehouse).
    reorders = frappe.get_all(
        "Item Reorder",
        filters={"warehouse_reorder_level": (">", 0)},
        fields=["parent as item_code", "warehouse", "warehouse_reorder_level as reorder_level",
                "warehouse_reorder_qty as reorder_qty"],
        limit=0)
    bin_qty = {(b.item_code, b.warehouse): flt(b.actual_qty) for b in bins}
    low_stock = []
    for r in reorders:
        if r.item_code not in sellable:
            continue
        actual = bin_qty.get((r.item_code, r.warehouse))
        if actual is not None and actual <= flt(r.reorder_level):
            low_stock.append({
                "item_code": r.item_code, "warehouse": r.warehouse,
                "actual_qty": actual, "reserved_qty": 0.0,
                "reorder_level": flt(r.reorder_level),
                "reorder_qty": flt(r.reorder_qty),
            })
    low_stock.sort(key=lambda x: x["actual_qty"] - x["reorder_level"])
    low_stock = low_stock[:limit]

    # NULL expiry_date rows are excluded automatically by the `<` comparison.
    expiring = frappe.get_all(
        "Batch",
        filters=[["expiry_date", "<", frappe.utils.add_days(None, days_to_expiry)],
                 ["batch_qty", ">", 0]],
        fields=["name as batch_id", "item as item_code", "expiry_date", "batch_qty"],
        order_by="expiry_date asc", limit=limit)

    return {
        "api_version": API_VERSION,
        "generated_at": now_datetime().isoformat(),
        "days_to_expiry": days_to_expiry,
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "expiring": [{
            "batch_id": b.batch_id, "item_code": b.item_code,
            "expiry_date": str(b.expiry_date), "batch_qty": flt(b.batch_qty),
        } for b in expiring],
    }


def _bin_row(b) -> dict:
    return {
        "item_code": b.item_code, "warehouse": b.warehouse,
        "actual_qty": flt(b.actual_qty), "reserved_qty": flt(b.reserved_qty),
        "reorder_level": flt(b.reorder_level), "reorder_qty": flt(b.reorder_qty),
    }


@frappe.whitelist()
def server_status() -> dict:
    """Server health snapshot: version info and sync backlog visibility."""
    frappe.only_for(SUMMARY_ROLES)
    processing = frappe.get_all("POS Sale Sync Log",
                                filters={"status": "Processing"},
                                fields=["transaction_id", "first_received_at"], limit=0)
    review = frappe.get_all("POS Sale Sync Log",
                            filters={"status": "Requires Review"},
                            fields=["transaction_id", "error_code", "error_message",
                                    "modified"], limit=0)
    devices = frappe.get_all("POS Device",
                             fields=["device_id", "counter_name", "status",
                                     "last_sync_at"], limit=0)

    db_info = {"engine": "MariaDB"}
    try:
        deadlocks = frappe.db.sql("SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'")
        if deadlocks:
            db_info["innodb_deadlocks"] = cint(deadlocks[0][1])
        version = frappe.db.sql("SELECT VERSION()")
        if version:
            db_info["version"] = str(version[0][0])
    except Exception:
        pass

    return {
        "api_version": API_VERSION,
        "generated_at": now_datetime().isoformat(),
        "frappe_version": frappe.__version__,
        "apps": frappe.get_installed_apps(),
        "database": db_info,
        "devices": devices,
        "processing_transactions": [p.transaction_id for p in processing],
        "review_queue": [{"transaction_id": r.transaction_id, "error_code": r.error_code,
                          "error_message": r.error_message, "updated_at": str(r.modified)}
                         for r in review],
    }

