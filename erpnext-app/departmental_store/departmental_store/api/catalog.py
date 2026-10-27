"""Catalog snapshot API for counter SQLite caching.

The snapshot is a read-only projection of ERPNext masters (items, barcodes, prices,
tax templates, payment modes). Prices are authoritative from the selling price list.
Incremental sync uses a checkpoint string; items and prices modified after the
checkpoint are re-sent. Deletions are not detected incrementally in API v1 — the
client performs a full refresh when it detects a gap (documented limitation).
"""

import frappe
from frappe.utils import cint, now_datetime

from departmental_store.hooks import API_VERSION

CUSTOM_ALIAS_FIELD = "ds_search_aliases"


@frappe.whitelist()
def catalog_snapshot(since: str | None = None, price_list: str | None = None,
                     include_customers: str | int | None = None) -> dict:
    """Return a catalog snapshot for POS caching. `since` = previous checkpoint for
    incremental updates; omit for a full snapshot.

    Incremental correctness: an item is re-sent when EITHER the item OR any of
    its selling prices changed after `since` (a price-only change must reach
    counters — QA-0001 regression). Deletions are still not detected; clients
    full-refresh when the catalog drifts."""
    # Any authenticated POS user (cashier) may read the catalog.
    customer_flag = cint(include_customers)

    price_list_name, currency = _resolve_price_list(price_list)

    if since:
        # Items changed directly, plus items whose selling prices changed.
        changed_codes = set(frappe.get_all(
            "Item", filters={"disabled": 0, "is_sales_item": 1,
                             "modified": (">", since)},
            pluck="name", limit=0))
        priced_codes = set(frappe.db.sql_list(
            """
            SELECT ip.item_code
            FROM `tabItem Price` ip
            JOIN `tabItem` i ON i.name = ip.item_code
            WHERE ip.price_list = %s
              AND ip.selling = 1
              AND ip.modified > %s
              AND i.disabled = 0
              AND i.is_sales_item = 1
            """,
            (price_list_name, since),
        ))
        target_codes = sorted(changed_codes | priced_codes)
        items = _fetch_items_by_codes(target_codes) if target_codes else []
    else:
        items = _fetch_items_by_codes(None)

    item_codes = [it.item_code for it in items]

    barcodes_by_item = _barcodes(item_codes)
    # Current effective prices for every re-sent item (no `since` filter here:
    # the whole item row is upserted on the client, so it must carry the
    # present-day price, not a historical one).
    prices_by_item = _prices(item_codes, price_list_name, since=None)
    tax_templates = _tax_templates()

    out_items = []
    for it in items:
        out_items.append({
            "item_code": it.item_code,
            "item_name": it.item_name,
            "item_group": it.item_group,
            "stock_uom": it.stock_uom,
            "brand": it.brand,
            "description": it.description,
            "is_stock_item": bool(it.is_stock_item),
            "has_batch_no": bool(it.has_batch_no),
            "has_serial_no": bool(it.has_serial_no),
            "aliases": _split_aliases(it.aliases),
            "barcodes": barcodes_by_item.get(it.item_code, []),
            "price": prices_by_item.get(it.item_code),
            "modified": str(it.modified),
        })

    result = {
        "api_version": API_VERSION,
        "generated_at": now_datetime().isoformat(),
        # Checkpoint covers BOTH items and prices so no change is skipped by the
        # next incremental pull.
        "checkpoint": _new_checkpoint(price_list_name) or (since or ""),
        "price_list": price_list_name,
        "currency": currency,
        "items": out_items,
        "tax_templates": tax_templates,
        "payment_modes": frappe.get_all("Mode of Payment",
                                        filters={"enabled": 1},
                                        fields=["name as mode_of_payment", "type"],
                                        limit=0),
        "is_incremental": bool(since),
    }

    if customer_flag:
        result["customers"] = frappe.get_all(
            "Customer",
            filters={"disabled": 0},
            fields=["name as customer", "customer_name", "customer_group",
                    "mobile_no", "email_id"],
            limit=0,
        )

    return result


def _active_sales_item_codes() -> list[str]:
    return frappe.get_all("Item", filters={"disabled": 0, "is_sales_item": 1},
                          pluck="name", limit=0)


