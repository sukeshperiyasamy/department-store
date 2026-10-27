/**
 * SaaS Subscription Billing, Customer Portal, and Commercial Control Plane contracts (API v1).
 *
 * Implements strict boundaries between SaaS subscription billing and store-level retail ERP.
 * SaaS subscription payments are commercial platform revenue and are NEVER mixed into retail
 * store sales, store inventory, or tenant GST accounting.
 */
import { z } from "zod";

const API_V1_SCHEMA = z.literal(1);

/** Explicit lifecycle states for a SaaS subscription */
export const SubscriptionStatus = {
  Trialing: "TRIALING",
  Active: "ACTIVE",
  PastDue: "PAST_DUE",
  Suspended: "SUSPENDED",
  Cancelled: "CANCELLED",
  Expired: "EXPIRED",
} as const;

export const SubscriptionStatusEnum = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

/** Permitted server-side subscription state transitions */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "SUSPENDED", "CANCELLED"],
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: ["ACTIVE", "EXPIRED"],
  EXPIRED: [],
} as const;

export function isValidSubscriptionTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/** Billing frequency intervals */
export const BillingIntervalEnum = z.enum(["MONTHLY", "ANNUALLY"]);
export type BillingInterval = z.infer<typeof BillingIntervalEnum>;

/** Payment transaction verification status */
export const PaymentTransactionStatusEnum = z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]);
export type PaymentTransactionStatus = z.infer<typeof PaymentTransactionStatusEnum>;

/** Webhook event processing lifecycle */
export const WebhookEventStatusEnum = z.enum(["RECEIVED", "PROCESSED", "FAILED", "IGNORED"]);
export type WebhookEventStatus = z.infer<typeof WebhookEventStatusEnum>;

/** SaaS Invoice settlement status */
export const SaaSInvoiceStatusEnum = z.enum(["PAID", "UNPAID", "VOID"]);
export type SaaSInvoiceStatus = z.infer<typeof SaaSInvoiceStatusEnum>;

/** Standard SaaS plan identifiers */
export const SubscriptionPlanIdEnum = z.enum(["starter", "growth", "enterprise"]);
export type SubscriptionPlanId = z.infer<typeof SubscriptionPlanIdEnum>;

/** Entitlements granted by a subscription plan */
export const SubscriptionEntitlementsSchema = z
  .object({
    max_counters: z.number().int().positive(),
    max_skus: z.number().int().positive(),
    max_users: z.number().int().positive(),
    shared_mobile_access: z.boolean(),
    batch_expiry_tracking: z.boolean(),
    priority_support: z.boolean(),
    backup_automation: z.boolean(),
  })
  .strict();
export type SubscriptionEntitlements = z.infer<typeof SubscriptionEntitlementsSchema>;

/** SaaS Plan Definition (Versioned) */
export const SubscriptionPlanSchema = z
  .object({
    plan_id: SubscriptionPlanIdEnum,
    version: z.number().int().positive(),
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    currency: z.string().length(3).default("INR"),
    billing_interval: BillingIntervalEnum,
    price_paise: z.number().int().nonnegative(), // Amount in paise (1 INR = 100 paise)
    entitlements: SubscriptionEntitlementsSchema,
    features: z.array(z.string()),
    is_active: z.boolean().default(true),
    created_at: z.string(),
  })
  .strict();
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

