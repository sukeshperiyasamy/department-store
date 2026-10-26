/**
 * Cart state and pure operations.
 *
 * The cart is a cashier aid. Client display totals (rates from the cached catalog)
 * are NOT authoritative: the server re-prices from the price list and computes tax.
 * Offline, the display carries an "estimate" flag so the UI can label it honestly.
 */
import type { CatalogItem } from "@departmental/shared-types";

export interface CartLine {
  readonly lineId: string;
  readonly itemCode: string;
  readonly itemName: string;
  readonly qty: number;
  /** Cached catalog rate in minor units (display only). */
  readonly displayRateMinor: number;
  readonly uom: string;
  readonly batchNo?: string;
}

export interface Cart {
  readonly lines: readonly CartLine[];
  readonly customer?: string;
  readonly customerId?: string;
  /** True when totals are computed from cached prices while offline. */
  readonly totalsAreEstimates: boolean;
}

export const emptyCart = (totalsAreEstimates: boolean): Cart => ({
  lines: [],
  totalsAreEstimates,
});

export function addItem(
  cart: Cart,
  item: CatalogItem,
  qty: number,
  now: () => number = Date.now,
): Cart {
  const price = item.price?.price_list_rate;
  if (price === undefined || price === null) {
    throw new Error(`NO_PRICE:${item.item_code}`);
  }
  if (!(qty > 0)) throw new Error("QTY_INVALID");
  const existing = cart.lines.find((l) => l.itemCode === item.item_code && !l.batchNo);
  if (existing) {
    return {
      ...cart,
      lines: cart.lines.map((l) =>
        l.lineId === existing.lineId ? { ...l, qty: roundQty(l.qty + qty) } : l,
      ),
    };
  }
  const line: CartLine = {
    lineId: `line-${now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemCode: item.item_code,
    itemName: item.item_name,
    qty: roundQty(qty),
    displayRateMinor: Math.round(price * 100),
    uom: item.stock_uom,
  };
  return { ...cart, lines: [...cart.lines, line] };
}

export function setQty(cart: Cart, lineId: string, qty: number): Cart {
  if (!(qty > 0)) return removeLine(cart, lineId);
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.lineId === lineId ? { ...l, qty: roundQty(qty) } : l)),
  };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.lineId !== lineId) };
}

export function clearCart(cart: Cart): Cart {
  const next = emptyCart(cart.totalsAreEstimates);
  const withCustomer: Cart = {
    ...next,
    ...(cart.customer !== undefined ? { customer: cart.customer } : {}),
    ...(cart.customerId !== undefined ? { customerId: cart.customerId } : {}),
  };
  return withCustomer;
}

export interface DisplayTotals {
  itemCount: number;
  subtotalMinor: number;
  /** Client cannot compute authoritative tax; UI labels totals as estimates offline. */
  estimatedTotalMinor: number;
  totalsAreEstimates: boolean;
}

export function displayTotals(cart: Cart): DisplayTotals {
  const subtotal = cart.lines.reduce((sum, l) => sum + Math.round(l.displayRateMinor * l.qty), 0);
  return {
    itemCount: cart.lines.reduce((sum, l) => sum + l.qty, 0),
    subtotalMinor: subtotal,
    estimatedTotalMinor: subtotal,
    totalsAreEstimates: cart.totalsAreEstimates,
  };
}

function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}
