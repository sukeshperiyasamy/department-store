/**
 * API contracts for the departmental store platform (API v1).
 *
 * These schemas are the single source of truth shared by the Windows POS, the
 * owner dashboard, and mirrored by the Frappe app (departmental_store.api).
 * All responses crossing a trust boundary must be validated with these schemas.
 *
 * Contract documentation: docs/api-contracts.md
 */
import { z } from "zod";

export const API_VERSION = 1;

/** All API v1 envelopes carry exactly this version; clients must refuse others. */
export const API_VERSION_SCHEMA = z.literal(API_VERSION);

/** Server verdict states for a submitted counter transaction. */
export const ServerSaleStatus = {
  ServerCommitted: "SERVER_COMMITTED",
  RequiresReview: "REQUIRES_REVIEW",
  Processing: "PROCESSING",
  Unknown: "UNKNOWN",
} as const;

export const SaleErrorCode = z.enum([
  "ITEM_NOT_FOUND",
  "ITEM_DISABLED",
  "PRICE_MISSING",
  "BATCH_INVALID",
  "PAYMENT_SHORTFALL",
  "RATE_OVERRIDE_DENIED",
  "REQUIRES_POS_PROFILE",
  "VALIDATION_FAILED",
  "DEVICE_UNKNOWN",
  "DEVICE_DISABLED",
  "INVOICE_POSTING_FAILED",
]);
export type SaleErrorCode = z.infer<typeof SaleErrorCode>;

