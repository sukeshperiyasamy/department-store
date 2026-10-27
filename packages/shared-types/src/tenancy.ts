/**
 * SaaS Multi-Tenant contracts, schemas, and resolution engine.
 *
 * Implements strict tenant boundary definitions, lifecycle states,
 * hostname normalization/validation, and server-side authorization guards.
 * Shared across the central SaaS control plane, Next.js dashboard,
 * Windows POS, mobile apps, and backend services.
 */
import { z } from "zod";

const API_V1_SCHEMA = z.literal(1);

/** Lifecycle status of a tenant */
export const TenantLifecycleStatus = {
  PendingReview: "PENDING_REVIEW",
  Approved: "APPROVED",
  Rejected: "REJECTED",
  Provisioning: "PROVISIONING",
  Provisioned: "PROVISIONED",
  VerificationPending: "VERIFICATION_PENDING",
  Active: "ACTIVE",
  ProvisioningFailed: "PROVISIONING_FAILED",
  Suspended: "SUSPENDED",
  Archived: "ARCHIVED",
} as const;

export const TenantLifecycleStatusEnum = z.enum([
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "PROVISIONING",
  "PROVISIONED",
  "VERIFICATION_PENDING",
  "ACTIVE",
  "PROVISIONING_FAILED",
  "SUSPENDED",
  "ARCHIVED",
]);

export const TenantLifecycleStatusSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const s = val.trim().toUpperCase().replace(/\s+/g, "_");
    if (s === "FAILED") return "PROVISIONING_FAILED";
    return s;
  }
  return val;
}, TenantLifecycleStatusEnum);

export type TenantLifecycleStatus = z.infer<typeof TenantLifecycleStatusEnum>;

