// @vitest-environment jsdom
/**
 * UI component tests for the POS billing flow. Services are fakes — the domain
 * and transport layers have their own suites; these verify keyboard-first
 * behavior and visible states.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem, SyncRecord } from "@departmental/shared-types";
import { BillingScreen } from "./BillingScreen";
import { initialPosState, posReducer, PosContext, type PosServices } from "./store";

const item: CatalogItem = {
  item_code: "SKU-1",
  item_name: "Colgate Toothpaste 200g",
  stock_uom: "Nos",
  is_stock_item: true,
  has_batch_no: false,
  aliases: ["colgate"],
  barcodes: [{ barcode: "8900000000000" }],
  price: { price_list_rate: 99 },
  modified: "2026-10-26 00:00:00",
};

function fakeServices(overrides: Partial<PosServices> = {}): PosServices {
  return {
    searchCatalog: vi.fn(async () => [item]),
    itemByBarcode: vi.fn(async (barcode: string) =>
      barcode === "8900000000000" ? item : null),
    checkout: vi.fn(async () => ({ transactionId: "t1", committed: true,
                                   invoiceName: "SINV-0001", changeAmount: 0,
                                   error: null })),
    syncNow: vi.fn(async () => undefined),
    refreshCounts: vi.fn(async () => ({})),
    listPending: vi.fn(async (): Promise<SyncRecord[]> => []),
    retryTransaction: vi.fn(async () => undefined),
    printReceipt: vi.fn(async () => true),
    resetCart: () => ({ lines: [], totalsAreEstimates: false }),
    ...overrides,
  };
}

function renderBilling(services: PosServices, onCheckout = () => {}) {
  let state = initialPosState();
  const dispatch = (action: Parameters<typeof posReducer>[1]) => {
    state = posReducer(state, action);
    rerender();
  };
  const rerender = () => {
    render(
      <PosContext.Provider value={{ state, dispatch, services }}>
        <BillingScreen onCheckout={onCheckout} />
      </PosContext.Provider>,
      { container: document.body },
    );
  };
  rerender();
  return { getState: () => state, dispatch };
}

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BillingScreen", () => {
  it("renders the barcode input focused-capable and charge disabled when empty", () => {
    renderBilling(fakeServices());
    const input = screen.getByLabelText(/scan barcode or search products/i);
    expect(input).toBeTruthy();
    const charge = screen.getByRole("button", { name: /charge \(f2\)/i });
    expect((charge as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a scanned barcode to the cart and shows the line", async () => {
    renderBilling(fakeServices());
    const input = screen.getByLabelText(/scan barcode or search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8900000000000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText(/Colgate Toothpaste 200g/)).toBeTruthy();
    });
  });

  it("shows a visible error for an unknown barcode", async () => {
    renderBilling(fakeServices());
    const input = screen.getByLabelText(/scan barcode or search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999999999999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/no product for barcode/i);
    });
  });

  it("F8 removes the last cart line", async () => {
    renderBilling(fakeServices());
    const input = screen.getByLabelText(/scan barcode or search products/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8900000000000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText(/Colgate Toothpaste 200g/)).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() => {
      expect(screen.queryByText(/Colgate Toothpaste 200g/)).toBeNull();
    });
  });
});
