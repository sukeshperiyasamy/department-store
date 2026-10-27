import "server-only";
import { headers } from "next/headers";
import { normalizeHostname } from "@departmental/shared-types";

export interface TenantContext {
  slug: string | null;
  host: string;
  isPlatform: boolean;
}

/**
 * Derives verified tenant context strictly on the server from request headers set by middleware.
 * Never relies on client-supplied body fields or client-side storage.
 */
export async function getTenantContext(): Promise<TenantContext> {
  const reqHeaders = await headers();
  const slug = reqHeaders.get("x-tenant-slug");
  const host = reqHeaders.get("x-tenant-host") ?? reqHeaders.get("host")?.split(":")[0] ?? "localhost";
  const tenantType = reqHeaders.get("x-tenant-type");

  return {
    slug: slug ? slug.trim().toLowerCase() : null,
    host: normalizeHostname(host),
    isPlatform: tenantType === "platform" || !slug,
  };
}

/**
 * Server-side guard asserting that the current request is operating within the expected tenant.
 */
export async function verifyTenantAccess(expectedSlug?: string): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (expectedSlug && ctx.slug !== expectedSlug.toLowerCase().trim()) {
    throw new Error(`Tenant context mismatch: expected '${expectedSlug}' but request is for '${ctx.slug}'`);
  }
  return ctx;
}
