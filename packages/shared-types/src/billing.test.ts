import { describe, it, expect } from "vitest";
import {
  SubscriptionStatusEnum,
  isValidSubscriptionTransition,
  SubscriptionPlanSchema,
  SaaSCustomerAccountSchema,
  SubscriptionRecordSchema,
  PaymentTransactionSchema,
  SaaSInvoiceSchema,
  WebhookEventSchema,
  CreateCheckoutSessionPayloadSchema,
  CancelSubscriptionPayloadSchema,
  ManualBillingCorrectionPayloadSchema,
} from "./billing";

describe("SaaS Subscription State Machine", () => {
  it("allows valid forward state transitions", () => {
    expect(isValidSubscriptionTransition("TRIALING", "ACTIVE")).toBe(true);
    expect(isValidSubscriptionTransition("TRIALING", "PAST_DUE")).toBe(true);
    expect(isValidSubscriptionTransition("TRIALING", "SUSPENDED")).toBe(true);
    expect(isValidSubscriptionTransition("TRIALING", "CANCELLED")).toBe(true);
    expect(isValidSubscriptionTransition("TRIALING", "EXPIRED")).toBe(true);

    expect(isValidSubscriptionTransition("ACTIVE", "PAST_DUE")).toBe(true);
    expect(isValidSubscriptionTransition("ACTIVE", "SUSPENDED")).toBe(true);
    expect(isValidSubscriptionTransition("ACTIVE", "CANCELLED")).toBe(true);

    expect(isValidSubscriptionTransition("PAST_DUE", "ACTIVE")).toBe(true);
    expect(isValidSubscriptionTransition("PAST_DUE", "SUSPENDED")).toBe(true);

    expect(isValidSubscriptionTransition("SUSPENDED", "ACTIVE")).toBe(true);
    expect(isValidSubscriptionTransition("SUSPENDED", "CANCELLED")).toBe(true);
  });

  it("denies invalid or illegal state transitions", () => {
    // Cannot transition from ACTIVE back to TRIALING
    expect(isValidSubscriptionTransition("ACTIVE", "TRIALING")).toBe(false);
    // Cannot transition from EXPIRED anywhere
    expect(isValidSubscriptionTransition("EXPIRED", "ACTIVE")).toBe(false);
    expect(isValidSubscriptionTransition("EXPIRED", "TRIALING")).toBe(false);
    // Identical status is always valid (no-op)
    expect(isValidSubscriptionTransition("ACTIVE", "ACTIVE")).toBe(true);
  });
});

describe("Subscription Plan and Entitlements Schema", () => {
  it("parses and validates a valid versioned plan with entitlements", () => {
    const validPlan = {
      plan_id: "growth",
      version: 1,
      name: "Growth Multi-Counter",
      description: "POS billing and inventory tracking for stores with 2-5 counters.",
      currency: "INR",
      billing_interval: "MONTHLY",
      price_paise: 349900, // 3,499.00 INR
      entitlements: {
        max_counters: 5,
        max_skus: 50000,
        max_users: 10,
        shared_mobile_access: true,
        batch_expiry_tracking: true,
        priority_support: true,
        backup_automation: true,
      },
      features: [
        "Up to 5 counters",
        "50,000 SKUs",
        "Shared mobile app",
        "Batch & Expiry alerts",
      ],
      is_active: true,
      created_at: "2026-10-27T00:00:00Z",
    };

    const parsed = SubscriptionPlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
  });

  it("fails if entitlements are incomplete or invalid", () => {
    const invalidPlan = {
      plan_id: "starter",
      version: 1,
      name: "Starter Plan",
      description: "Single counter",
      currency: "INR",
      billing_interval: "MONTHLY",
      price_paise: 149900,
      entitlements: {
        max_counters: 0, // must be positive
        max_skus: 5000,
        max_users: 2,
        shared_mobile_access: false,
        batch_expiry_tracking: false,
        priority_support: false,
        backup_automation: false,
      },
      features: [],
      created_at: "2026-10-27T00:00:00Z",
    };

    const parsed = SubscriptionPlanSchema.safeParse(invalidPlan);
    expect(parsed.success).toBe(false);
  });
});

