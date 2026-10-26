import { describe, expect, it } from "vitest";
import {
  CatalogSnapshotSchema,
  SalePayloadSchema,
  SaleResponseSchema,
  SyncRecordSchema,
  TransactionState,
} from "./index";

const validPayload = {
  api_version: 1,
  transaction_id: "11111111-1111-4111-8111-111111111111",
  device_id: "counter-1",
  lines: [{ line_id: "l1", item_code: "SKU-1", qty: 2 }],
  payments: [{ mode_of_payment: "Cash", amount: 25 }],
};

describe("SalePayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(SalePayloadSchema.parse(validPayload)).toBeTruthy();
  });

  it("rejects empty lines and payments", () => {
    expect(() =>
      SalePayloadSchema.parse({ ...validPayload, lines: [] }),
    ).toThrow();
    expect(() =>
      SalePayloadSchema.parse({ ...validPayload, payments: [] }),
    ).toThrow();
  });

  it("rejects wrong api_version", () => {
    expect(() =>
      SalePayloadSchema.parse({ ...validPayload, api_version: 2 }),
    ).toThrow();
  });

  it("rejects non-positive quantity", () => {
    expect(() =>
      SalePayloadSchema.parse({
        ...validPayload,
        lines: [{ line_id: "l1", item_code: "SKU-1", qty: 0 }],
      }),
    ).toThrow();
  });

  it("rejects unknown extra fields (strict)", () => {
    expect(() =>
      SalePayloadSchema.parse({ ...validPayload, hacky_field: true }),
    ).toThrow();
  });
});

describe("SaleResponseSchema", () => {
  it("accepts a committed response", () => {
    const response = {
      api_version: 1,
      status: "SERVER_COMMITTED",
      transaction_id: validPayload.transaction_id,
      invoice: {
        doctype: "POS Invoice",
        name: "POS-INV-0001",
        posting_date: "2026-10-26",
        net_total: 20,
        total_taxes_and_charges: 0,
        grand_total: 20,
        rounding_adjustment: 0,
        change_amount: 0,
        currency: "INR",
      },
      error: null,
    };
    expect(SaleResponseSchema.parse(response)).toBeTruthy();
  });

  it("accepts a review response with a known error code", () => {
    const response = {
      api_version: 1,
      status: "REQUIRES_REVIEW",
      transaction_id: validPayload.transaction_id,
      invoice: null,
      error: { code: "ITEM_NOT_FOUND", message: "not found" },
    };
    expect(SaleResponseSchema.parse(response)).toBeTruthy();
  });

  it("rejects unknown error codes", () => {
    const response = {
      api_version: 1,
      status: "REQUIRES_REVIEW",
      invoice: null,
      error: { code: "MADE_UP_CODE", message: "x" },
    };
    expect(() => SaleResponseSchema.parse(response)).toThrow();
  });
});

describe("CatalogSnapshotSchema", () => {
  it("accepts a minimal snapshot", () => {
    const snapshot = {
      api_version: 1,
      generated_at: "2026-10-26T10:00:00Z",
      checkpoint: "2026-10-26 10:00:00.000000",
      price_list: "Standard Selling",
      items: [
        {
          item_code: "SKU-1",
          item_name: "Colgate",
          stock_uom: "Nos",
          is_stock_item: true,
          has_batch_no: false,
          aliases: ["colgate"],
          barcodes: [{ barcode: "8901234567890" }],
          price: { price_list_rate: 55 },
          modified: "2026-10-26 10:00:00.000000",
        },
      ],
    };
    expect(CatalogSnapshotSchema.parse(snapshot)).toBeTruthy();
  });
});

describe("SyncRecordSchema", () => {
  it("defaults attempts and receipt_printed", () => {
    const record = SyncRecordSchema.parse({
      transaction_id: "t1",
      state: TransactionState.PendingSync,
      payload: validPayload,
      created_at: "2026-10-26T10:00:00Z",
      updated_at: "2026-10-26T10:00:00Z",
    });
    expect(record.attempts).toBe(0);
    expect(record.receipt_printed).toBe(false);
  });
});
