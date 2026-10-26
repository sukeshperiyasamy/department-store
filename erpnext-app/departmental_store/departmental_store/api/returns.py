"""POS sales returns: find an original bill, return selected quantities, and post
a supported ERPNext return (Sales Invoice with is_return / return_against) through
the standard document lifecycle.

Guarantees mirror submit_pos_sale (api/sales.py):
- Idempotency via POS Sale Sync Log claim on the return's own transaction_id.
- Quantities validated against the original invoice minus already-returned qty.
- Stock and accounting effects come exclusively from the ERPNext lifecycle
  (update_stock return increases stock; credit-note GL entries posted by ERPNext).
- Authorization: billing users may return same-day bills; older bills require the
  Store Manager role (configurable window).
"""

import json
from typing import Any

import frappe
from frappe.utils import add_to_date, cint, flt, get_datetime, now_datetime, today

from departmental_store.hooks import (
    API_VERSION,
    ERROR_DEVICE_DISABLED,
    ERROR_DEVICE_UNKNOWN,
    ERROR_INVOICE_POSTING_FAILED,
    ERROR_VALIDATION_FAILED,
    SUPPORTED_API_VERSIONS,
)
from departmental_store.departmental_store.doctype.pos_sale_sync_log.pos_sale_sync_log import (
    PROCESSING_STALE_MINUTES,
)
from departmental_store.api.sales import (
    SaleReviewError,
    _claim_transaction,
    _classify_error,
    _existing_result,
    _resolve_log,
    _require,
    _review_result,
    _validate_device,
    _parse_payload,
    _posting_date,
    TRANSACTION_ID_RE,
)

# Cashiers may return bills from the last N days without a manager.
CASHIER_RETURN_WINDOW_DAYS = 1

MAX_LINES = 500


@frappe.whitelist()
def get_original_invoice(invoice_name: str | None = None) -> dict:
    """Lookup for the returns UI: invoice header + lines with returnable qty."""
    _require(invoice_name and isinstance(invoice_name, str) and len(invoice_name) <= 140,
             "invoice_name is required")
    inv = frappe.db.get_value(
        "Sales Invoice", invoice_name,
        ["name", "customer", "posting_date", "docstatus", "is_return", "status"],
        as_dict=True)
    if not inv or inv.docstatus != 1:
        raise SaleReviewError("INVOICE_NOT_FOUND", f"Invoice '{invoice_name}' not found")
    if inv.is_return:
        raise SaleReviewError("INVOICE_NOT_RETURNABLE", "Credit notes cannot be returned again")

    original_items = frappe.get_all(
        "Sales Invoice Item",
        filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
        fields=["item_code", "item_name", "qty", "rate", "uom"],
        order_by="idx asc",
        limit=0)
    returned = _returned_qty_by_item(invoice_name)

    lines = [{
        "item_code": it.item_code,
        "item_name": it.item_name,
        "uom": it.uom,
        "sold_qty": flt(it.qty),
        "rate": flt(it.rate),
        "already_returned_qty": flt(returned.get(it.item_code, 0.0)),
        "returnable_qty": flt(it.qty) - flt(returned.get(it.item_code, 0.0)),
    } for it in original_items]

    payments = frappe.get_all(
        "Sales Invoice Payment",
        filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
        fields=["mode_of_payment", "amount"],
        limit=0)

    return {
        "api_version": API_VERSION,
        "invoice": {
            "name": inv.name,
            "customer": inv.customer,
            "posting_date": str(inv.posting_date),
            "status": inv.status,
        },
        "lines": lines,
        "payments": [{"mode_of_payment": p.mode_of_payment,
                      "amount": flt(p.amount)} for p in payments],
    }


@frappe.whitelist()
def submit_pos_return(payload: str | dict | None = None) -> dict:
    """Submit a return/credit note against a finalized counter sale."""
    data = _parse_payload(payload)
    transaction_id = data.get("transaction_id")
    if not isinstance(transaction_id, str):
        transaction_id = None

    try:
        _require(isinstance(transaction_id, str)
                 and TRANSACTION_ID_RE.match(transaction_id),
                 "transaction_id is required (max 100 chars; letters, digits, - _ . only)")
        _require(isinstance(data.get("lines"), list) and bool(data["lines"]),
                 "lines must be a non-empty list")
        _require(len(data["lines"]) <= MAX_LINES, f"at most {MAX_LINES} lines allowed")
        _require(cint(data.get("api_version", API_VERSION)) in SUPPORTED_API_VERSIONS,
                 f"unsupported api_version, supported: {SUPPORTED_API_VERSIONS}")

        device = _validate_device(data.get("device_id"))
    except SaleReviewError as exc:
        return _review_result(transaction_id, exc.code, exc.message)

    existing = _existing_result(transaction_id)
    if existing:
        existing["duplicate"] = True
        return existing

    log = _claim_transaction(transaction_id, data, device)
    if log is None:
        existing = _existing_result(transaction_id)
        if existing:
            existing["duplicate"] = True
            return existing
        return _review_result(transaction_id, ERROR_INVOICE_POSTING_FAILED,
                              "Could not record the return claim; nothing was posted. "
                              "Retry the submission.")

    try:
        result = _post_return(data, device)
        _resolve_log(log, status="Server Committed", response=result,
                     invoice=result["invoice"],
                     is_return=1, original_invoice=result["invoice"].get("return_against"))
        frappe.db.commit()
        result["duplicate"] = False
        return result
    except Exception as exc:
        code, message = _classify_error(exc)
        frappe.db.rollback()
        review = _review_result(transaction_id, code, message)
        _resolve_log(log, status="Requires Review", response=review, invoice=None,
                     error_code=code, error_message=message,
                     is_return=1, original_invoice=data.get("original_invoice"))
        frappe.db.commit()
        return review


