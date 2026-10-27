import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCheckoutAction,
  cancelSubscriptionAction,
  adminManualCorrectionAction,
  adminRetryWebhookAction,
} from "./billing";

vi.mock("@/lib/frappe-server", () => ({
  createCheckoutSession: vi.fn().mockResolvedValue({
    session_id: "chk_test123",
    order_id: "order_test123",
    amount_paise: 412882,
    currency: "INR",
  }),
  cancelSubscription: vi.fn().mockResolvedValue({
    subscription_id: "sub_123",
    status: "ACTIVE",
    cancel_at_period_end: true,
    message: "Subscription scheduled for cancellation at period end.",
  }),
  adminManualBillingCorrection: vi.fn().mockResolvedValue({
    subscription_id: "sub_123",
    status: "ACTIVE",
    message: "Successfully transitioned subscription to 'ACTIVE'",
  }),
  adminRetryWebhookEvent: vi.fn().mockResolvedValue({
    status: "PROCESSED",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Billing Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createCheckoutAction succeeds with valid payload", async () => {
    const fd = new FormData();
    fd.set("tenant_id", "880e8400-e29b-41d4-a716-446655440002");
    fd.set("plan_id", "growth");
    fd.set("billing_interval", "MONTHLY");

    const res = await createCheckoutAction(null, fd);
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect((res.data as any).session_id).toBe("chk_test123");
  });

  it("createCheckoutAction rejects invalid tenant_id", async () => {
    const fd = new FormData();
    fd.set("tenant_id", "not-a-uuid");
    fd.set("plan_id", "growth");

    const res = await createCheckoutAction(null, fd);
    expect(res.success).toBe(false);
  });

  it("cancelSubscriptionAction requires descriptive reason", async () => {
    const fd = new FormData();
    fd.set("tenant_id", "880e8400-e29b-41d4-a716-446655440002");
    fd.set("reason", "no");

    const res = await cancelSubscriptionAction(null, fd);
    expect(res.success).toBe(false);
  });

  it("cancelSubscriptionAction succeeds with valid parameters", async () => {
    const fd = new FormData();
    fd.set("tenant_id", "880e8400-e29b-41d4-a716-446655440002");
    fd.set("reason", "Relocating store to a new district");
    fd.set("immediate", "false");

    const res = await cancelSubscriptionAction(null, fd);
    expect(res.success).toBe(true);
    expect(res.message).toContain("cancellation");
  });

  it("adminManualCorrectionAction requires min 5 char reason", async () => {
    const fd = new FormData();
    fd.set("subscription_id", "770e8400-e29b-41d4-a716-446655440001");
    fd.set("target_status", "ACTIVE");
    fd.set("reason", "bad");

    const res = await adminManualCorrectionAction(null, fd);
    expect(res.success).toBe(false);
  });

  it("adminManualCorrectionAction succeeds with valid admin parameters", async () => {
    const fd = new FormData();
    fd.set("subscription_id", "770e8400-e29b-41d4-a716-446655440001");
    fd.set("target_status", "ACTIVE");
    fd.set("reason", "Promotional 14-day grace extension authorized");
    fd.set("extend_days", "14");

    const res = await adminManualCorrectionAction(null, fd);
    expect(res.success).toBe(true);
  });

  it("adminRetryWebhookAction succeeds with valid event_id", async () => {
    const fd = new FormData();
    fd.set("event_id", "evt_123456");

    const res = await adminRetryWebhookAction(null, fd);
    expect(res.success).toBe(true);
  });
});
