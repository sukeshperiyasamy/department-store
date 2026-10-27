"""Idempotent POS sale submission.

Contract: docs/api-contracts.md (API v1). The server re-derives prices, taxes and
item validity from ERPNext masters; client-supplied amounts are display-only unless
an authorized rate override is requested.

Idempotency: a POS Sale Sync Log row keyed by the client transaction_id is claimed
atomically before any invoice is created, so concurrent or retried submissions of the
same transaction can never create a second invoice. The claim survives server crashes
(stale claims surface as PROCESSING on retry, and are marked for review).

All outcomes are returned as structured results (never raised to the caller) so the
counter sync engine can persist the exact server verdict.
"""

import json
import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import (
    add_to_date,
    cint,
    convert_utc_to_timezone,
    flt,
    get_datetime,
    get_system_timezone,
    now_datetime,
    today,
)

from departmental_store.hooks import (
    API_VERSION,
    ERROR_BATCH_INVALID,
    ERROR_DEVICE_DISABLED,
    ERROR_DEVICE_UNKNOWN,
    ERROR_INVOICE_POSTING_FAILED,
    ERROR_ITEM_DISABLED,
    ERROR_ITEM_NOT_FOUND,
    ERROR_PAYMENT_SHORTFALL,
    ERROR_PRICE_MISSING,
    ERROR_REQUIRES_POS_PROFILE,
    ERROR_VALIDATION_FAILED,
    SUPPORTED_API_VERSIONS,
)
from departmental_store.departmental_store.doctype.pos_sale_sync_log.pos_sale_sync_log import (
    PROCESSING_STALE_MINUTES,
)

MAX_LINES = 500

# QA-0003: transaction ids become document names and join the audit trail; keep
# them to a strict charset so injection payloads are rejected before any write.
TRANSACTION_ID_RE = re.compile(r"^[A-Za-z0-9_\-\.]{1,100}$")