describe("Customer Account & Subscription Records", () => {
  it("validates a customer account record with GSTIN", () => {
    const customer = {
      customer_id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "owner@chennaisuper.in",
      email: "owner@chennaisuper.in",
      business_name: "Chennai Super Mart",
      billing_email: "billing@chennaisuper.in",
      phone: "+91 9876543210",
      gstin: "33AABCC1234D1Z5",
      state_code: "33",
      created_at: "2026-10-27T10:00:00Z",
      updated_at: "2026-10-27T10:00:00Z",
    };

    const parsed = SaaSCustomerAccountSchema.safeParse(customer);
    expect(parsed.success).toBe(true);
  });

  it("validates a subscription record with lifecycle dates", () => {
    const subscription = {
      subscription_id: "770e8400-e29b-41d4-a716-446655440001",
      customer_id: "550e8400-e29b-41d4-a716-446655440000",
      tenant_id: "880e8400-e29b-41d4-a716-446655440002",
      plan_id: "starter",
      plan_version: 1,
      status: "ACTIVE",
      billing_interval: "MONTHLY",
      current_period_start: "2026-10-27T00:00:00Z",
      current_period_end: "2026-11-27T00:00:00Z",
      trial_end: null,
      cancel_at_period_end: false,
      cancelled_at: null,
      grace_period_end: null,
      provider_name: "razorpay_sandbox",
      provider_subscription_id: "sub_123456",
      provider_customer_id: "cust_123456",
      created_at: "2026-10-27T00:00:00Z",
      updated_at: "2026-10-27T00:00:00Z",
    };

    const parsed = SubscriptionRecordSchema.safeParse(subscription);
    expect(parsed.success).toBe(true);
  });
});

describe("SaaS Invoices & Payment Transactions", () => {
  it("validates a B2B SaaS invoice record", () => {
    const invoice = {
      invoice_id: "990e8400-e29b-41d4-a716-446655440003",
      invoice_number: "SAAS-INV-2026-00001",
      subscription_id: "770e8400-e29b-41d4-a716-446655440001",
      customer_id: "550e8400-e29b-41d4-a716-446655440000",
      tenant_id: "880e8400-e29b-41d4-a716-446655440002",
      period_start: "2026-10-27T00:00:00Z",
      period_end: "2026-11-27T00:00:00Z",
      subtotal_paise: 149900,
      tax_paise: 26982, // 18% GST = 269.82 INR
      total_paise: 176882, // 1,768.82 INR
      currency: "INR",
      payment_status: "PAID",
      paid_at: "2026-10-27T00:05:00Z",
      pdf_url: "/api/billing/invoices/990e8400-e29b-41d4-a716-446655440003/download",
      created_at: "2026-10-27T00:00:00Z",
    };

    const parsed = SaaSInvoiceSchema.safeParse(invoice);
    expect(parsed.success).toBe(true);
  });
});

describe("Webhook Events and Payloads", () => {
  it("validates a webhook event container", () => {
    const webhook = {
      event_id: "evt_razorpay_998877",
      provider: "razorpay_sandbox",
      event_type: "payment.captured",
      payload: { id: "pay_12345", amount: 176882 },
      status: "RECEIVED",
      created_at: "2026-10-27T10:00:00Z",
    };

    const parsed = WebhookEventSchema.safeParse(webhook);
    expect(parsed.success).toBe(true);
  });

  it("validates checkout and cancellation payloads", () => {
    const checkout = {
      tenant_id: "880e8400-e29b-41d4-a716-446655440002",
      plan_id: "growth",
      billing_interval: "MONTHLY",
    };
    expect(CreateCheckoutSessionPayloadSchema.safeParse(checkout).success).toBe(true);

    const cancel = {
      tenant_id: "880e8400-e29b-41d4-a716-446655440002",
      reason: "Store closing down operations",
      immediate: false,
    };
    expect(CancelSubscriptionPayloadSchema.safeParse(cancel).success).toBe(true);

    const adminCorrection = {
      subscription_id: "770e8400-e29b-41d4-a716-446655440001",
      target_status: "ACTIVE",
      extend_days: 14,
      reason: "Authorized courtesy extension approved by billing operations",
    };
    expect(ManualBillingCorrectionPayloadSchema.safeParse(adminCorrection).success).toBe(true);
  });
});