/** Permitted lifecycle state transitions for SaaS onboarding and tenant operations */
export const ALLOWED_STATE_TRANSITIONS: Record<TenantLifecycleStatus, readonly TenantLifecycleStatus[]> = {
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROVISIONING", "REJECTED"],
  REJECTED: ["PENDING_REVIEW"],
  PROVISIONING: ["PROVISIONED", "PROVISIONING_FAILED"],
  PROVISIONED: ["VERIFICATION_PENDING", "PROVISIONING_FAILED"],
  VERIFICATION_PENDING: ["ACTIVE", "PROVISIONING_FAILED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  PROVISIONING_FAILED: ["APPROVED", "REJECTED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
} as const;

/**
 * Validates whether a proposed lifecycle status transition is permitted.
 */
export function isValidStateTransition(from: TenantLifecycleStatus, to: TenantLifecycleStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/** Verification status of a tenant's hostname */
export const HostnameVerificationStatus = {
  Verified: "VERIFIED",
  Pending: "PENDING",
  Failed: "FAILED",
} as const;

export const HostnameVerificationStatusSchema = z.enum(["VERIFIED", "PENDING", "FAILED"]);
export type HostnameVerificationStatus = z.infer<typeof HostnameVerificationStatusSchema>;

/** Platform-wide operator and auditor roles */
export const PlatformRole = {
  PlatformAdmin: "PLATFORM_ADMIN",
  PlatformSupport: "PLATFORM_SUPPORT",
  PlatformAuditor: "PLATFORM_AUDITOR",
} as const;

export const PlatformRoleSchema = z.enum(["PLATFORM_ADMIN", "PLATFORM_SUPPORT", "PLATFORM_AUDITOR"]);
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;

/** Tenant-scoped business roles */
export const TenantRole = {
  TenantOwner: "TENANT_OWNER",
  StoreManager: "STORE_MANAGER",
  Cashier: "CASHIER",
  Auditor: "AUDITOR",
} as const;

export const TenantRoleSchema = z.enum(["TENANT_OWNER", "STORE_MANAGER", "CASHIER", "AUDITOR"]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

/** Membership status of a user within a tenant */
export const MembershipStatus = {
  Active: "ACTIVE",
  Invited: "INVITED",
  Suspended: "SUSPENDED",
} as const;

export const MembershipStatusSchema = z.enum(["ACTIVE", "INVITED", "SUSPENDED"]);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

/** URL/subdomain-safe slug: 3-63 chars, lowercase alphanumeric + hyphen, no double hyphens, no leading/trailing hyphen */
export const TenantSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Slug must contain only lowercase letters, numbers, and hyphens without leading or trailing hyphens")
  .refine((slug) => !slug.includes("--"), "Slug cannot contain consecutive hyphens");
export type TenantSlug = z.infer<typeof TenantSlugSchema>;

/** Valid RFC 1123 hostname (no port, no protocol, no trailing dot, lowercase) */
export const HostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/, "Must be a valid lowercase domain or subdomain")
  .refine((host) => !/^\d+\.\d+\.\d+\.\d+$/.test(host), "Raw IP addresses cannot be tenant hostnames");
export type Hostname = z.infer<typeof HostnameSchema>;

/** Central Tenant Record Schema */
export const TenantRecordSchema = z
  .object({
    tenant_id: z.string().uuid(),
    slug: TenantSlugSchema,
    name: z.string().min(1).max(100),
    legal_name: z.string().min(1).max(140),
    lifecycle_status: TenantLifecycleStatusSchema,
    primary_hostname: HostnameSchema,
    hostname_status: HostnameVerificationStatusSchema,
    custom_domains: z.array(HostnameSchema).default([]),
    frappe_site_name: z.string().min(1).max(140),
    plan_id: z.string().min(1).max(50),
    state_code: z.string().length(2).default("33"),
    currency: z.string().length(3).default("INR"),
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string().min(1),
  })
  .strict();
export type TenantRecord = z.infer<typeof TenantRecordSchema>;

/** Tenant User Membership Schema */
export const TenantMembershipSchema = z
  .object({
    membership_id: z.string().uuid(),
    user_id: z.string().min(1).max(140),
    tenant_id: z.string().uuid(),
    role: TenantRoleSchema,
    status: MembershipStatusSchema,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type TenantMembership = z.infer<typeof TenantMembershipSchema>;

/** Tenant Context injected into authenticated request pipelines */
export const TenantContextSchema = z
  .object({
    tenant_id: z.string().uuid(),
    slug: TenantSlugSchema,
    name: z.string(),
    frappe_site_name: z.string(),
    primary_hostname: HostnameSchema,
    lifecycle_status: TenantLifecycleStatusSchema,
  })
  .strict();
export type TenantContext = z.infer<typeof TenantContextSchema>;

/** API Envelope for Tenant Info query */
export const TenantInfoResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  tenant: TenantRecordSchema,
});
export type TenantInfoResponse = z.infer<typeof TenantInfoResponseSchema>;

/** API Envelope for Hostname Resolution */
export const ResolveTenantResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  matched: z.boolean(),
  tenant: TenantContextSchema.nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
});
export type ResolveTenantResponse = z.infer<typeof ResolveTenantResponseSchema>;

/** Summary of a tenant workspace authorized for an authenticated user session */
export const UserTenantSummarySchema = z
  .object({
    tenant_id: z.string(),
    slug: TenantSlugSchema,
    name: z.string().min(1).max(100),
    role: TenantRoleSchema,
    status: TenantLifecycleStatusSchema,
    primary_hostname: z.string().optional(),
  })
  .strict();
export type UserTenantSummary = z.infer<typeof UserTenantSummarySchema>;

/** Response envelope for user authorized tenants listing */
export const UserTenantsResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  tenants: z.array(UserTenantSummarySchema),
});
export type UserTenantsResponse = z.infer<typeof UserTenantsResponseSchema>;

/** Response envelope for authenticated user profile with authorized tenants */
export const UserProfileResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  user_id: z.string().min(1),
  full_name: z.string(),
  email: z.string().optional(),
  roles: z.array(z.string()).default([]),
  tenants: z.array(UserTenantSummarySchema),
});
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;

