import { useCallback, useEffect, useRef, useState } from "react";
import { usePos, useServices } from "./store";
import type { CatalogItem } from "@departmental/shared-types";
import { addItem, displayTotals, removeLine, setQty } from "../domain/cart";
import { formatMoney, serverAmountToMoney } from "../domain/money";

/**
 * Billing screen: barcode-first, keyboard-first.
 * Shortcuts: F2 checkout, F4 focus search, F8 remove last line, Esc clear search.
 */
export function BillingScreen({ onCheckout }: { onCheckout: () => void }) {
  const { state, dispatch } = usePos();
  const services = useServices();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastKeyTime = useRef(0);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const items = await services.searchCatalog(q);
      setResults(items.slice(0, 12));
    },
    [services],
  );

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), 120);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const addByBarcode = useCallback(
    async (barcode: string) => {
      setError(null);
      const item = await services.itemByBarcode(barcode.trim());
      if (!item) {
        setError(`No product for barcode ${barcode.trim()}`);
        return;
      }
      if (!item.price) {
        setError(`${item.item_name} has no selling price configured`);
        return;
      }
      dispatch({
        type: "SET_CART",
        cart: addItem(state.cart, item, 1, () => Date.now()),
      });
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
    },
    [dispatch, services, state.cart],
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const isScannerBurst = now - lastKeyTime.current < 60;
    lastKeyTime.current = now;
    if (e.key === "Enter") {
      e.preventDefault();
      const text = query.trim();
      // Heuristic: long numeric input without spaces is a barcode (HID scanner).
      if (/^[0-9A-Za-z\-]{6,}$/.test(text) && (isScannerBurst || /^[0-9]+$/.test(text))) {
        void addByBarcode(text);
      } else if (results.length === 1) {
        const item = results[0]!;
        if (item.price) {
          dispatch({ type: "SET_CART", cart: addItem(state.cart, item, 1, () => Date.now()) });
          setQuery("");
          setResults([]);
        }
      } else if (results.length === 0) {
        void addByBarcode(text);
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setResults([]);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (state.cart.lines.length > 0) onCheckout();
      } else if (e.key === "F4") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F8") {
        e.preventDefault();
        const last = state.cart.lines[state.cart.lines.length - 1];
        if (last) dispatch({ type: "SET_CART", cart: removeLine(state.cart, last.lineId) });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.cart, dispatch, onCheckout]);

  const totals = displayTotals(state.cart);

  return (
    <div className="billing">
      <aside className="search-pane">
        <input
          ref={searchRef}
          className="barcode-input"
          placeholder="Scan barcode or search product…  (F4)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          aria-label="Scan barcode or search products"
        />
        {error && (
          <div role="alert" className="error-banner">
            {error}
          </div>
        )}
        <ul className="results" aria-label="Search results">
          {results.map((item) => (
            <li key={item.item_code}>
              <button
                type="button"
                className="result-row"
                onClick={() => {
                  if (!item.price) {
                    setError(`${item.item_name} has no selling price configured`);
                    return;
                  }
                  dispatch({
                    type: "SET_CART",
                    cart: addItem(state.cart, item, 1, () => Date.now()),
                  });
                  setQuery("");
                  setResults([]);
                  searchRef.current?.focus();
                }}
              >
                <span className="result-name">{item.item_name}</span>
                <span className="result-price">
                  {item.price ? formatMoney(serverAmountToMoney(item.price.price_list_rate, "INR")) : "no price"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="cart-pane" aria-label="Current bill">
        <table className="cart-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.cart.lines.map((line) => (
              <tr key={line.lineId}>
                <td>{line.itemName}</td>
                <td>
                  <input
                    className="qty-input"
                    type="number"
                    min={0}
                    step={0.001}
                    value={line.qty}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_CART",
                        cart: setQty(state.cart, line.lineId, Number(e.target.value)),
                      })
                    }
                    aria-label={`Quantity for ${line.itemName}`}
                  />
                </td>
                <td>{formatMoney({ minor: line.displayRateMinor, currency: "INR" })}</td>
                <td>{formatMoney({ minor: Math.round(line.displayRateMinor * line.qty), currency: "INR" })}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "SET_CART", cart: removeLine(state.cart, line.lineId) })}
                    aria-label={`Remove ${line.itemName}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals-bar">
          <div className="totals-main">
            <span>
              {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
            </span>
            <span className="grand-total">
              {formatMoney({ minor: totals.estimatedTotalMinor, currency: "INR" })}
            </span>
          </div>
          <div className="totals-note">
            {state.cart.totalsAreEstimates
              ? "Offline estimate — final total is set by the server on sync"
              : "Prices from server catalog"}
          </div>
          <button
            type="button"
            className="pay-button"
            disabled={state.cart.lines.length === 0}
            onClick={onCheckout}
          >
            Charge (F2)
          </button>
        </div>
      </section>
    </div>
  );
}