/** SaaS Customer Account Schema */
export const SaaSCustomerAccountSchema = z
  .object({
    customer_id: z.string().uuid(),
    user_id: z.string().min(1).max(140),
    email: z.string().email(),
    business_name: z.string().min(1).max(140),
    billing_email: z.string().email(),
    phone: z.string().max(20).optional(),
    gstin: z.string().max(15).nullable().optional(),
    state_code: z.string().length(2).default("33"), // 33 = Tamil Nadu
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type SaaSCustomerAccount = z.infer<typeof SaaSCustomerAccountSchema>;

/** SaaS Subscription Record Schema */
export const SubscriptionRecordSchema = z
  .object({
    subscription_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    plan_id: SubscriptionPlanIdEnum,
    plan_version: z.number().int().positive(),
    status: SubscriptionStatusEnum,
    billing_interval: BillingIntervalEnum,
    current_period_start: z.string(),
    current_period_end: z.string(),
    trial_end: z.string().nullable().optional(),
    cancel_at_period_end: z.boolean().default(false),
    cancelled_at: z.string().nullable().optional(),
    grace_period_end: z.string().nullable().optional(),
    provider_name: z.string().default("razorpay_sandbox"),
    provider_subscription_id: z.string().nullable().optional(),
    provider_customer_id: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type SubscriptionRecord = z.infer<typeof SubscriptionRecordSchema>;

/** SaaS Payment Transaction Record */
export const PaymentTransactionSchema = z
  .object({
    transaction_id: z.string().uuid(),
    subscription_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    amount_paise: z.number().int().positive(),
    currency: z.string().length(3).default("INR"),
    status: PaymentTransactionStatusEnum,
    provider_payment_id: z.string().nullable().optional(),
    provider_order_id: z.string().nullable().optional(),
    failure_reason: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type PaymentTransaction = z.infer<typeof PaymentTransactionSchema>;

/** SaaS Invoice Schema (Platform B2B Invoice, distinct from store retail invoices) */
export const SaaSInvoiceSchema = z
  .object({
    invoice_id: z.string().uuid(),
    invoice_number: z.string().min(1).max(50),
    subscription_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    period_start: z.string(),
    period_end: z.string(),
    subtotal_paise: z.number().int().nonnegative(),
    tax_paise: z.number().int().nonnegative(), // e.g. 18% GST
    total_paise: z.number().int().positive(),
    currency: z.string().length(3).default("INR"),
    payment_status: SaaSInvoiceStatusEnum,
    paid_at: z.string().nullable().optional(),
    pdf_url: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .strict();
export type SaaSInvoice = z.infer<typeof SaaSInvoiceSchema>;

/** SaaS Webhook Event Log */
export const WebhookEventSchema = z
  .object({
    event_id: z.string().min(1).max(140),
    provider: z.string().min(1).max(50),
    event_type: z.string().min(1).max(100),
    payload: z.unknown(),
    status: WebhookEventStatusEnum,
    processed_at: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .strict();
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/** Billing Audit Event */
export const BillingAuditEventSchema = z
  .object({
    audit_id: z.string().uuid(),
    actor: z.string().min(1),
    action: z.string().min(1),
    entity_type: z.enum(["subscription", "payment", "invoice", "customer", "plan"]),
    entity_id: z.string().min(1),
    previous_state: z.string().nullable().optional(),
    new_state: z.string().nullable().optional(),
    reason: z.string().min(1),
    timestamp: z.string(),
  })
  .strict();
export type BillingAuditEvent = z.infer<typeof BillingAuditEventSchema>;

/** Current Customer Subscription Details Envelope */
export const CustomerBillingOverviewSchema = z.object({
  api_version: API_V1_SCHEMA,
  customer: SaaSCustomerAccountSchema,
  subscription: SubscriptionRecordSchema.nullable(),
  plan: SubscriptionPlanSchema.nullable(),
  entitlements: SubscriptionEntitlementsSchema.nullable(),
  counters_active: z.number().int().nonnegative(),
  counters_limit: z.number().int().positive(),
  recent_invoices: z.array(SaaSInvoiceSchema),
});
export type CustomerBillingOverview = z.infer<typeof CustomerBillingOverviewSchema>;

/** Checkout Session Request Schema */
export const CreateCheckoutSessionPayloadSchema = z
  .object({
    tenant_id: z.string().uuid(),
    plan_id: SubscriptionPlanIdEnum,
    billing_interval: BillingIntervalEnum.default("MONTHLY"),
  })
  .strict();
export type CreateCheckoutSessionPayload = z.infer<typeof CreateCheckoutSessionPayloadSchema>;

export const CreateCheckoutSessionResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  session_id: z.string(),
  provider: z.string(),
  order_id: z.string(),
  amount_paise: z.number().int().positive(),
  currency: z.string().default("INR"),
  key_id: z.string(),
});
export type CreateCheckoutSessionResponse = z.infer<typeof CreateCheckoutSessionResponseSchema>;

/** Cancel Subscription Request Schema */
export const CancelSubscriptionPayloadSchema = z
  .object({
    tenant_id: z.string().uuid(),
    reason: z.string().min(3, "Cancellation reason must be provided").max(500),
    immediate: z.boolean().default(false),
  })
  .strict();
export type CancelSubscriptionPayload = z.infer<typeof CancelSubscriptionPayloadSchema>;

/** Platform Admin Manual Billing Correction Schema */
export const ManualBillingCorrectionPayloadSchema = z
  .object({
    subscription_id: z.string().uuid(),
    target_status: SubscriptionStatusEnum,
    extend_days: z.number().int().min(0).max(365).optional(),
    reason: z.string().min(5, "A descriptive administrative reason is required").max(500),
  })
  .strict();
export type ManualBillingCorrectionPayload = z.infer<typeof ManualBillingCorrectionPayloadSchema>;
