/**
 * POS UI preview harness — explicitly identified DEMO MODE.
 *
 * Renders the real screens (Billing/Payment/Sync) with the real domain logic
 * (cart math, outbox states, receipt bytes) and a fixture service that never
 * touches a server. Used only for design QA and UI development; the production
 * entry point remains main.tsx inside the Tauri shell.
 */
import React from "react";
import "../index.css";
import ReactDOM from "react-dom/client";
import { PosContext, initialPosState, posReducer, type PosServices } from "./store";
import { Shell } from "./App";
import type { CatalogItem } from "@departmental/shared-types";

const fixtureItems: CatalogItem[] = [
  ["COLGATE-200", "Colgate Toothpaste 200g", 99, ["colgate"], "8901234000019"],
  ["RICE-BASMATI-5KG", "Basmati Rice 5kg", 450, ["rice", "chawal"], "8901234000026"],
  ["MILK-500ML", "Fresh Milk 500ml", 28, ["milk", "doodh"], "8901234000033"],
  ["BISCUIT-PARLE", "Parle-G Biscuit", 10, ["parle", "biscuit"], "8901234000040"],
  ["SHAMPOO-340", "Shampoo Bottle 340ml", 199, ["shampoo"], "8901234000057"],
].map(([code, name, rate, aliases, barcode]) => ({
  item_code: code as string,
  item_name: name as string,
  item_group: "Groceries",
  stock_uom: "Nos",
  is_stock_item: true,
  has_batch_no: false,
  aliases: aliases as string[],
  barcodes: [{ barcode: barcode as string, barcode_type: "EAN" }],
  price: { price_list_rate: rate as number },
  modified: "2026-10-26 00:00:00",
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fixture services: same interface, no server, clearly a demo. */
function makePreviewServices(): PosServices {
  return {
    searchCatalog: async (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return fixtureItems.filter(
        (i) => i.item_name.toLowerCase().includes(q) || i.item_code.toLowerCase().includes(q),
      );
    },
    itemByBarcode: async (barcode) =>
      fixtureItems.find((i) => i.barcodes.some((b) => b.barcode === barcode.trim())) ?? null,
    checkout: async (input) => {
      await wait(700); // simulate the local save + sync round trip
      const total = input.lines.reduce(
        (sum, l) => sum + Math.round(l.rate * 100) * l.qty, 0) / 100;
      const tendered = input.payments.reduce((s, p) => s + p.amount, 0);
      return {
        transactionId: `preview-${Date.now()}`,
        committed: true,
        invoiceName: `PREVIEW-SINV-${String(1 + Math.floor(Math.random() * 900)).padStart(4, "0")}`,
        changeAmount: Math.max(0, Math.round((tendered - total) * 100) / 100),
        error: null,
      };
    },
    syncNow: async () => undefined,
    refreshCounts: async () => ({ PENDING_SYNC: 0, REQUIRES_REVIEW: 0 }),
    listPending: async () => [],
    retryTransaction: async () => undefined,
    printReceipt: async () => true,
    resetCart: () => ({ lines: [], totalsAreEstimates: false }),
    lookupInvoice: async (invoiceName: string) => ({
      api_version: 1,
      invoice: { name: invoiceName || "PREVIEW-SINV-0001", customer: "Walk In Customer",
                 posting_date: "2026-10-26", status: "Paid" },
      lines: fixtureItems.map((i) => ({
        item_code: i.item_code, item_name: i.item_name, uom: i.stock_uom,
        sold_qty: 2, rate: i.price?.price_list_rate ?? 10,
        already_returned_qty: 0, returnable_qty: 2,
      })),
      payments: [{ mode_of_payment: "Cash", amount: 500 }],
    }),
    submitReturn: async (input) => {
      void input;
      await wait(700);
      return {
        transactionId: `preview-ret-${Date.now()}`,
        committed: true,
        creditNoteName: `PREVIEW-CN-${String(1 + Math.floor(Math.random() * 900)).padStart(4, "0")}`,
        error: null,
      };
    },
    openShift: async () => `preview-shift-${Date.now()}`,
    closeShift: async () => undefined,
    getCurrentShift: async () => null,
  };
}

export function PreviewApp() {
  const [state, dispatch] = React.useReducer(posReducer, undefined, initialPosState);
  const [services] = React.useState(() => makePreviewServices());
  React.useEffect(() => {
    dispatch({ type: "CATALOG_READY" });
    dispatch({ type: "SHOW_SCREEN", screen: "billing" });
  }, []);
  return (
    <>
      <div
        style={{
          background: "var(--warning-soft)", color: "var(--warning)",
          padding: "6px 16px", fontSize: 13, fontWeight: 700, textAlign: "center",
        }}
      >
        UI PREVIEW — fixture data, not connected to any ERP or store
      </div>
      <PosContext.Provider
        value={{ state: { ...state, counterName: "Counter 1", user: "preview-cashier" }, dispatch, services }}
      >
        <Shell state={{ ...state, counterName: "Counter 1", user: "preview-cashier" }} />
      </PosContext.Provider>
    </>
  );
}

export function mountPreview() {
  const el = document.getElementById("root");
  if (!el) return;
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <PreviewApp />
    </React.StrictMode>,
  );
}

// Mount only when serving preview.html (its #root is explicitly marked).
if (typeof document !== "undefined" &&
    document.getElementById("root")?.dataset.preview === "true") {
  mountPreview();
}