def _returned_qty_by_item(original_invoice: str) -> dict[str, float]:
    """Qty already returned per item across all submitted returns of this invoice."""
    returns = frappe.get_all(
        "Sales Invoice",
        filters={"return_against": original_invoice, "docstatus": 1, "is_return": 1},
        pluck="name", limit=0)
    if not returns:
        return {}
    rows = frappe.get_all(
        "Sales Invoice Item",
        filters={"parent": ("in", returns), "parenttype": "Sales Invoice"},
        fields=["item_code", "qty"], limit=0)
    # Return rows carry negative qty; accumulate magnitudes.
    out: dict[str, float] = {}
    for row in rows:
        out[row.item_code] = out.get(row.item_code, 0.0) + abs(flt(row.qty))
    return out


def _authorize_return(original: dict) -> None:
    """Cashier window + manager override (documented business rule)."""
    if "Store Manager" in frappe.get_roles():
        return
    posting_date = get_datetime(original.posting_date)
    cutoff = add_to_date(now_datetime(), days=-CASHIER_RETURN_WINDOW_DAYS)
    if posting_date < cutoff:
        raise SaleReviewError(
            "RETURN_AUTHORIZATION_REQUIRED",
            f"Returning a bill dated {original.posting_date} requires a Store Manager")


def _post_return(data: dict, device: dict | None) -> dict:
    invoice_name = data.get("original_invoice")
    _require(invoice_name and isinstance(invoice_name, str) and len(invoice_name) <= 140,
             "original_invoice is required")

    original = frappe.db.get_value(
        "Sales Invoice", invoice_name,
        ["name", "customer", "posting_date", "docstatus", "is_return", "company",
         "pos_profile", "currency"],
        as_dict=True)
    if not original or original.docstatus != 1:
        raise SaleReviewError("INVOICE_NOT_FOUND", f"Invoice '{invoice_name}' not found")
    if original.is_return:
        raise SaleReviewError("INVOICE_NOT_RETURNABLE",
                              "Credit notes cannot be returned again")

    _authorize_return(original)

    lines = data["lines"]
    _require(isinstance(lines, list) and bool(lines), "lines must be a non-empty list")

    original_items = {
        it.item_code: it for it in frappe.get_all(
            "Sales Invoice Item",
            filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
            fields=["item_code", "qty", "rate", "uom", "price_list_rate"], limit=0)
    }
    already = _returned_qty_by_item(invoice_name)

    return_rows = []
    for line in lines:
        _require(isinstance(line, dict), "each line must be an object")
        item_code = line.get("item_code")
        _require(item_code and isinstance(item_code, str), "each line needs an item_code")
        original_item = original_items.get(item_code)
        if not original_item:
            raise SaleReviewError("ITEM_NOT_ON_ORIGINAL_INVOICE",
                                  f"Item '{item_code}' is not on invoice '{invoice_name}'")
        qty = flt(line.get("qty"))
        _require(qty > 0, f"line {item_code}: return qty must be > 0")
        returnable = flt(original_item.qty) - already.get(item_code, 0.0)
        if qty > returnable + 1e-9:
            raise SaleReviewError(
                "RETURN_QTY_EXCEEDS",
                f"Item '{item_code}': returnable qty is {returnable:.3f}, requested {qty:.3f}")
        return_rows.append({
            "item_code": item_code,
            # Returns are posted with negative quantities through the standard
            # ERPNext lifecycle; rate stays the original sold rate.
            "qty": -qty,
            "rate": flt(original_item.rate),
            "price_list_rate": flt(original_item.price_list_rate) or flt(original_item.rate),
            "uom": original_item.uom,
        })

    # Refunds: explicit payload rows (amounts are refunded via the given modes) or a
    # proportional mirror of the ALLOCATED original payments (tendered minus change).
    payment_rows = data.get("payments")
    if payment_rows:
        _require(isinstance(payment_rows, list) and bool(payment_rows),
                 "payments must be a non-empty list when provided")
        out_payments = []
        for p in payment_rows:
            mode = p.get("mode_of_payment")
            amount = flt(p.get("amount"))
            _require(mode and isinstance(mode, str) and amount > 0,
                     "each refund payment needs a mode_of_payment and positive amount")
            out_payments.append({"mode_of_payment": mode, "amount": -amount})
    else:
        out_payments = _mirror_refunds(invoice_name)

    # POS Profile for the return: original's profile, else the device-counter default.
    profile = original.pos_profile or _default_pos_profile()
    _require(profile, "No POS Profile available for the return "
                      "(original invoice has none and no active profile exists)")

    invoice = frappe.get_doc({
        "doctype": "Sales Invoice",
        "is_pos": 1,
        "is_return": 1,
        "return_against": invoice_name,
        "company": original.company,
        "customer": original.customer,
        "pos_profile": profile,
        "update_stock": 1,
        "set_posting_time": 1,
        "posting_date": _posting_date(data.get("occurred_at")),
        "currency": original.currency,
        "items": return_rows,
        "payments": out_payments,
    })
    if data.get("reason"):
        # Kept short; full reason goes on the sync log audit trail.
        invoice.remarks = f"POS return by {frappe.session.user}: {str(data['reason'])[:120]}"

    invoice.insert()  # ERPNext validates return quantities/taxes/stock; totals known

    if payment_rows:
        # Explicit refunds must match the credit-note total — ERPNext rejects
        # mismatches, but surface it as a review result instead of a raw error.
        refund_total = sum(abs(flt(p.amount)) for p in invoice.payments)
        if abs(refund_total - abs(flt(invoice.base_grand_total))) > 0.011:
            raise SaleReviewError(
                "REFUND_MISMATCH",
                f"Refund total {refund_total:.2f} does not match the return value "
                f"{abs(flt(invoice.base_grand_total)):.2f}")
    else:
        # Align the mirrored refunds exactly to the credit-note total.
        target = abs(flt(invoice.base_grand_total))
        current = sum(abs(flt(p.amount)) for p in invoice.payments)
        if current > 0:
            factor = target / current
            for p in invoice.payments:
                p.amount = -(round(abs(flt(p.amount)) * factor,
                                   invoice.precision("amount") or 2))
            diff = round(target - sum(abs(flt(p.amount)) for p in invoice.payments), 2)
            if abs(diff) >= 0.01:
                last = invoice.payments[-1]
                last.amount = -(round(abs(flt(last.amount)) + diff, 2))

    invoice.submit()

    grand_total = flt(invoice.base_grand_total)
    return {
        "api_version": API_VERSION,
        "status": "SERVER_COMMITTED",
        "transaction_id": data["transaction_id"],
        "is_return": True,
        "invoice": {
            "doctype": invoice.doctype,
            "name": invoice.name,
            "return_against": invoice.return_against,
            "customer": invoice.customer,
            "posting_date": str(invoice.posting_date),
            "net_total": flt(invoice.base_net_total),
            "total_taxes_and_charges": flt(invoice.base_total_taxes_and_charges),
            "grand_total": grand_total,
            "rounding_adjustment": flt(invoice.base_rounding_adjustment),
            "change_amount": 0,
            "currency": invoice.currency,
        },
        "error": None,
        "resolved_at": now_datetime().isoformat(),
    }


