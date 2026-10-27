import { describe, expect, it } from "vitest";
import { validateEnv, redactSecret } from "./env";

describe("Environment Configuration & Validation", () => {
  it("validates valid dev environment and applies defaults", () => {
    const env = validateEnv({
      NODE_ENV: "development",
      ERP_BASE_URL: "http://localhost:8080",
    });
    expect(env.NODE_ENV).toBe("development");
    expect(env.ERP_BASE_URL).toBe("http://localhost:8080");
    expect(env.BASE_DOMAIN).toBe("departmentstore.in");
    expect(env.TRUSTED_PROXY_IPS).toBe("127.0.0.1,::1");
  });

  it("fails closed in production when ERP_BASE_URL is invalid", () => {
    expect(() => {
      validateEnv({
        NODE_ENV: "production",
        ERP_BASE_URL: "not-a-valid-url",
      });
    }).toThrow(/Environment validation failed/);
  });

  it("fails closed in production when ERP_BASE_URL is missing", () => {
    expect(() => {
      validateEnv({
        NODE_ENV: "production",
        ERP_BASE_URL: undefined,
      });
    }).toThrow(/Environment validation failed/);
  });

  it("passes in production with valid URL and custom domain", () => {
    const env = validateEnv({
      NODE_ENV: "production",
      ERP_BASE_URL: "https://erp.example.com",
      BASE_DOMAIN: "example.com",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.ERP_BASE_URL).toBe("https://erp.example.com");
    expect(env.BASE_DOMAIN).toBe("example.com");
  });

  it("redacts sensitive secrets properly", () => {
    expect(redactSecret(undefined)).toBe("[NOT_SET]");
    expect(redactSecret("")).toBe("[NOT_SET]");
    expect(redactSecret("abc")).toBe("****");
    expect(redactSecret("supersecretapikey12345")).toBe("su****45");
  });
});
