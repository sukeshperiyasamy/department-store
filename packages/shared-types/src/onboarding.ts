/**
 * SaaS Customer Onboarding, Verification, Multi-Dimensional State Machine,
 * and Operations Contracts (API v1).
 *
 * Implements strict boundaries:
 * - Separates Contact Verification, Business Review, Provisioning, Hostname, Subscription, and Tenant Access
 * - Single-use SHA-256 hashed verification tokens with expiration
 * - Multi-dimensional onboarding journey contracts for customer self-service
 * - Rate limiting and notification deduplication models
 */
import { z } from "zod";
import { TenantSlugSchema } from "./tenancy";
import { SubscriptionPlanIdEnum, SubscriptionStatusEnum } from "./billing";

const API_V1_SCHEMA = z.literal(1);

/** 1. Contact Verification Dimension */
export const ContactVerificationStatusEnum = z.enum(["PENDING", "VERIFIED", "EXPIRED"]);
export type ContactVerificationStatus = z.infer<typeof ContactVerificationStatusEnum>;

/** 2. Business Review Dimension */
export const BusinessReviewStatusEnum = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]);
export type BusinessReviewStatus = z.infer<typeof BusinessReviewStatusEnum>;

/** 3. Provisioning Dimension */
export const ProvisioningStatusEnum = z.enum([
  "PENDING",
  "RUNNING",
  "PROVISIONED",
  "PROVISIONING_FAILED",
]);
export type ProvisioningStatus = z.infer<typeof ProvisioningStatusEnum>;

/** 4. Hostname Verification Dimension */
export const HostnameStatusEnum = z.enum(["PENDING", "VERIFIED", "FAILED"]);
export type HostnameStatus = z.infer<typeof HostnameStatusEnum>;

/** 5. Tenant Access Status Dimension */
export const TenantAccessStatusEnum = z.enum(["INACTIVE", "ACTIVE", "SUSPENDED", "ARCHIVED"]);
export type TenantAccessStatus = z.infer<typeof TenantAccessStatusEnum>;

/** Notification Channel & Events */
export const NotificationChannelEnum = z.enum(["EMAIL", "SMS"]);
export type NotificationChannel = z.infer<typeof NotificationChannelEnum>;