def _mirror_refunds(invoice_name: str) -> list[dict]:
    """Allocated refund shares of the original invoice's payment rows.

    Payment rows carry TENDERED amounts (cash includes change given), so cash rows
    are reduced by the invoice's change amount first — mirroring tendered values
    would over-refund (QA-RET-001)."""
    original = frappe.db.get_value(
        "Sales Invoice", invoice_name,
        ["base_change_amount", "change_amount", "base_grand_total"], as_dict=True)
    change = flt(original.base_change_amount or original.change_amount or 0)

    rows = frappe.get_all(
        "Sales Invoice Payment",
        filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
        fields=["mode_of_payment", "base_amount", "amount"], limit=0)
    _require(bool(rows), "no refund payments provided and the original invoice has no payments")

    out = []
    for row in rows:
        amount = flt(row.base_amount or row.amount)
        is_cash = frappe.db.get_value("Mode of Payment", row.mode_of_payment, "type") == "Cash"
        if is_cash and change > 0:
            amount = max(0.0, amount - change)
        if amount > 0:
            out.append({"mode_of_payment": row.mode_of_payment, "amount": -amount})
    _require(bool(out), "the original invoice's payments were fully returned as change; "
                        "provide refund payments explicitly")
    return out


def _default_pos_profile() -> str | None:
    return frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