/** Demo Request input schema */
export const DemoRequestSchema = z
  .object({
    business_name: z.string().trim().min(2, "Business name must be at least 2 characters").max(100),
    contact_name: z.string().trim().min(2, "Contact name must be at least 2 characters").max(100),
    email: z.string().trim().email("Please provide a valid email address").max(140),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+ -]{10,18}$/, "Phone number must be between 10 and 18 digits"),
    city: z.string().trim().min(2, "City name must be at least 2 characters").max(100),
    state: z.string().trim().min(2, "State must be at least 2 characters").max(100),
    counter_count: z.number().int().min(1, "Store must have at least 1 counter").max(50).default(1),
    message: z.string().trim().max(1000).optional().default(""),
    consent_given: z.literal(true, {
      errorMap: () => ({ message: "You must consent to be contacted regarding the demo request" }),
    }),
  })
  .strict();
export type DemoRequest = z.infer<typeof DemoRequestSchema>;

export const DemoRequestResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  request_id: z.string(),
  status: z.enum(["Pending Review", "Contacted", "Scheduled", "Closed"]),
  message: z.string(),
});
export type DemoRequestResponse = z.infer<typeof DemoRequestResponseSchema>;

/** Onboarding Request input schema */
export const OnboardingRequestSchema = z
  .object({
    business_name: z.string().trim().min(2, "Business name must be at least 2 characters").max(100),
    owner_name: z.string().trim().min(2, "Owner name must be at least 2 characters").max(100),
    email: z.string().trim().email("Please provide a valid email address").max(140),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+ -]{10,18}$/, "Phone number must be between 10 and 18 digits"),
    state: z.string().trim().min(2, "State must be at least 2 characters").max(100),
    city: z.string().trim().min(2, "City name must be at least 2 characters").max(100),
    preferred_slug: TenantSlugSchema,
    requested_plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
    agreed_to_terms: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the Terms of Service and Privacy Policy" }),
    }),
  })
  .strict();
export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;

export const OnboardingRequestResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  request_id: z.string(),
  preferred_slug: z.string(),
  status: z.enum(["Pending Review", "Under Verification", "Approved", "Provisioned", "Rejected"]),
  message: z.string(),
});
export type OnboardingRequestResponse = z.infer<typeof OnboardingRequestResponseSchema>;

export const SlugAvailabilityResponseSchema = z.object({
  api_version: API_V1_SCHEMA,
  slug: z.string(),
  available: z.boolean(),
  reason: z.string().optional(),
});
export type SlugAvailabilityResponse = z.infer<typeof SlugAvailabilityResponseSchema>;

/** Provisioning Job Status */
export const ProvisioningJobStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type ProvisioningJobStatus = z.infer<typeof ProvisioningJobStatusSchema>;

/** Steps executed by the provisioning pipeline */
export const ProvisioningStepSchema = z.enum([
  "INIT",
  "VALIDATE",
  "CREATE_SITE",
  "INSTALL_APPS",
  "INITIALIZE_STORE",
  "VERIFY_HEALTH",
  "COMPLETED",
]);
export type ProvisioningStep = z.infer<typeof ProvisioningStepSchema>;

/** Provisioning Job Contract */
export const ProvisioningJobSchema = z
  .object({
    job_id: z.string(),
    request_id: z.string(),
    tenant_slug: TenantSlugSchema,
    site_name: z.string(),
    status: ProvisioningJobStatusSchema,
    current_step: ProvisioningStepSchema,
    retry_count: z.number().int().min(0).default(0),
    max_retries: z.number().int().min(1).default(3),
    sanitized_error: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional(),
    heartbeat_at: z.string().nullable().optional(),
    worker_id: z.string().nullable().optional(),
  })
  .strict();
export type ProvisioningJob = z.infer<typeof ProvisioningJobSchema>;

