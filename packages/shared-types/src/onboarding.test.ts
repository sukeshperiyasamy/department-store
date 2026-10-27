import { describe, it, expect } from "vitest";
import {
  VerificationTokenSchema,
  VerifyContactPayloadSchema,
  ResendVerificationPayloadSchema,
  CustomerOnboardingJourneySchema,
  NotificationRecordSchema,
  canApproveOnboarding,
  canActivateTenant,
} from "./onboarding";

describe("Verification Token Contracts", () => {
  it("validates a SHA-256 hashed verification token", () => {
    const token = {
      token_id: "550e8400-e29b-41d4-a716-446655440000",
      request_id: "ONBOARD-20261027-A1B2C3D4",
      token_hash: "a".repeat(64), // 64-char hex SHA-256
      channel: "EMAIL",
      expires_at: "2026-10-28T10:00:00Z",
      verified_at: null,
      is_used: false,
      created_at: "2026-10-27T10:00:00Z",
    };
    const parsed = VerificationTokenSchema.safeParse(token);
    expect(parsed.success).toBe(true);
  });

  it("rejects token with invalid hash length", () => {
    const invalid = {
      token_id: "550e8400-e29b-41d4-a716-446655440000",
      request_id: "ONBOARD-20261027-A1B2C3D4",
      token_hash: "short_hash", // not 64 chars
      channel: "EMAIL",
      expires_at: "2026-10-28T10:00:00Z",
      is_used: false,
      created_at: "2026-10-27T10:00:00Z",
    };
    expect(VerificationTokenSchema.safeParse(invalid).success).toBe(false);
  });

  it("validates verify and resend payloads", () => {
    expect(
      VerifyContactPayloadSchema.safeParse({
        request_id: "ONBOARD-20261027-A1B2C3D4",
        token: "tok_secure_889900",
      }).success,
    ).toBe(true);

    expect(
      ResendVerificationPayloadSchema.safeParse({
        email: "owner@chennaisuper.in",
      }).success,
    ).toBe(true);

    expect(
      ResendVerificationPayloadSchema.safeParse({
        email: "invalid-email",
      }).success,
    ).toBe(false);
  });
});

describe("Multi-Dimensional Customer Onboarding Journey", () => {
  it("validates a multi-dimensional customer journey record", () => {
    const journey = {
      request_id: "ONBOARD-20261027-A1B2C3D4",
      business_name: "Chennai Super Mart",
      owner_name: "Ramesh Kumar",
      email: "ramesh@chennaisuper.in",
      phone: "+91 9876543210",
      preferred_slug: "chennai-super",
      requested_plan: "growth",
      assigned_site_name: "shop-chennai-super.departmentstore.in",
      primary_hostname: "chennai-super.departmentstore.in",
      contact_verification: "VERIFIED",
      business_review: "APPROVED",
      provisioning: "PROVISIONED",
      hostname: "VERIFIED",
      subscription: "TRIALING",
      tenant_access: "ACTIVE",
      next_action: "Store is active. Proceed to Manager Console to download Windows POS.",
      can_resume: true,
      created_at: "2026-10-27T08:00:00Z",
      updated_at: "2026-10-27T09:30:00Z",
    };

    const parsed = CustomerOnboardingJourneySchema.safeParse(journey);
    expect(parsed.success).toBe(true);
  });
});

describe("Onboarding Transition Validation Rules", () => {
  it("denies approval if email contact is not yet verified", () => {
    const res = canApproveOnboarding("PENDING", "PENDING_REVIEW");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("contact is verified");
  });

  it("allows approval when contact is verified and review is pending", () => {
    const res = canApproveOnboarding("VERIFIED", "PENDING_REVIEW");
    expect(res.allowed).toBe(true);
  });

  it("denies activation if site is not provisioned", () => {
    const res = canActivateTenant({
      provisioningStatus: "PENDING",
      hostnameStatus: "VERIFIED",
      subscriptionStatus: "ACTIVE",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("not provisioned");
  });

  it("denies activation if hostname is not verified", () => {
    const res = canActivateTenant({
      provisioningStatus: "PROVISIONED",
      hostnameStatus: "PENDING",
      subscriptionStatus: "ACTIVE",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("hostname is not verified");
  });

  it("denies activation if subscription is not active or trialing", () => {
    const res = canActivateTenant({
      provisioningStatus: "PROVISIONED",
      hostnameStatus: "VERIFIED",
      subscriptionStatus: "SUSPENDED",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Subscription is not active");
  });

  it("allows activation when provisioning, hostname, and subscription are all verified", () => {
    const res = canActivateTenant({
      provisioningStatus: "PROVISIONED",
      hostnameStatus: "VERIFIED",
      subscriptionStatus: "ACTIVE",
    });
    expect(res.allowed).toBe(true);
  });
});

describe("Notification Log Schema", () => {
  it("validates notification record with deduplication key", () => {
    const notification = {
      notification_id: "660e8400-e29b-41d4-a716-446655440001",
      request_id: "ONBOARD-20261027-A1B2C3D4",
      recipient: "ramesh@chennaisuper.in",
      channel: "EMAIL",
      event_type: "EMAIL_VERIFICATION",
      delivery_status: "SENT",
      dedup_key: "ONBOARD-20261027-A1B2C3D4:EMAIL_VERIFICATION:v1",
      sent_at: "2026-10-27T08:05:00Z",
      created_at: "2026-10-27T08:05:00Z",
    };

    const parsed = NotificationRecordSchema.safeParse(notification);
    expect(parsed.success).toBe(true);
  });
});