export const SaleLineSchema = z
  .object({
    line_id: z.string().min(1).max(100),
    item_code: z.string().min(1).max(140),
    qty: z.number().positive(),
    /** Display-only client rate. The server re-prices from the price list unless
     * an authorized override is requested (see allow_rate_override). */
    rate: z.number().nonnegative().optional(),
    uom: z.string().optional(),
    discount_percent: z.number().min(0).max(100).optional(),
    batch_no: z.string().optional(),
    serial_nos: z.array(z.string()).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type SaleLine = z.infer<typeof SaleLineSchema>;

export const SalePaymentSchema = z
  .object({
    mode_of_payment: z.string().min(1).max(140),
    amount: z.number().nonnegative(),
    /** UPI reference or card auth code. A typed reference is NOT proof of
     * settlement — see docs/architecture-decisions.md ADR-0006. */
    reference_no: z.string().max(140).optional(),
    reference_date: z.string().optional(),
  })
  .strict();
export type SalePayment = z.infer<typeof SalePaymentSchema>;

export const SalePayloadSchema = z
  .object({
    api_version: z.literal(API_VERSION),
    transaction_id: z.string().min(1).max(100),
    device_id: z.string().min(1).max(100),
    counter_name: z.string().max(140).optional(),
    /** ISO 8601 timestamp from the counter clock; bounded skew is enforced server-side. */
    occurred_at: z.string().optional(),
    cashier: z.string().optional(),
    customer: z.string().optional(),
    pos_profile: z.string().optional(),
    lines: z.array(SaleLineSchema).min(1).max(500),
    payments: z.array(SalePaymentSchema).min(1),
    totals: z
      .object({
        grand_total: z.number().nonnegative(),
      })
      .optional(),
  })
  .strict();
export type SalePayload = z.infer<typeof SalePayloadSchema>;

export const InvoiceResultSchema = z
  .object({
    doctype: z.string(),
    name: z.string(),
    customer: z.string().nullable().optional(),
    posting_date: z.string(),
    net_total: z.number(),
    total_taxes_and_charges: z.number(),
    grand_total: z.number(),
    rounding_adjustment: z.number(),
    change_amount: z.number(),
    currency: z.string(),
  })
  .partial({ customer: true });
export type InvoiceResult = z.infer<typeof InvoiceResultSchema>;

export const SaleErrorSchema = z.object({
  code: SaleErrorCode,
  message: z.string(),
});
export type SaleError = z.infer<typeof SaleErrorSchema>;

export const SaleResponseSchema = z.object({
  api_version: API_VERSION_SCHEMA,
  status: z.enum(["SERVER_COMMITTED", "REQUIRES_REVIEW", "PROCESSING", "UNKNOWN"]),
  duplicate: z.boolean().optional(),
  stale: z.boolean().optional(),
  message: z.string().optional(),
  transaction_id: z.string().nullable().optional(),
  invoice: InvoiceResultSchema.nullable(),
  error: SaleErrorSchema.nullable(),
  resolved_at: z.string().optional(),
});
export type SaleResponse = z.infer<typeof SaleResponseSchema>;

export const BarcodeSchema = z.object({
  barcode: z.string().min(1),
  barcode_type: z.string().optional(),
});

export const CatalogItemSchema = z.object({
  item_code: z.string().min(1),
  item_name: z.string(),
  item_group: z.string().nullable().optional(),
  stock_uom: z.string(),
  brand: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  is_stock_item: z.boolean(),
  has_batch_no: z.boolean(),
  has_serial_no: z.boolean().optional(),
  aliases: z.array(z.string()).default([]),
  barcodes: z.array(BarcodeSchema).default([]),
  /** Authoritative selling price from the server price list; null = no price. */
  price: z
    .object({
      price_list_rate: z.number().nonnegative(),
      uom: z.string().nullable().optional(),
    })
    .nullable(),
  modified: z.string(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const TaxTemplateSchema = z.object({
  name: z.string(),
  company: z.string(),
  is_default: z.boolean().optional(),
  taxes: z
    .array(
      z.object({
        charge_type: z.string(),
        account_head: z.string(),
        rate: z.number(),
        description: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export const CatalogSnapshotSchema = z.object({
  api_version: API_VERSION_SCHEMA,
  generated_at: z.string(),
  checkpoint: z.string(),
  price_list: z.string(),
  currency: z.string().nullable().optional(),
  items: z.array(CatalogItemSchema),
  tax_templates: z.array(TaxTemplateSchema).default([]),
  payment_modes: z
    .array(
      z.object({
        mode_of_payment: z.string(),
        type: z.string().nullable().optional(),
      }),
    )
    .default([]),
  customers: z
    .array(
      z.object({
        customer: z.string(),
        customer_name: z.string(),
        customer_group: z.string().nullable().optional(),
        mobile_no: z.string().nullable().optional(),
        email_id: z.string().nullable().optional(),
      }),
    )
    .optional(),
  is_incremental: z.boolean().optional(),
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;

export const DeviceRegistrationSchema = z.object({
  api_version: API_VERSION_SCHEMA,
  device_id: z.string(),
  counter_name: z.string().nullable().optional(),
  status: z.enum(["Enabled", "Disabled"]),
  action: z.enum(["registered", "updated"]),
});
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;

export const OwnerSummarySchema = z.object({
  api_version: API_VERSION_SCHEMA,
  business_date: z.string(),
  generated_at: z.string(),
  gross_sales: z.number(),
  net_sales: z.number(),
  taxes_collected: z.number(),
  returns_total: z.number(),
  net_sales_after_returns: z.number(),
  bills: z.number().int(),
  average_bill_value: z.number(),
  returns_count: z.number().int(),
  payment_split: z.array(z.object({ mode_of_payment: z.string(), amount: z.number() })),
  cashier_split: z.array(
    z.object({
      cashier: z.string(),
      bills: z.number().int(),
      gross_sales: z.number(),
    }),
  ),
});
export type OwnerSummary = z.infer<typeof OwnerSummarySchema>;

export const ServerStatusSchema = z.object({
  api_version: API_VERSION_SCHEMA,
  generated_at: z.string(),
  frappe_version: z.string().optional(),
  apps: z.array(z.string()).optional(),
  devices: z
    .array(
      z.object({
        device_id: z.string(),
        counter_name: z.string().nullable().optional(),
        status: z.string(),
        last_sync_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
  processing_transactions: z.array(z.string()).default([]),
  review_queue: z
    .array(
      z.object({
        transaction_id: z.string(),
        error_code: z.string().nullable().optional(),
        error_message: z.string().nullable().optional(),
        updated_at: z.string(),
      }),
    )
    .default([]),
});
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

/** Client-side transaction states (counter SQLite). Superset of server verdicts:
 * a sale is SERVER_COMMITTED only after the server confirms it. */
export const TransactionState = {
  Draft: "DRAFT",
  LocalSaved: "LOCAL_SAVED",
  PendingSync: "PENDING_SYNC",
  Syncing: "SYNCING",
  ServerCommitted: "SERVER_COMMITTED",
  SyncFailed: "SYNC_FAILED",
  RequiresReview: "REQUIRES_REVIEW",
  Cancelled: "CANCELLED",
} as const;
export type TransactionState = (typeof TransactionState)[keyof typeof TransactionState];

export const OUTBOX_EVENT_TYPE = "sale.submitted.v1" as const;

export const OutboxEventSchema = z.object({
  event_id: z.string().min(1),
  transaction_id: z.string().min(1),
  event_type: z.string(),
  payload: z.unknown(),
  created_at: z.string(),
  dispatched_at: z.string().nullable().optional(),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

export const SyncRecordSchema = z.object({
  transaction_id: z.string().min(1),
  state: z.nativeEnum({
    Draft: "DRAFT",
    LocalSaved: "LOCAL_SAVED",
    PendingSync: "PENDING_SYNC",
    Syncing: "SYNCING",
    ServerCommitted: "SERVER_COMMITTED",
    SyncFailed: "SYNC_FAILED",
    RequiresReview: "REQUIRES_REVIEW",
    Cancelled: "CANCELLED",
  }),
  payload: SalePayloadSchema,
  response: SaleResponseSchema.nullable().optional(),
  attempts: z.number().int().nonnegative().default(0),
  /** Epoch millis (local store convention); ISO strings are only for display. */
  next_attempt_at: z.number().nullable().optional(),
  last_error_code: z.string().nullable().optional(),
  last_error_message: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  device_id: z.string().optional(),
  receipt_printed: z.boolean().default(false),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;
