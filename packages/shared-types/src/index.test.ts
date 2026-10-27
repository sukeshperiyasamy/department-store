import { describe, expect, it } from "vitest";
import {
  CatalogSnapshotSchema,
  SalePayloadSchema,
  SaleResponseSchema,
  SetFlagResultSchema,
  StoreProfileSchema,
  StoreSettingsSchema,
  SupportRequestPayloadSchema,
  SupportRequestResultSchema,
  SupportTicketCategory,
  SupportTicketPriority,
  SyncRecordSchema,
  TransactionState,
  UpdateStoreProfilePayloadSchema,
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

describe("StoreSettingsSchema", () => {
  it("accepts a valid store settings payload", () => {
    const raw = {
      api_version: 1,
      flags: {
        voice_assistant_enabled: false,
        voice_hold_shortcut_enabled: false,
        ai_provider_enabled: false,
        mcp_adapter_enabled: false,
        camera_product_capture_enabled: false,
        batch_expiry_enabled: true,
        expiry_notifications_enabled: true,
        regional_catalog_enabled: true,
        receipt_printing_enabled: true,
        barcode_label_printing_enabled: true,
      },
      expiry_warning_days: "7,30,60",
    };
    const parsed = StoreSettingsSchema.parse(raw);
    expect(parsed.api_version).toBe(1);
    expect(parsed.flags.regional_catalog_enabled).toBe(true);
    expect(parsed.expiry_warning_days).toBe("7,30,60");
  });

  it("defaults expiry_warning_days when omitted", () => {
    const raw = {
      api_version: 1,
      flags: {
        voice_assistant_enabled: false,
        voice_hold_shortcut_enabled: false,
        ai_provider_enabled: false,
        mcp_adapter_enabled: false,
        camera_product_capture_enabled: false,
        batch_expiry_enabled: true,
        expiry_notifications_enabled: true,
        regional_catalog_enabled: true,
        receipt_printing_enabled: true,
        barcode_label_printing_enabled: true,
      },
    };
    const parsed = StoreSettingsSchema.parse(raw);
    expect(parsed.expiry_warning_days).toBe("7,30,60");
  });

  it("rejects wrong api_version", () => {
    expect(() =>
      StoreSettingsSchema.parse({
        api_version: 2,
        flags: {
          voice_assistant_enabled: false,
          voice_hold_shortcut_enabled: false,
          ai_provider_enabled: false,
          mcp_adapter_enabled: false,
          camera_product_capture_enabled: false,
          batch_expiry_enabled: true,
          expiry_notifications_enabled: true,
          regional_catalog_enabled: true,
          receipt_printing_enabled: true,
          barcode_label_printing_enabled: true,
        },
      }),
    ).toThrow();
  });
});

describe("SetFlagResultSchema", () => {
  it("validates a set flag response", () => {
    const raw = {
      api_version: 1,
      flag: "voice_assistant_enabled",
      value: true,
    };
    const parsed = SetFlagResultSchema.parse(raw);
    expect(parsed.flag).toBe("voice_assistant_enabled");
    expect(parsed.value).toBe(true);
  });
});

describe("StoreProfileSchema", () => {
  it("accepts a valid store profile with defaults", () => {
    const raw = {
      store_name: "Sri Murugan Departmental Store",
      store_phone: "9876543210",
      store_address: "12 Gandhi Bazaar, Erode, TN 638001",
      receipt_header: "Welcome to Sri Murugan Store!",
      receipt_footer: "Thank you for shopping with us! Visit again.",
      business_hours: "08:00 AM - 10:00 PM",
      tax_number: "33AAAAA0000A1Z5",
    };
    const parsed = StoreProfileSchema.parse(raw);
    expect(parsed.store_name).toBe("Sri Murugan Departmental Store");
    expect(parsed.currency_symbol).toBe("₹");
    expect(parsed.date_format).toBe("DD-MM-YYYY");
  });

  it("accepts partial updates via UpdateStoreProfilePayloadSchema", () => {
    const raw = {
      receipt_header: "Grand Diwali Sale!",
    };
    const parsed = UpdateStoreProfilePayloadSchema.parse(raw);
    expect(parsed.receipt_header).toBe("Grand Diwali Sale!");
    expect(parsed.store_name).toBeUndefined();
  });
});

describe("SupportRequestPayloadSchema and SupportRequestResultSchema", () => {
  it("accepts a valid support request with diagnostics", () => {
    const raw = {
      category: SupportTicketCategory.Values.POS_SYNC,
      subject: "Counter 2 offline sync delayed",
      description: "Counter 2 has 3 pending offline sales that have not synced for 10 minutes.",
      priority: SupportTicketPriority.Values.HIGH,
      diagnostics: {
        counter_id: "counter-2",
        pending_outbox_count: 3,
        network_status: "online",
      },
    };
    const parsed = SupportRequestPayloadSchema.parse(raw);
    expect(parsed.category).toBe("POS_SYNC");
    expect(parsed.priority).toBe("HIGH");
    expect(parsed.diagnostics?.counter_id).toBe("counter-2");
  });

  it("rejects support request with too short description", () => {
    const raw = {
      category: SupportTicketCategory.Values.BILLING,
      subject: "Help",
      description: "Too short",
    };
    expect(() => SupportRequestPayloadSchema.parse(raw)).toThrow();
  });

  it("validates a support ticket creation result", () => {
    const raw = {
      api_version: 1,
      ticket_id: "TKT-20261027-001",
      status: "RECEIVED" as const,
      category: "POS_SYNC",
      priority: "HIGH",
      created_at: "2026-10-27T08:00:00Z",
      estimated_response_hours: 4,
    };
    const parsed = SupportRequestResultSchema.parse(raw);
    expect(parsed.ticket_id).toBe("TKT-20261027-001");
    expect(parsed.status).toBe("RECEIVED");
    expect(parsed.estimated_response_hours).toBe(4);
  });
});
