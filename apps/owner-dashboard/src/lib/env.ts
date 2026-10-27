/**
 * Environment configuration validator with fail-closed behavior for production.
 *
 * Ensures critical environment variables are present and correctly typed at startup,
 * protecting against misconfiguration and preventing silent failures in production.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  ERP_BASE_URL: z.string().url("ERP_BASE_URL must be a valid URL"),
  DASHBOARD_API_KEY: z.string().optional(),
  DASHBOARD_API_SECRET: z.string().optional(),
  BASE_DOMAIN: z.string().min(1).default("departmentstore.in"),
  TRUSTED_PROXY_IPS: z.string().default("127.0.0.1,::1"),
  HEALTH_CHECK_TOKEN: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function validateEnv(customEnv?: Record<string, string | undefined>): AppEnv {
  const raw = customEnv ?? process.env;
  const isProd = (raw.NODE_ENV ?? process.env.NODE_ENV) === "production";

  const erpBaseUrl = raw.ERP_BASE_URL !== undefined && raw.ERP_BASE_URL !== "" 
    ? raw.ERP_BASE_URL 
    : (isProd ? undefined : "http://localhost:8080");

  const parsed = envSchema.safeParse({
    NODE_ENV: raw.NODE_ENV ?? "development",
    ERP_BASE_URL: erpBaseUrl,
    DASHBOARD_API_KEY: raw.DASHBOARD_API_KEY,
    DASHBOARD_API_SECRET: raw.DASHBOARD_API_SECRET,
    BASE_DOMAIN: raw.BASE_DOMAIN ?? "departmentstore.in",
    TRUSTED_PROXY_IPS: raw.TRUSTED_PROXY_IPS ?? "127.0.0.1,::1",
    HEALTH_CHECK_TOKEN: raw.HEALTH_CHECK_TOKEN,
  });

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");

    const errMsg = `[FATAL] Environment validation failed: ${errorDetails}`;
    if (isProd) {
      // Fail closed in production
      throw new Error(errMsg);
    } else {
      console.warn(`[WARN] ${errMsg}`);
      // Fallback in dev/test to allow local iteration
      return {
        NODE_ENV: "development",
        ERP_BASE_URL: "http://localhost:8080",
        BASE_DOMAIN: "departmentstore.in",
        TRUSTED_PROXY_IPS: "127.0.0.1,::1",
      };
    }
  }

  return parsed.data;
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Safely redacts sensitive secrets for safe logging and diagnostics.
 */
export function redactSecret(secret?: string | null): string {
  if (!secret) return "[NOT_SET]";
  if (secret.length <= 4) return "****";
  return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
}
