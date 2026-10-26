import { afterEach, describe, expect, it, vi } from "vitest";
import { FrappeClient } from "./frappe";
import { TransportError } from "../domain/sync-engine";

const committedBody = {
  message: {
    api_version: 1,
    status: "SERVER_COMMITTED",
    transaction_id: "t1",
    invoice: {
      doctype: "Sales Invoice",
      name: "SINV-0001",
      posting_date: "2026-10-26",
      net_total: 20,
      total_taxes_and_charges: 0,
      grand_total: 20,
      rounding_adjustment: 0,
      change_amount: 0,
      currency: "INR",
    },
    error: null,
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function clientWith(responder: () => Promise<Response>, timeoutMs = 1000): FrappeClient {
  return new FrappeClient({
    baseUrl: "http://erp.local",
    fetchImpl: vi.fn(responder) as unknown as typeof fetch,
    timeoutMs,
  });
}

const validPayload = {
  api_version: 1 as const,
  transaction_id: "t1",
  device_id: "counter-1",
  lines: [{ line_id: "l1", item_code: "SKU1", qty: 2 }],
  payments: [{ mode_of_payment: "Cash", amount: 20 }],
};

describe("FrappeClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses and validates a committed response", async () => {
    const client = clientWith(async () => jsonResponse(200, committedBody));
    const result = await client.submitSale(validPayload);
    expect(result.status).toBe("SERVER_COMMITTED");
    expect(result.invoice?.name).toBe("SINV-0001");
  });

  it("JSON-encodes the payload argument for the Frappe method", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, committedBody));
    const client = new FrappeClient({
      baseUrl: "http://erp.local",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.submitSale(validPayload);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("submit_pos_sale");
    const body = JSON.parse(String(init?.body));
    // The server receives payload as a JSON string (frappe kwarg), not nested object.
    expect(typeof body.payload).toBe("string");
    expect(JSON.parse(body.payload).transaction_id).toBe("t1");
  });

  it("rejects responses violating the contract", async () => {
    const client = clientWith(async () =>
      jsonResponse(200, {
        message: { api_version: 1, status: "SERVER_COMMITTED", invoice: null, error: null,
                   transaction_id: 12345 }, // wrong type
      }),
    );
    await expect(client.submitSale(validPayload)).rejects.toThrow(/contract validation/);
  });

  it("maps 401/403 to auth errors", async () => {
    const client = clientWith(async () => jsonResponse(403, { message: "no" }));
    await expect(client.submitSale(validPayload)).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps server errors with _server_messages to readable failures", async () => {
    const client = clientWith(async () =>
      jsonResponse(500, {
        exc: "Traceback...",
        _server_messages: JSON.stringify([
          JSON.stringify({ message: "Stock quantity not available for SKU1" }),
        ]),
      }),
    );
    const error = await client.submitSale(validPayload).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.kind).toBe("server");
    expect(error.message).toContain("Stock quantity not available");
  });

  it("surfaces aborts as timeout errors for lost-response recovery", async () => {
    const client = clientWith(async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    });
    const error = await client.submitSale(validPayload).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.kind).toBe("timeout");
  });

  it("maps fetch rejections to network errors", async () => {
    const client = clientWith(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await client.submitSale(validPayload).catch((e) => e);
    expect(error.kind).toBe("network");
  });

  it("validates catalog snapshots", async () => {
    const client = clientWith(async () =>
      jsonResponse(200, {
        message: {
          api_version: 1,
          generated_at: "2026-10-26T10:00:00Z",
          checkpoint: "cp",
          price_list: "Standard Selling",
          items: "not-an-array",
        },
      }),
    );
    await expect(client.catalogSnapshot()).rejects.toThrow(/contract validation/);
  });

  it("sends the API token when configured", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, committedBody));
    const client = new FrappeClient({
      baseUrl: "http://erp.local",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiToken: { key: "k", secret: "s" },
    });
    await client.submitSale(validPayload);
    const headers = (fetchImpl.mock.calls[0]![1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("token k:s");
  });

  it("reports failed logins as auth errors", async () => {
    const client = clientWith(async () => jsonResponse(401, { message: "bad" }));
    await expect(client.login("u", "p")).rejects.toMatchObject({ kind: "auth" });
  });
});