/** Immutable Audit Log Entry for Onboarding & Tenant State Transitions */
export const ProvisioningAuditLogSchema = z
  .object({
    audit_id: z.string(),
    request_id: z.string(),
    tenant_id: z.string().optional(),
    from_status: TenantLifecycleStatusSchema,
    to_status: TenantLifecycleStatusSchema,
    actor: z.string().min(1),
    reason: z.string().min(1),
    timestamp: z.string(),
    job_id: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type ProvisioningAuditLog = z.infer<typeof ProvisioningAuditLogSchema>;

/** Onboarding Request Details including job and audit trail */
export const OnboardingDetailRecordSchema = z.object({
  name: z.string(),
  business_name: z.string(),
  owner_name: z.string(),
  email: z.string(),
  phone: z.string(),
  state: z.string(),
  city: z.string(),
  preferred_slug: z.string(),
  requested_plan: z.string(),
  status: TenantLifecycleStatusSchema,
  assigned_site_name: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
  retry_count: z.number().int().default(0),
  admin_notes: z.string().nullable().optional(),
  creation: z.string(),
  modified: z.string(),
  latest_job: ProvisioningJobSchema.nullable().optional(),
  audit_logs: z.array(ProvisioningAuditLogSchema).default([]),
  tenant: TenantRecordSchema.nullable().optional(),
});
export type OnboardingDetailRecord = z.infer<typeof OnboardingDetailRecordSchema>;

/** Admin Action Payloads */
export const ApproveOnboardingPayloadSchema = z.object({
  request_id: z.string().min(1),
  notes: z.string().max(1000).optional(),
});
export type ApproveOnboardingPayload = z.infer<typeof ApproveOnboardingPayloadSchema>;

export const RejectOnboardingPayloadSchema = z.object({
  request_id: z.string().min(1),
  reason: z.string().min(3).max(1000),
});
export type RejectOnboardingPayload = z.infer<typeof RejectOnboardingPayloadSchema>;

export const RetryProvisioningPayloadSchema = z.object({
  request_id: z.string().min(1),
  reason: z.string().max(1000).optional(),
});
export type RetryProvisioningPayload = z.infer<typeof RetryProvisioningPayloadSchema>;

export const SetTenantStatusPayloadSchema = z.object({
  tenant_id: z.string().min(1),
  new_status: TenantLifecycleStatusSchema,
  reason: z.string().min(3).max(1000),
});
export type SetTenantStatusPayload = z.infer<typeof SetTenantStatusPayloadSchema>;


/** Reserved hostnames that cannot be assigned as tenant domains or subdomains */
export const RESERVED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "admin",
  "api",
  "dashboard",
  "app",
  "www",
  "portal",
  "mail",
  "status",
  "billing",
  "auth",
  "support",
  "docs",
  "cdn",
  "assets",
  "backend",
  "frappe",
  "erpnext",
  "db",
  "redis",
]);

/**
 * Normalizes an incoming raw hostname string:
 * - Trims whitespace and converts to lowercase
 * - Strips protocol (http://, https://) if present
 * - Strips path and query string if present
 * - Strips port numbers (:8080, :3000)
 * - Strips trailing dot (.)
 */
export function normalizeHostname(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim().toLowerCase();

  // Strip protocol
  if (clean.includes("://")) {
    const afterProtocol = clean.split("://")[1];
    clean = afterProtocol ?? clean;
  }

  // Strip path or query
  const slashIdx = clean.indexOf("/");
  if (slashIdx !== -1) {
    clean = clean.slice(0, slashIdx);
  }
  const qIdx = clean.indexOf("?");
  if (qIdx !== -1) {
    clean = clean.slice(0, qIdx);
  }

  // Strip port (handle IPv6 brackets if any, or standard hostname:port)
  if (clean.includes(":") && !clean.endsWith("]")) {
    const lastColon = clean.lastIndexOf(":");
    clean = clean.slice(0, lastColon);
  }

  // Strip trailing dot
  while (clean.endsWith(".")) {
    clean = clean.slice(0, -1);
  }

  return clean;
}

/**
 * Validates a normalized hostname according to RFC 1123.
 */
