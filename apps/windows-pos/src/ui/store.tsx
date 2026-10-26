/**
 * Global POS application store.
 *
 * Wires domain modules (cart, outbox, sync engine) to React state. The store
 * never computes authoritative amounts — the server does — and never marks a
 * sale committed except from a server response.
 */
import { createContext, useContext } from "react";
import type { CatalogItem, SyncRecord } from "@departmental/shared-types";
import type { Cart } from "../domain/cart";
import type { ReceiptData } from "../domain/receipt";

export type Screen = "login" | "billing" | "sync";

export interface PosState {
  screen: Screen;
  user: string | null;
  deviceId: string | null;
  counterName: string | null;
  serverUrl: string | null;
  catalogReady: boolean;
  catalogProgress: string | null;
  cart: Cart;
  lastReceipt: ReceiptData | null;
  syncError: string | null;
  syncBusy: boolean;
  counts: Record<string, number>;
  pendingRecords: SyncRecord[];
}

export type PosAction =
  | { type: "LOGIN"; user: string; deviceId: string; counterName: string; serverUrl: string }
  | { type: "LOGOUT" }
  | { type: "CATALOG_PROGRESS"; message: string }
  | { type: "CATALOG_READY" }
  | { type: "SET_CART"; cart: Cart }
  | { type: "SET_RECEIPT"; receipt: ReceiptData | null }
  | { type: "SYNC_STATUS"; busy: boolean; error: string | null }
  | { type: "SYNC_COUNTS"; counts: Record<string, number> }
  | { type: "PENDING_RECORDS"; records: SyncRecord[] }
  | { type: "SHOW_SCREEN"; screen: Screen };

export function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "LOGIN":
      return {
        ...state,
        screen: "billing",
        user: action.user,
        deviceId: action.deviceId,
        counterName: action.counterName,
        serverUrl: action.serverUrl,
      };
    case "LOGOUT":
      return { ...initialPosState(), serverUrl: state.serverUrl };
    case "CATALOG_PROGRESS":
      return { ...state, catalogProgress: action.message };
    case "CATALOG_READY":
      return { ...state, catalogReady: true, catalogProgress: null };
    case "SET_CART":
      return { ...state, cart: action.cart };
    case "SET_RECEIPT":
      return { ...state, lastReceipt: action.receipt };
    case "SYNC_STATUS":
      return { ...state, syncBusy: action.busy, syncError: action.error };
    case "SYNC_COUNTS":
      return { ...state, counts: action.counts };
    case "PENDING_RECORDS":
      return { ...state, pendingRecords: action.records };
    case "SHOW_SCREEN":
      return { ...state, screen: action.screen };
  }
}

export function initialPosState(): PosState {
  return {
    screen: "login",
    user: null,
    deviceId: null,
    counterName: null,
    serverUrl: null,
    catalogReady: false,
    catalogProgress: null,
    cart: { lines: [], totalsAreEstimates: false },
    lastReceipt: null,
    syncError: null,
    syncBusy: false,
    counts: {},
    pendingRecords: [],
  };
}

export interface PosServices {
  searchCatalog(query: string): Promise<CatalogItem[]>;
  itemByBarcode(barcode: string): Promise<CatalogItem | null>;
  checkout(payload: {
    lines: { item_code: string; qty: number; rate: number; uom: string }[];
    payments: { mode_of_payment: string; amount: number; reference_no?: string }[];
    totalsEstimate: number;
  }): Promise<{ transactionId: string; committed: boolean; invoiceName: string | null; changeAmount: number; error: string | null }>;
  syncNow(): Promise<void>;
  refreshCounts(): Promise<Record<string, number>>;
  listPending(): Promise<SyncRecord[]>;
  retryTransaction(transactionId: string): Promise<void>;
  printReceipt(data: ReceiptData, duplicate: boolean): Promise<boolean>;
  resetCart(): Cart;
}

export const PosContext = createContext<{
  state: PosState;
  dispatch: React.Dispatch<PosAction>;
  /** Null until the cashier completes login (services are created there). */
  services: PosServices | null;
} | null>(null);

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosContext");
  return ctx;
}

/** For screens that require wired services (rendered only inside the shell). */
export function useServices(): PosServices {
  const { services } = usePos();
  if (!services) throw new Error("services not ready");
  return services;
}
