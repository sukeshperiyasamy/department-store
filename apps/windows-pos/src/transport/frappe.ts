/**
 * Frappe REST transport for the POS.
 *
 * - Every response is validated with the shared zod schemas (untrusted input rule).
 * - Timeouts are surfaced as TransportError("timeout") so the sync engine can run
 *   lost-response recovery instead of blindly retrying.
 * - Auth: session cookie login (desktop webview keeps the cookie jar) or API
 *   token headers configured per device.
 */
import {
  CatalogSnapshotSchema,
  DeviceRegistrationSchema,
  DeviceStatusSchema,
  SaleResponseSchema,
  type CatalogSnapshot,
  type ReturnPayload,
  type SalePayload,
  type SaleResponse,
  type SyncRecord,
} from "@departmental/shared-types";
import { z, type ZodType, type ZodTypeDef } from "zod";
import { TransportError } from "../domain/sync-engine";

/** Original-invoice lookup for the returns flow (server-validated shape). */
const OriginalInvoiceSchema = z.object({
  api_version: z.literal(1),
  invoice: z.object({
    name: z.string(),
    customer: z.string().nullable().optional(),
    posting_date: z.string(),
    status: z.string(),
  }),
  lines: z.array(z.object({
    item_code: z.string(),
    item_name: z.string(),
    uom: z.string(),
    sold_qty: z.number(),
    rate: z.number(),
    already_returned_qty: z.number(),
    returnable_qty: z.number(),
  })),
  payments: z.array(z.object({
    mode_of_payment: z.string(),
    amount: z.number(),
  })),
});
export type OriginalInvoice = z.infer<typeof OriginalInvoiceSchema>;

export interface FrappeClientConfig {
  baseUrl: string;
  /** "Authorization: token <key>:<secret>" when provided; else session cookies. */
  apiToken?: { key: string; secret: string };
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Inside the Tauri shell, use the native HTTP plugin (no CORS restrictions,
 * real cookie jar); in plain browsers use the standard fetch. */
function defaultFetch(): typeof fetch {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // Dynamic to keep the browser bundle clean; plugin-http fetch mirrors spec.
    return ((...args: Parameters<typeof fetch>) =>
      import("@tauri-apps/plugin-http").then(
        (m) => m.fetch(...(args as [string, RequestInit?])),
      )) as unknown as typeof fetch;
  }
  return fetch.bind(globalThis);
}

/** For methods whose result shape is not part of the v1 contract (e.g. logout). */
const passthroughSchema: ZodType<unknown> = z.unknown();

export class FrappeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: FrappeClientConfig) {
    this.fetchImpl = cfg.fetchImpl ?? defaultFetch();
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({ usr: username, pwd: password });
    const response = await this.fetchImpl(`${this.cfg.baseUrl}/api/method/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      credentials: "include",
    });
    if (response.status === 401 || response.status === 403) {
      throw new TransportError("auth", response.status, "invalid username or password");
    }
    if (!response.ok) {
      throw new TransportError("server", response.status, `login failed: ${response.status}`);
    }
  }

  async logout(): Promise<void> {
    await this.call("logout", {}, passthroughSchema);
  }

  async submitSale(payload: SalePayload): Promise<SaleResponse> {
    // payload is JSON-encoded explicitly so the Frappe method receives the object.
    return this.call(
      "departmental_store.api.sales.submit_pos_sale",
      { payload: JSON.stringify(payload) },
      SaleResponseSchema,
    );
  }

  async submitReturn(payload: ReturnPayload): Promise<SaleResponse> {
    return this.call(
      "departmental_store.api.returns.submit_pos_return",
      { payload: JSON.stringify(payload) },
      SaleResponseSchema,
    );
  }

  /** Submits a sync record by kind — the single entry the sync engine uses. */
  async submit(record: SyncRecord): Promise<SaleResponse> {
    if (record.kind === "return") {
      return this.submitReturn(record.payload as ReturnPayload);
    }
    return this.submitSale(record.payload as SalePayload);
  }

  async getDevice(deviceId: string) {
    return this.call(
      "departmental_store.api.devices.get_device",
      { device_id: deviceId },
      DeviceStatusSchema,
    );
  }

  async getOriginalInvoice(invoiceName: string): Promise<OriginalInvoice> {
    return this.call(
      "departmental_store.api.returns.get_original_invoice",
      { invoice_name: invoiceName },
      OriginalInvoiceSchema,
    );
  }

  async checkTransaction(transactionId: string): Promise<SaleResponse> {
    return this.call(
      "departmental_store.api.sales.check_transaction",
      { transaction_id: transactionId },
      SaleResponseSchema,
    );
  }

  async catalogSnapshot(since?: string): Promise<CatalogSnapshot> {
    const args: Record<string, unknown> = {};
    if (since) args.since = since;
    return this.call(
      "departmental_store.api.catalog.catalog_snapshot",
      args,
      CatalogSnapshotSchema,
    );
  }

  async registerDevice(deviceId: string, counterName?: string): Promise<unknown> {
    return this.call(
      "departmental_store.api.devices.register_device",
      { device_id: deviceId, counter_name: counterName },
      DeviceRegistrationSchema,
    );
  }

  async recordSync(deviceId: string, checkpoint: string): Promise<void> {
    await this.call(
      "departmental_store.api.devices.record_sync",
      { device_id: deviceId, checkpoint },
      passthroughSchema,
    );
  }

  private async call<T>(
    method: string,
    args: Record<string, unknown>,
    schema: ZodType<T, ZodTypeDef, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.cfg.baseUrl}/api/method/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.cfg.apiToken
            ? {
                Authorization: `token ${this.cfg.apiToken.key}:${this.cfg.apiToken.secret}`,
              }
            : {}),
        },
        body: JSON.stringify(args),
        credentials: "include",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TransportError("timeout", undefined, `request to ${method} timed out`);
      }
      throw new TransportError("network", undefined, `network error calling ${method}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new TransportError("auth", response.status, `not authorized for ${method}`);
    }
    if (!response.ok) {
      // Frappe wraps server exceptions in {"exc": "...", "_server_messages": ...}
      let detail = `${response.status}`;
      try {
        const body = (await response.json()) as { exc?: string; _server_messages?: string };
        if (body._server_messages) detail = extractServerMessages(body._server_messages);
        else if (body.exc) detail = body.exc.split("\n").pop() ?? detail;
      } catch {
        // keep status-code detail
      }
      throw new TransportError("server", response.status, `server error on ${method}: ${detail}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new TransportError("server", response.status, `invalid JSON from ${method}`);
    }
    const message = (json as { message?: unknown }).message ?? json;
    const parsed = schema.safeParse(message);
    if (!parsed.success) {
      throw new TransportError(
        "server",
        response.status,
        `response from ${method} failed contract validation: ${parsed.error.message.slice(0, 300)}`,
      );
    }
    return parsed.data;
  }
}

function extractServerMessages(raw: string): string {
  try {
    const messages = JSON.parse(raw) as string[];
    return messages
      .map((m) => {
        try {
          return (JSON.parse(m) as { message?: string }).message ?? m;
        } catch {
          return m;
        }
      })
      .join("; ");
  } catch {
    return raw.slice(0, 200);
  }
}