class SaleReviewError(Exception):
    """Deterministic failure that must surface as Requires Review on the counter."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@frappe.whitelist()
def submit_pos_sale(payload: str | dict | None = None) -> dict:
    """Submit one finalized counter sale. Returns a stable result for the
    transaction_id; re-submission returns the recorded result with duplicate=True."""
    data = _parse_payload(payload)
    transaction_id = data.get("transaction_id")
    if not isinstance(transaction_id, str):
        transaction_id = None

    # Everything after parsing is reported as a structured result, never raised,
    # so the counter can persist the exact server verdict.
    try:
        _require(isinstance(transaction_id, str)
                 and TRANSACTION_ID_RE.match(transaction_id),
                 "transaction_id is required (max 100 chars; letters, digits, - _ . only)")
        _require(isinstance(data.get("lines"), list) and bool(data["lines"]),
                 "lines must be a non-empty list")
        _require(len(data["lines"]) <= MAX_LINES, f"at most {MAX_LINES} lines allowed")
        _require(isinstance(data.get("payments"), list) and bool(data["payments"]),
                 "payments must be a non-empty list")
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
        # Either another request won the race (its result is authoritative) or the
        # claim write failed (QA-0003: never leak a 500 — report for retry).
        existing = _existing_result(transaction_id)
        if existing:
            existing["duplicate"] = True
            return existing
        return _review_result(transaction_id, ERROR_INVOICE_POSTING_FAILED,
                              "Could not record the transaction claim; nothing was "
                              "posted. Retry the submission.")

    try:
        result = _post_sale_with_deadlock_retry(data, device)
        _resolve_log(log, status="Server Committed", response=result, invoice=result["invoice"])
        frappe.db.commit()
        result["duplicate"] = False
        return result
    except Exception as exc:
        code, message = _classify_error(exc)
        frappe.db.rollback()
        review = _review_result(transaction_id, code, message)
        _resolve_log(log, status="Requires Review", response=review, invoice=None,
                     error_code=code, error_message=message)
        frappe.db.commit()
        return review


@frappe.whitelist()
def check_transaction(transaction_id: str | None = None) -> dict:
    """Recovery endpoint: return the recorded result of a transaction, if any.
    Used when the response to submit_pos_sale is lost (e.g. network cut after commit)."""
    _require(transaction_id and isinstance(transaction_id, str) and len(transaction_id) <= 100,
             "transaction_id is required")
    result = _existing_result(transaction_id)
    if result is None:
        return {"api_version": API_VERSION, "status": "UNKNOWN",
                "transaction_id": transaction_id, "invoice": None, "error": None}
    return result


def _parse_payload(payload: str | dict | None) -> dict:
    if payload is None:
        raise frappe.ValidationError(_("payload is required"))
    if isinstance(payload, str):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            raise frappe.ValidationError(_("payload is not valid JSON"))
    elif isinstance(payload, dict):
        data = payload
    else:
        raise frappe.ValidationError(_("payload must be an object"))
    if not isinstance(data, dict):
        raise frappe.ValidationError(_("payload must be an object"))
    return data


def _require(condition: Any, message: str) -> None:
    if not condition:
        raise SaleReviewError(ERROR_VALIDATION_FAILED, message)


def _validate_device(device_id: Any) -> dict | None:
    if not device_id or not isinstance(device_id, str):
        return None
    row = frappe.db.get_value("POS Device", device_id,
                              ["name", "status", "counter_name"], as_dict=True)
    if not row:
        raise SaleReviewError(ERROR_DEVICE_UNKNOWN, f"Device '{device_id}' is not registered")
    if row.status != "Enabled":
        raise SaleReviewError(ERROR_DEVICE_DISABLED, f"Device '{device_id}' is disabled")
    return {"device_id": row.name, "counter_name": row.counter_name}


def _existing_result(transaction_id: str) -> dict | None:
    row = frappe.db.get_value("POS Sale Sync Log", transaction_id,
                              ["status", "response_payload", "first_received_at"], as_dict=True)
    if not row:
        return None
    if row.status == "Processing":
        stale_after = get_datetime(row.first_received_at) if row.first_received_at else None
        is_stale = (stale_after is None or
                    stale_after < add_to_date(now_datetime(), minutes=-PROCESSING_STALE_MINUTES))
        return {
            "api_version": API_VERSION,
            "status": "PROCESSING",
            "transaction_id": transaction_id,
            "stale": bool(is_stale),
            "message": ("A previous attempt is still being processed; retry later"
                        if not is_stale else
                        "A previous attempt appears abandoned; contact a manager"),
            "invoice": None,
            "error": None,
        }
    response = row.response_payload
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except json.JSONDecodeError:
            response = {}
    result = response or {}
    result.setdefault("api_version", API_VERSION)
    result.setdefault("status", "REQUIRES_REVIEW" if row.status == "Requires Review"
                      else "SERVER_COMMITTED")
    result["transaction_id"] = transaction_id
    result.pop("duplicate", None)
    return result


def _claim_transaction(transaction_id: str, data: dict, device: dict | None,
                       is_return: int = 0, original_invoice: str | None = None):
    """Insert the idempotency claim atomically. Returns None if another request
    won the race OR the claim could not be recorded (logged, reported for retry)."""
    try:
        log = frappe.get_doc({
            "doctype": "POS Sale Sync Log",
            "transaction_id": transaction_id,
            "status": "Processing",
            "device_id": device.get("device_id") if device else data.get("device_id"),
            "device": device.get("device_id") if device else None,
            "counter_name": device.get("counter_name") if device else data.get("counter_name"),
            "submitted_by": frappe.session.user,
            "first_received_at": now_datetime(),
            "attempt_count": 1,
            "is_return": is_return,
            "original_invoice": original_invoice,
            "request_payload": json.dumps(data, default=str)[:500000],
        })
        log.insert(ignore_permissions=True)
        frappe.db.commit()
        return log
    except frappe.DuplicateEntryError:
        frappe.db.rollback()
        return None
    except Exception as claim_error:  # never leak a 500 from the claim path
        frappe.db.rollback()
        frappe.logger("departmental_store").error({
            "event": "pos_claim_failed", "transaction_id": transaction_id,
            "error": str(claim_error)[:500],
        })
        return None


def _resolve_log(log, status: str, response: dict, invoice: dict | None,
                 error_code: str | None = None, error_message: str | None = None,
                 is_return: int = 0, original_invoice: str | None = None) -> None:
    log.status = status
    log.response_payload = json.dumps(response, default=str)
    log.invoice_doctype = invoice.get("doctype") if invoice else None
    log.invoice_name = invoice.get("name") if invoice else None
    log.error_code = error_code
    log.error_message = error_message
    if is_return:
        log.is_return = 1
    if original_invoice:
        log.original_invoice = original_invoice
    log.last_resolved_at = now_datetime()
    log.save(ignore_permissions=True)


def _post_sale_with_deadlock_retry(data: dict, device: dict | None, max_attempts: int = 6) -> dict:
    """Multiple counters submitting at the same instant can contend on Frappe's
    naming series (tabSeries, InnoDB gap lock / error 1020). Because a single sale
    takes ~400-600ms for full stock & GL posting, the retry jitter must allow sufficient
    time for the preceding transaction to commit before retrying."""
    import random
    import time

    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _post_sale(data, device)
        except Exception as exc:
            if _is_deadlock(exc) and attempt < max_attempts:
                frappe.db.rollback()
                frappe.local.message_log = []
                delay = random.uniform(0.20, 0.45) * attempt
                frappe.logger("departmental_store").warning({
                    "event": "pos_deadlock_retried",
                    "user": frappe.session.user,
                    "attempt": attempt,
                    "delay_seconds": delay,
                    "error": str(exc),
                })
                time.sleep(delay)
                last_exc = exc
                continue
            raise
    if last_exc:
        raise last_exc


def _is_deadlock(exc: Exception) -> bool:
    text = f"{type(exc).__name__}: {exc}"
    return ("QueryDeadlockError" in text or "Record has changed since last read" in text
            or "Deadlock found" in text or "try restarting transaction" in text.lower()
            or "1020" in text or "1213" in text or "lock wait timeout" in text.lower())


def _post_sale(data: dict, device: dict | None) -> dict:
    profile = _resolve_pos_profile(data.get("pos_profile"))
    company = profile.get("company") or frappe.defaults.get_global_default("company")
    _require(company, "No company configured")
    price_list = (profile.get("selling_price_list")
                  or frappe.db.get_single_value("Selling Settings", "selling_price_list")
                  or "Standard Selling")
    warehouse = profile.get("warehouse") or _default_warehouse(company)

    customer = data.get("customer") or profile.get("customer")
    _require(customer, "No customer on the bill and no default customer on the POS Profile")

    manager_override = (bool(data.get("allow_rate_override"))
                        and "Store Manager" in frappe.get_roles())

    # Sales Invoice (is_pos) is the v16 POS document: unlike POS Invoice it moves
    # stock per bill on submit, handles paid amounts and change, and is the mode
    # ERPNext v16 itself defaults POS to. See ADR-0002.
    invoice = frappe.get_doc({
        "doctype": "Sales Invoice",
        "is_pos": 1,
        "company": company,
        "customer": customer,
        "pos_profile": profile.name,
        "update_stock": 1,
        "set_posting_time": 1,
        "posting_date": _posting_date(data.get("occurred_at")),
        "currency": profile.get("currency")
                    or frappe.db.get_value("Company", company, "default_currency"),
        "items": [],
        "payments": [],
    })

    override_notes = []
    for line in data["lines"]:
        row = _validate_and_price_line(line, price_list, warehouse, manager_override,
                                       override_notes)
        invoice.append("items", row)

    for payment in data["payments"]:
        mode = payment.get("mode_of_payment")
        amount = flt(payment.get("amount"))
        _require(mode and isinstance(mode, str), "each payment needs a mode_of_payment")
        _require(amount >= 0, "payment amounts cannot be negative")
        prow = {"mode_of_payment": mode, "amount": amount}
        if payment.get("reference_no"):
            prow["reference_no"] = payment["reference_no"]
        if payment.get("reference_date"):
            prow["reference_date"] = payment["reference_date"]
        invoice.append("payments", prow)

    invoice.insert()  # validate() computes totals and taxes from ERPNext masters

    grand_total = flt(invoice.base_grand_total)
    tendered = sum(flt(p.amount) for p in invoice.payments)
    if tendered + 0.009 < grand_total:
        raise SaleReviewError(
            ERROR_PAYMENT_SHORTFALL,
            f"Tendered {tendered:.2f} is less than grand total {grand_total:.2f}")

    has_cash = any(frappe.db.get_value("Mode of Payment", p.mode_of_payment, "type") == "Cash"
                   for p in invoice.payments)
    change = flt(tendered - grand_total, invoice.precision("grand_total"))
    if change > 0 and has_cash and invoice.meta.has_field("change_amount"):
        invoice.change_amount = change
        if invoice.meta.has_field("base_change_amount"):
            invoice.base_change_amount = change

    invoice.submit()

    if manager_override and override_notes:
        invoice.add_comment("Comment",
                            "POS rate override used by %s. Lines: %s"
                            % (frappe.session.user, ", ".join(override_notes)))
        frappe.logger("departmental_store").info({
            "event": "pos_rate_override", "invoice": invoice.name,
            "user": frappe.session.user, "lines": override_notes,
        })

    return {
        "api_version": API_VERSION,
        "status": "SERVER_COMMITTED",
        "transaction_id": data["transaction_id"],
        "invoice": {
            "doctype": invoice.doctype,
            "name": invoice.name,
            "customer": invoice.customer,
            "posting_date": str(invoice.posting_date),
            "net_total": flt(invoice.base_net_total),
            "total_taxes_and_charges": flt(invoice.base_total_taxes_and_charges),
            "grand_total": grand_total,
            "rounding_adjustment": flt(invoice.base_rounding_adjustment),
            "change_amount": change if (change > 0 and has_cash) else 0,
            "currency": invoice.currency,
        },
        "error": None,
        "resolved_at": now_datetime().isoformat(),
    }


def _resolve_pos_profile(requested: str | None):
    fields = ["name", "company", "customer", "currency", "warehouse",
              "selling_price_list", "update_stock"]
    if requested:
        profile = frappe.db.get_value("POS Profile", requested, fields, as_dict=True)
        if not profile:
            raise SaleReviewError(ERROR_REQUIRES_POS_PROFILE,
                                  f"POS Profile '{requested}' not found")
        return profile
    names = frappe.get_all("POS Profile", filters={"disabled": 0}, fields=fields, limit=1)
    if not names:
        raise SaleReviewError(ERROR_REQUIRES_POS_PROFILE,
                              "No active POS Profile configured; create one and set "
                              "warehouse/customer")
    return names[0]


def _default_warehouse(company: str) -> str | None:
    return frappe.db.get_value("Warehouse",
                               {"company": company, "is_group": 0, "disabled": 0}, "name")


def _posting_date(occurred_at: Any) -> str:
    """Use the counter's local date for the posting date so offline bills keep their
    business day. Clock skew outside the accepted window fails to review instead of
    silently shifting the books. Timezone-aware ISO timestamps are converted to the
    FRAPPE SITE timezone (QA-0005 regression: datetime.astimezone() follows the
    container's TZ env — UTC in the docker stack — while Frappe posts stock entries
    in the site timezone; a UTC container + Asia/Kolkata site shifted the posting
    date to the previous calendar day, putting every recent receipt "in the future"
    of the sale and failing stock validation with NegativeStockError)."""
    if not occurred_at or not isinstance(occurred_at, str):
        return today()
    try:
        occurred = get_datetime(occurred_at)
    except Exception:
        return today()
    if occurred.tzinfo is not None:
        occurred = convert_utc_to_timezone(
            occurred, get_system_timezone()).replace(tzinfo=None)
    now = now_datetime()
    if occurred > add_to_date(now, minutes=10) or occurred < add_to_date(now, days=-3):
        raise SaleReviewError(
            ERROR_VALIDATION_FAILED,
            f"Bill timestamp {occurred_at} is outside the accepted skew window")
    return occurred.date().isoformat()


def _validate_and_price_line(line: dict, price_list: str, warehouse: str | None,
                             manager_override: bool, override_notes: list) -> dict:
    _require(isinstance(line, dict), "each line must be an object")
    item_code = line.get("item_code")
    _require(item_code and isinstance(item_code, str), "each line needs an item_code")
    qty = flt(line.get("qty"))
    _require(qty > 0, f"line {item_code}: qty must be > 0")

    item = frappe.db.get_value("Item", item_code,
                               ["name", "disabled", "is_stock_item", "is_sales_item",
                                "has_batch_no", "has_serial_no", "stock_uom"], as_dict=True)
    if not item:
        raise SaleReviewError(ERROR_ITEM_NOT_FOUND, f"Item '{item_code}' not found")
    if item.disabled or not item.is_sales_item:
        raise SaleReviewError(ERROR_ITEM_DISABLED, f"Item '{item_code}' is not sellable")

    row = {"item_code": item_code, "qty": qty, "uom": item.stock_uom}
    if warehouse:
        row["warehouse"] = warehouse

    batch_no = line.get("batch_no")
    if batch_no:
        if not item.has_batch_no:
            raise SaleReviewError(ERROR_BATCH_INVALID,
                                  f"Item '{item_code}' does not use batches")
        batch = frappe.db.get_value("Batch", batch_no, ["name", "item"], as_dict=True)
        if not batch or batch.item != item_code:
            raise SaleReviewError(ERROR_BATCH_INVALID,
                                  f"Batch '{batch_no}' is not valid for '{item_code}'")
        row["batch_no"] = batch_no

    if line.get("serial_nos") and item.has_serial_no:
        row["serial_no"] = "\n".join(str(s) for s in line["serial_nos"])

    client_rate = flt(line.get("rate"))
    discount = flt(line.get("discount_percent"))
    has_client_rate = client_rate > 0
    price = _lookup_price(item_code, price_list, item.stock_uom)

    if has_client_rate and manager_override:
        row["price_list_rate"] = price if price else client_rate
        row["rate"] = client_rate
        if discount > 0:
            row["discount_percentage"] = discount
        override_notes.append(f"{item_code}: override rate {client_rate}")
    elif price is None:
        raise SaleReviewError(
            ERROR_PRICE_MISSING,
            f"No selling price found for '{item_code}' in price list '{price_list}'")
    else:
        row["price_list_rate"] = price
        row["rate"] = price
        if discount > 0:
            if manager_override:
                row["discount_percentage"] = discount
            else:
                override_notes.append(
                    f"{item_code}: line discount requires Store Manager, ignored")

    return row


def _lookup_price(item_code: str, price_list: str, stock_uom: str) -> float | None:
    rows = frappe.get_all("Item Price",
                          filters={"price_list": price_list, "item_code": item_code,
                                   "selling": 1},
                          fields=["price_list_rate", "uom", "valid_from", "valid_upto"],
                          order_by="valid_from desc, modified desc",
                          limit=0)
    today_str = today()
    for row in rows:
        if row.uom and row.uom != stock_uom:
            continue
        if row.valid_from and str(row.valid_from) > today_str:
            continue
        if row.valid_upto and str(row.valid_upto) < today_str:
            continue
        return flt(row.price_list_rate)
    return None


def _classify_error(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, SaleReviewError):
        return exc.code, exc.message
    if isinstance(exc, frappe.ValidationError):
        return ERROR_VALIDATION_FAILED, str(exc)
    return ERROR_INVOICE_POSTING_FAILED, f"{type(exc).__name__}: {exc}"


def _review_result(transaction_id: str | None, code: str, message: str) -> dict:
    return {
        "api_version": API_VERSION,
        "status": "REQUIRES_REVIEW",
        "transaction_id": transaction_id,
        "invoice": None,
        "error": {"code": code, "message": message[:1000]},
        "resolved_at": now_datetime().isoformat(),
    }
