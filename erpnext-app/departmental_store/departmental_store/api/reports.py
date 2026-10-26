"""Owner-facing reporting API.

Every metric has an explicit definition documented in docs/api-contracts.md.
Aggregates are read-only queries over submitted (docstatus=1) documents.
"""

import frappe
from frappe.utils import flt, now_datetime, today

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
    - payment split: sum of Sales Invoice Payment.base_amount per mode of payment.
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
    if names:
        rows = frappe.get_all("Sales Invoice Payment",
                              filters={"parent": ("in", names)},
                              fields=["mode_of_payment", "base_amount"], limit=0)
        for row in rows:
            payment_split[row.mode_of_payment] = flt(
                payment_split.get(row.mode_of_payment, 0.0) + flt(row.base_amount))

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
    return {
        "api_version": API_VERSION,
        "generated_at": now_datetime().isoformat(),
        "frappe_version": frappe.__version__,
        "apps": frappe.get_installed_apps(),
        "devices": devices,
        "processing_transactions": [p.transaction_id for p in processing],
        "review_queue": [{"transaction_id": r.transaction_id, "error_code": r.error_code,
                          "error_message": r.error_message, "updated_at": str(r.modified)}
                         for r in review],
    }
