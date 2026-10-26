import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@departmental/shared-types";
import {
  addItem,
  clearCart,
  displayTotals,
  emptyCart,
  removeLine,
  setQty,
} from "./cart";

function item(code: string, rate: number, overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    item_code: code,
    item_name: `Item ${code}`,
    stock_uom: "Nos",
    is_stock_item: true,
    has_batch_no: false,
    aliases: [],
    barcodes: [],
    price: { price_list_rate: rate },
    modified: "2026-10-26 00:00:00",
    ...overrides,
  };
}

describe("cart", () => {
  it("adds items and merges duplicates by item code", () => {
    let cart = emptyCart(false);
    cart = addItem(cart, item("SKU1", 55), 1);
    cart = addItem(cart, item("SKU1", 55), 2);
    cart = addItem(cart, item("SKU2", 30), 1);
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]?.qty).toBe(3);
    // rates arrive in major units from the catalog; cart totals are minor units
    expect(displayTotals(cart).subtotalMinor).toBe(55 * 3 * 100 + 30 * 100);
  });

  it("throws on items without a cached price", () => {
    const cart = emptyCart(false);
    expect(() => addItem(cart, item("NOPRICE", 0, { price: null }), 1)).toThrow(
      /^NO_PRICE:NOPRICE$/,
    );
  });

  it("rejects non-positive quantities", () => {
    const cart = emptyCart(false);
    expect(() => addItem(cart, item("SKU1", 10), 0)).toThrow("QTY_INVALID");
    expect(() => addItem(cart, item("SKU1", 10), -2)).toThrow("QTY_INVALID");
  });

  it("setQty removes the line at zero", () => {
    let cart = emptyCart(false);
    cart = addItem(cart, item("SKU1", 10), 2);
    const lineId = cart.lines[0]!.lineId;
    cart = setQty(cart, lineId, 0);
    expect(cart.lines).toHaveLength(0);
  });

  it("removeLine and clearCart behave", () => {
    let cart = emptyCart(false);
    cart = addItem(cart, item("SKU1", 10), 1);
    cart = addItem(cart, item("SKU2", 20), 1);
    cart = removeLine(cart, cart.lines[0]!.lineId);
    expect(cart.lines.map((l) => l.itemCode)).toEqual(["SKU2"]);
    cart = clearCart(cart);
    expect(cart.lines).toHaveLength(0);
  });

  it("marks totals as estimates when offline", () => {
    let cart = emptyCart(true);
    cart = addItem(cart, item("SKU1", 10), 1);
    const totals = displayTotals(cart);
    expect(totals.totalsAreEstimates).toBe(true);
    expect(totals.estimatedTotalMinor).toBe(1000);
    expect(totals.itemCount).toBe(1);
  });

  it("keeps fractional quantities precise in minor units", () => {
    let cart = emptyCart(false);
    cart = addItem(cart, item("RICE", 45.555), 0.5);
    expect(displayTotals(cart).subtotalMinor).toBe(Math.round(45.555 * 100) * 0.5);
  });
});
