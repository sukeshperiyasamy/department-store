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
  SaleResponseSchema,
  type CatalogSnapshot,
  type SalePayload,
  type SaleResponse,
} from "@departmental/shared-types";
import { TransportError } from "../domain/sync-engine";

export interface FrappeClientConfig {
  baseUrl: string;
  /** "Authorization: token <key>:<secret>" when provided; else session cookies. */
  apiToken?: { key: string; secret: string };
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class FrappeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: FrappeClientConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch.bind(globalThis);
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
    await this.call("logout", {});
  }

  async submitSale(payload: SalePayload): Promise<SaleResponse> {
    // payload is JSON-encoded explicitly so the Frappe method receives the object.
    return this.call(
      "departmental_store.api.sales.submit_pos_sale",
      { payload: JSON.stringify(payload) },
      SaleResponseSchema,
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
    await this.call("departmental_store.api.devices.record_sync", {
      device_id: deviceId,
      checkpoint,
    });
  }

  private async call<T>(
    method: string,
    args: Record<string, unknown>,
    schema: { parse(data: unknown): T },
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