export function validateHostname(raw: string): { valid: boolean; normalized: string; reason?: string } {
  const normalized = normalizeHostname(raw);
  if (!normalized) {
    return { valid: false, normalized, reason: "Hostname cannot be empty" };
  }
  if (normalized.length > 253) {
    return { valid: false, normalized, reason: "Hostname exceeds maximum length of 253 characters" };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return { valid: false, normalized, reason: "Raw IP addresses are not permitted as tenant hostnames" };
  }
  if (normalized.includes("..")) {
    return { valid: false, normalized, reason: "Hostname contains consecutive dots" };
  }

  const parsed = HostnameSchema.safeParse(normalized);
  if (!parsed.success) {
    return { valid: false, normalized, reason: parsed.error.issues[0]?.message ?? "Invalid hostname format" };
  }

  return { valid: true, normalized };
}

/**
 * Checks whether a given hostname is a reserved platform hostname.
 */
export function isReservedHostname(hostname: string, baseDomain?: string): boolean {
  const norm = normalizeHostname(hostname);
  if (RESERVED_HOSTNAMES.has(norm)) return true;

  if (baseDomain) {
    const normBase = normalizeHostname(baseDomain);
    if (norm === normBase) return true;
    if (norm.endsWith(`.${normBase}`)) {
      const sub = norm.slice(0, -(normBase.length + 1));
      if (RESERVED_HOSTNAMES.has(sub)) return true;
    }
  }

  return false;
}

export type TenantResolutionResult =
  | {
      success: true;
      tenant: TenantRecord;
      matchedOn: "primary_hostname" | "subdomain" | "custom_domain";
    }
  | {
      success: false;
      code:
        | "INVALID_HOSTNAME"
        | "RESERVED_HOSTNAME"
        | "TENANT_NOT_FOUND"
        | "HOSTNAME_UNVERIFIED"
        | "TENANT_INACTIVE"
        | "TENANT_SUSPENDED";
      message: string;
    };

/**
 * Resolves a verified tenant from an incoming hostname against a tenant registry.
 *
 * Rules:
 * - Normalizes and validates the hostname strictly.
 * - Rejects reserved platform domains.
 * - Matches primary_hostname, verified custom_domains, or <slug>.<baseDomain>.
 * - Rejects unverified hostnames.
 * - Rejects suspended or inactive tenants.
 * - Never returns a default or fallback tenant.
 */
export function resolveTenantByHostname(
  incomingHost: string,
  registry: TenantRecord[],
  options?: { baseDomain?: string },
): TenantResolutionResult {
  const val = validateHostname(incomingHost);
  if (!val.valid) {
    return {
      success: false,
      code: "INVALID_HOSTNAME",
      message: val.reason ?? "Invalid hostname",
    };
  }

  const host = val.normalized;

  if (isReservedHostname(host, options?.baseDomain)) {
    return {
      success: false,
      code: "RESERVED_HOSTNAME",
      message: `Hostname '${host}' is a reserved platform domain and cannot resolve to a tenant workspace`,
    };
  }

  let matchedTenant: TenantRecord | undefined;
  let matchedOn: "primary_hostname" | "subdomain" | "custom_domain" = "primary_hostname";

  // 1. Check exact primary hostname match
  matchedTenant = registry.find((t) => t.primary_hostname === host);
  if (matchedTenant) {
    matchedOn = "primary_hostname";
  }

  // 2. Check custom domains match
  if (!matchedTenant) {
    matchedTenant = registry.find((t) => t.custom_domains.includes(host));
    if (matchedTenant) {
      matchedOn = "custom_domain";
    }
  }

  // 3. Check base domain subdomain match (e.g. <slug>.departmentstore.in)
  if (!matchedTenant && options?.baseDomain) {
    const normBase = normalizeHostname(options.baseDomain);
    if (host.endsWith(`.${normBase}`)) {
      const candidateSlug = host.slice(0, -(normBase.length + 1));
      matchedTenant = registry.find((t) => t.slug === candidateSlug);
      if (matchedTenant) {
        matchedOn = "subdomain";
      }
    }
  }

  if (!matchedTenant) {
    return {
      success: false,
      code: "TENANT_NOT_FOUND",
      message: `No tenant registered for hostname '${host}'`,
    };
  }

  // Verify hostname status (primary or custom domain)
  if (matchedOn !== "subdomain" && matchedTenant.hostname_status !== "VERIFIED") {
    return {
      success: false,
      code: "HOSTNAME_UNVERIFIED",
      message: `Hostname '${host}' is registered but pending verification`,
    };
  }

  // Verify tenant lifecycle status
  if (matchedTenant.lifecycle_status === "SUSPENDED") {
    return {
      success: false,
      code: "TENANT_SUSPENDED",
      message: `Tenant workspace '${matchedTenant.name}' has been suspended. Please contact platform support.`,
    };
  }

  if (matchedTenant.lifecycle_status !== "ACTIVE") {
    return {
      success: false,
      code: "TENANT_INACTIVE",
      message: `Tenant workspace '${matchedTenant.name}' is currently in state '${matchedTenant.lifecycle_status}'`,
    };
  }

  return {
    success: true,
    tenant: matchedTenant,
    matchedOn,
  };
}

