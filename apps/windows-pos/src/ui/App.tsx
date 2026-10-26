import { useEffect, useReducer, useState } from "react";
import { initialPosState, posReducer, PosContext, usePos, type PosState } from "./store";
import { BillingScreen } from "./BillingScreen";
import { PaymentScreen } from "./PaymentScreen";
import { SyncBadge, SyncScreen } from "./SyncScreen";
import { ReturnsScreen } from "./ReturnsScreen";
import { AppServices } from "./services";
import { FrappeClient } from "../transport/frappe";
import { PosStore } from "../local/repos";
import { TauriSqliteDriver } from "../local/tauri-driver";
import { createPrinter } from "../printing/printer";

export function App() {
  const [state, dispatch] = useReducer(posReducer, undefined, initialPosState);
  const [services, setServices] = useState<AppServices | null>(null);

  return (
    <PosContext.Provider value={{ state, dispatch, services }}>
      {state.screen === "login" ? (
        <LoginScreen onReady={setServices} />
      ) : (
        <Shell state={state} />
      )}
    </PosContext.Provider>
  );
}

export function Shell({ state }: { state: PosState }) {
  const { dispatch, services } = usePos();
  const [payOpen, setPayOpen] = useState(false);

  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    const tick = async () => {
      dispatch({ type: "SYNC_STATUS", busy: true, error: null });
      try {
        await services.syncNow();
        const counts = await services.refreshCounts();
        if (!cancelled) dispatch({ type: "SYNC_COUNTS", counts });
        dispatch({ type: "SYNC_STATUS", busy: false, error: null });
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: "SYNC_STATUS",
            busy: false,
            error: error instanceof Error ? error.message : "sync failed",
          });
        }
      }
    };
    const interval = setInterval(() => void tick(), 5000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [services, dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (payOpen) setPayOpen(false);
        else dispatch({ type: "SHOW_SCREEN", screen: "billing" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, payOpen]);

  if (!services) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Department Store POS</span>
        <button type="button" onClick={() => dispatch({ type: "SHOW_SCREEN", screen: "returns" })}>
          Returns (F7)
        </button>
        <span>{state.counterName}</span>
        <span>{state.user}</span>
        <SyncBadge />
        <button type="button" onClick={() => dispatch({ type: "LOGOUT" })}>
          Log out
        </button>
      </header>
      {state.screen === "billing" && <BillingScreen onCheckout={() => setPayOpen(true)} />}
      {state.screen === "returns" && (
        <ReturnsScreen onBack={() => dispatch({ type: "SHOW_SCREEN", screen: "billing" })} />
      )}
      {state.screen === "sync" && <SyncScreen />}
      {payOpen && <PaymentScreen onClose={() => setPayOpen(false)} />}
    </div>
  );
}

function LoginScreen({ onReady }: { onReady: (s: AppServices) => void }) {
  const { dispatch } = usePos();
  const [serverUrl, setServerUrl] = useState("http://localhost:8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("Counter 1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      // Device id is generated once and stored in the local DB.
      const driver = new TauriSqliteDriver();
      const store = new PosStore(driver);
      await store.migrate();
      const storedDevice = await getStoredDeviceId(store);
      const deviceIdFinal = storedDevice ?? crypto.randomUUID();
      if (!storedDevice) await storeDeviceId(store, deviceIdFinal);

      const client = new FrappeClient({ baseUrl: serverUrl.trim() });
      await client.login(username.trim(), password);
      await client.registerDevice(deviceIdFinal, deviceName.trim() || undefined);

      dispatch({
        type: "CATALOG_PROGRESS",
        message: "Downloading catalog…",
      });
      const snapshot = await client.catalogSnapshot();
      await store.applyCatalogSnapshot(snapshot, Date.now());
      await client.recordSync(deviceIdFinal, snapshot.checkpoint);
      dispatch({ type: "CATALOG_READY" });
      dispatch({
        type: "LOGIN",
        user: username.trim(),
        deviceId: deviceIdFinal,
        counterName: deviceName.trim() || deviceIdFinal.slice(0, 8),
        serverUrl: serverUrl.trim(),
      });
      onReady(
        new AppServices(client, store, createPrinter(), {
          deviceId: deviceIdFinal,
          counterName: deviceName.trim(),
          cashier: username.trim(),
          storeName: "Department Store",
          serverUrl: serverUrl.trim(),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
      >
        <h1>Department Store POS</h1>
        <p className="lead">Sign in with your ERP account. Billing works offline; bills sync automatically.</p>
        <label>
          Server
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
        </label>
        <label>
          Username
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          Counter name
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <button type="submit" className="pay-button" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint">
          Offline: catalog and billing keep working; bills queue and sync automatically.
        </p>
      </form>
    </div>
  );
}

async function getStoredDeviceId(store: PosStore): Promise<string | null> {
  const meta = await store.db.select<{ value: string }>(
    `SELECT value FROM schema_meta WHERE key = 'device_id'`,
  );
  return meta[0]?.value ?? null;
}

export async function storeDeviceId(store: PosStore, deviceId: string): Promise<void> {
  await store.db.exec(
    `INSERT INTO schema_meta (key, value) VALUES ('device_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [deviceId],
  );
}