export const NotificationEventTypeEnum = z.enum([
  "REGISTRATION_CONFIRMATION",
  "EMAIL_VERIFICATION",
  "REVIEW_APPROVED",
  "REVIEW_REJECTED",
  "PROVISIONING_COMPLETE",
  "PROVISIONING_FAILED",
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "TENANT_REACTIVATED",
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeEnum>;

export const NotificationDeliveryStatusEnum = z.enum(["SENT", "FAILED", "PENDING", "SUPPRESSED"]);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusEnum>;

/** Verification Token Model (Server-persisted as SHA-256 hash) */
export const VerificationTokenSchema = z
  .object({
    token_id: z.string().uuid(),
    request_id: z.string(),
    token_hash: z.string().length(64), // SHA-256 hex string
    channel: NotificationChannelEnum,
    expires_at: z.string(),
    verified_at: z.string().nullable().optional(),
    is_used: z.boolean().default(false),
    created_at: z.string(),
  })
  .strict();
export type VerificationToken = z.infer<typeof VerificationTokenSchema>;

/** Public Contact Verification Payload */
export const VerifyContactPayloadSchema = z
  .object({
    request_id: z.string().min(1, "Request ID is required"),
    token: z.string().min(6, "Verification token must be at least 6 characters").max(100),
  })
  .strict();
export type VerifyContactPayload = z.infer<typeof VerifyContactPayloadSchema>;

/** Resend Verification Payload */
export const ResendVerificationPayloadSchema = z
  .object({
    email: z.string().email("Valid email required"),
  })
  .strict();
export type ResendVerificationPayload = z.infer<typeof ResendVerificationPayloadSchema>;

/** Comprehensive Multi-Dimensional Customer Onboarding Journey Model */
export const CustomerOnboardingJourneySchema = z
  .object({
    request_id: z.string(),
    business_name: z.string(),
    owner_name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    preferred_slug: TenantSlugSchema,
    requested_plan: SubscriptionPlanIdEnum,
    assigned_site_name: z.string().nullable().optional(),
    primary_hostname: z.string().nullable().optional(),
    contact_verification: ContactVerificationStatusEnum,
    business_review: BusinessReviewStatusEnum,
    provisioning: ProvisioningStatusEnum,
    hostname: HostnameStatusEnum,
    subscription: SubscriptionStatusEnum,
    tenant_access: TenantAccessStatusEnum,
    next_action: z.string(),
    can_resume: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type CustomerOnboardingJourney = z.infer<typeof CustomerOnboardingJourneySchema>;

/** Customer Onboarding Status API Envelope */
export const CustomerOnboardingStatusResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  journey: CustomerOnboardingJourneySchema,
});
export type CustomerOnboardingStatusResponse = z.infer<typeof CustomerOnboardingStatusResponseSchema>;

/** Notification Record Schema */
export const NotificationRecordSchema = z
  .object({
    notification_id: z.string().uuid(),
    request_id: z.string(),
    recipient: z.string(),
    channel: NotificationChannelEnum,
    event_type: NotificationEventTypeEnum,
    delivery_status: NotificationDeliveryStatusEnum,
    dedup_key: z.string(),
    error_message: z.string().nullable().optional(),
    sent_at: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .strict();
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

/** Platform Operations Dashboard Overview Envelope */
export const PlatformOperationsOverviewSchema = z.object({
  api_version: API_V1_SCHEMA,
  total_registrations: z.number().int().nonnegative(),
  pending_verification: z.number().int().nonnegative(),
  pending_review: z.number().int().nonnegative(),
  active_provisioning: z.number().int().nonnegative(),
  failed_provisioning: z.number().int().nonnegative(),
  active_tenants: z.number().int().nonnegative(),
  suspended_tenants: z.number().int().nonnegative(),
  backup_status: z.object({
    last_backup_at: z.string().nullable().optional(),
    status: z.string(),
    rehearsal_verified: z.boolean(),
  }),
});
export type PlatformOperationsOverview = z.infer<typeof PlatformOperationsOverviewSchema>;

/** Validation Helpers for Onboarding Transitions */
export function canApproveOnboarding(
  contactStatus: ContactVerificationStatus,
  reviewStatus: BusinessReviewStatus,
): { allowed: boolean; reason?: string } {
  if (contactStatus !== "VERIFIED") {
    return {
      allowed: false,
      reason: "Cannot approve onboarding request until email contact is verified",
    };
  }
  if (reviewStatus !== "PENDING_REVIEW") {
    return {
      allowed: false,
      reason: `Cannot approve request with review status '${reviewStatus}'`,
    };
  }
  return { allowed: true };
}

export function canActivateTenant(params: {
  provisioningStatus: ProvisioningStatus;
  hostnameStatus: HostnameStatus;
  subscriptionStatus: string;
}): { allowed: boolean; reason?: string } {
  if (params.provisioningStatus !== "PROVISIONED") {
    return {
      allowed: false,
      reason: `Tenant site is not provisioned (current: ${params.provisioningStatus})`,
    };
  }
  if (params.hostnameStatus !== "VERIFIED") {
    return {
      allowed: false,
      reason: `Tenant hostname is not verified (current: ${params.hostnameStatus})`,
    };
  }
  const allowedSubStatuses = ["TRIALING", "ACTIVE"];
  if (!allowedSubStatuses.includes(params.subscriptionStatus.toUpperCase())) {
    return {
      allowed: false,
      reason: `Subscription is not active or trialing (current: ${params.subscriptionStatus})`,
    };
  }
  return { allowed: true };
}