export type TenantAuthorizationResult =
  | {
      authorized: true;
      role: TenantRole | PlatformRole;
      elevated_platform_admin: boolean;
    }
  | {
      authorized: false;
      code:
        | "UNAUTHENTICATED"
        | "NO_MEMBERSHIP"
        | "MEMBERSHIP_INACTIVE"
        | "INSUFFICIENT_ROLE"
        | "CROSS_TENANT_ACCESS_DENIED";
      message: string;
    };

/**
 * Verifies that an authenticated user has authorized access to a target tenant.
 *
 * Rules:
 * - PLATFORM_ADMIN users receive authorized access marked with elevated_platform_admin: true for audit logging.
 * - Standard users must have an ACTIVE membership record specifically for target tenant_id.
 * - Cross-tenant access attempts are strictly rejected.
 * - If requiredRoles is provided, user's role must be in the required set.
 */
export function authorizeTenantAccess(
  user: { user_id: string; platform_role?: PlatformRole | null },
  targetTenantId: string,
  userMemberships: TenantMembership[],
  requiredRoles?: TenantRole[],
): TenantAuthorizationResult {
  if (!user || !user.user_id) {
    return {
      authorized: false,
      code: "UNAUTHENTICATED",
      message: "User session is required for tenant access",
    };
  }

  // Platform admin elevated access
  if (user.platform_role === "PLATFORM_ADMIN") {
    return {
      authorized: true,
      role: "PLATFORM_ADMIN",
      elevated_platform_admin: true,
    };
  }

  // Look for active membership specifically for this user in target tenant
  const userSpecificMemberships = userMemberships.filter((m) => m.user_id === user.user_id);
  const membership = userSpecificMemberships.find((m) => m.tenant_id === targetTenantId);

  if (!membership) {
    // Check if user has memberships in other tenants (attempted cross-tenant access)
    if (userSpecificMemberships.length > 0) {
      return {
        authorized: false,
        code: "CROSS_TENANT_ACCESS_DENIED",
        message: `User '${user.user_id}' does not have membership in tenant '${targetTenantId}'`,
      };
    }
    return {
      authorized: false,
      code: "NO_MEMBERSHIP",
      message: `User '${user.user_id}' has no membership in tenant '${targetTenantId}'`,
    };
  }

  if (membership.status !== "ACTIVE") {
    return {
      authorized: false,
      code: "MEMBERSHIP_INACTIVE",
      message: `User membership in tenant '${targetTenantId}' is ${membership.status}`,
    };
  }

  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(membership.role)) {
      return {
        authorized: false,
        code: "INSUFFICIENT_ROLE",
        message: `Role '${membership.role}' does not have required permissions: [${requiredRoles.join(", ")}]`,
      };
    }
  }

  return {
    authorized: true,
    role: membership.role,
    elevated_platform_admin: false,
  };
}