def _fetch_items_by_codes(codes: list[str] | None) -> list:
    filters = {"disabled": 0, "is_sales_item": 1}
    if codes is not None:
        filters["name"] = ("in", codes)
    return frappe.get_all(
        "Item",
        filters=filters,
        fields=[
            "name as item_code", "item_name", "item_group", "stock_uom", "brand",
            "description", "is_stock_item", "has_batch_no", "has_serial_no",
            "disabled", CUSTOM_ALIAS_FIELD + " as aliases", "modified",
        ],
        limit=0,
    )


def _new_checkpoint(price_list: str) -> str | None:
    """Max modified across items AND selling prices of this price list."""
    item_max = frappe.get_all("Item", filters={"disabled": 0, "is_sales_item": 1},
                              fields=[{"MAX": "modified"}], as_list=True)
    price_max = frappe.get_all("Item Price",
                               filters={"price_list": price_list, "selling": 1},
                               fields=[{"MAX": "modified"}], as_list=True)
    candidates = [str(row[0]) for row in (item_max + price_max) if row and row[0]]
    return max(candidates) if candidates else None


def _resolve_price_list(requested: str | None) -> tuple[str, str | None]:
    if requested:
        row = frappe.db.get_value("Price List", requested,
                                  ["name", "currency", "selling"], as_dict=True)
        if not row or not row.selling:
            raise frappe.ValidationError(f"Price List '{requested}' is not a selling list")
        return row.name, row.currency
    name = (frappe.db.get_single_value("Selling Settings", "selling_price_list")
            or "Standard Selling")
    currency = frappe.db.get_value("Price List", name, "currency")
    return name, currency


def _barcodes(item_codes: list[str]) -> dict[str, list[dict]]:
    if not item_codes:
        return {}
    rows = frappe.get_all("Item Barcode",
                          filters={"parent": ("in", item_codes)},
                          fields=["parent as item_code", "barcode", "barcode_type"],
                          limit=0)
    out: dict[str, list[dict]] = {}
    for row in rows:
        out.setdefault(row.item_code, []).append(
            {"barcode": row.barcode, "barcode_type": row.barcode_type})
    return out


def _prices(item_codes: list[str], price_list: str,
            since: str | None) -> dict[str, dict]:
    if not item_codes:
        return {}
    filters = {"price_list": price_list, "selling": 1, "item_code": ("in", item_codes)}
    if since:
        filters["modified"] = (">", since)
    rows = frappe.get_all("Item Price", filters=filters,
                          fields=["item_code", "price_list_rate", "uom",
                                  "valid_from", "valid_upto", "modified"],
                          order_by="valid_from desc, modified desc", limit=0)
    today_str = frappe.utils.today()
    out: dict[str, dict] = {}
    for row in rows:
        if row.valid_from and str(row.valid_from) > today_str:
            continue
        if row.valid_upto and str(row.valid_upto) < today_str:
            continue
        # First row per item is the newest effective price.
        if row.item_code in out:
            continue
        out[row.item_code] = {
            "price_list_rate": frappe.utils.flt(row.price_list_rate),
            "uom": row.uom,
        }
    return out


def _tax_templates() -> list[dict]:
    templates = frappe.get_all("Sales Taxes and Charges Template",
                               filters={"disabled": 0},
                               fields=["name", "company", "is_default"],
                               limit=0)
    if not templates:
        return []
    names = [t.name for t in templates]
    rows = frappe.get_all("Sales Taxes and Charges",
                          filters={"parent": ("in", names)},
                          fields=["parent", "charge_type", "account_head", "rate",
                                  "description", "idx"],
                          order_by="parent, idx", limit=0)
    taxes_by_parent: dict[str, list[dict]] = {}
    for row in rows:
        taxes_by_parent.setdefault(row.parent, []).append({
            "charge_type": row.charge_type,
            "account_head": row.account_head,
            "rate": frappe.utils.flt(row.rate),
            "description": row.description,
        })
    return [{
        "name": t.name, "company": t.company, "is_default": bool(t.is_default),
        "taxes": taxes_by_parent.get(t.name, []),
    } for t in templates]


def _split_aliases(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [a.strip() for a in str(raw).split(",") if a.strip()]
