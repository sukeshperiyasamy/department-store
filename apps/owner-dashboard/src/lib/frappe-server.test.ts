import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchOwnerSummary,
  fetchServerStatus,
  fetchStockAlerts,
  fetchCatalogSnapshot,
  fetchRecentInvoices,
  fetchStoreSettings,
  getBillingOverview,
  DashboardAuthError,
} from "./frappe-server";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe("Frappe Server API Transport & 7 Endpoints", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ERP_BASE_URL", "http://localhost:8080");
    vi.stubEnv("DASHBOARD_API_KEY", "test_key");
    vi.stubEnv("DASHBOARD_API_SECRET", "test_secret");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("1. fetchOwnerSummary calls correct route and parses schema", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          business_date: "2026-10-28",
          generated_at: "2026-10-28T07:00:00Z",
          gross_sales: 15000,
          net_sales: 12500,
          taxes_collected: 2500,
          returns_total: 0,
          net_sales_after_returns: 12500,
          bills: 25,
          average_bill_value: 600,
          returns_count: 0,
          payment_split: [{ mode_of_payment: "Cash", amount: 15000 }],
          cashier_split: [{ cashier: "cashier@demo.store", bills: 25, gross_sales: 15000 }],
        },
      }),
    } as Response);

    const summary = await fetchOwnerSummary("2026-10-28");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.reports.owner_summary",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token test_key:test_secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ business_date: "2026-10-28" }),
      }),
    );
    expect(summary.gross_sales).toBe(15000);
    expect(summary.bills).toBe(25);
  });

  it("2. fetchServerStatus calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          generated_at: "2026-10-28T07:00:00Z",
          frappe_version: "15.82.0",
          apps: ["frappe", "erpnext", "departmental_store"],
          database: { engine: "MariaDB", version: "10.6", innodb_deadlocks: 0 },
          devices: [],
          processing_transactions: [],
          review_queue: [],
        },
      }),
    } as Response);

    const status = await fetchServerStatus();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.reports.server_status",
      expect.any(Object),
    );
    expect(status.apps).toContain("departmental_store");
  });

  it("3. fetchStockAlerts calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          generated_at: "2026-10-28T07:00:00Z",
          days_to_expiry: 30,
          out_of_stock: [],
          low_stock: [],
          expiring: [],
        },
      }),
    } as Response);

    const alerts = await fetchStockAlerts(30);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.reports.stock_alerts",
      expect.objectContaining({
        body: JSON.stringify({ days_to_expiry: 30 }),
      }),
    );
    expect(alerts.days_to_expiry).toBe(30);
  });

  it("4. fetchCatalogSnapshot calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          generated_at: "2026-10-28T07:00:00Z",
          checkpoint: "2026-10-28 07:00:00",
          price_list: "Standard Selling",
          currency: "INR",
          items: [],
          tax_templates: [],
          payment_modes: [],
          is_incremental: false,
        },
      }),
    } as Response);

    const snapshot = await fetchCatalogSnapshot();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.catalog.catalog_snapshot",
      expect.any(Object),
    );
    expect(snapshot.currency).toBe("INR");
  });

  it("5. fetchRecentInvoices calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          generated_at: "2026-10-28T07:00:00Z",
          invoices: [
            {
              name: "SINV-26-0001",
              customer: "Walk-in",
              posting_date: "2026-10-28",
              posting_time: "07:30:00",
              status: "Paid",
              base_grand_total: 150,
              is_return: 0,
              owner: "cashier@demo.store",
            },
          ],
        },
      }),
    } as Response);

    const invoices = await fetchRecentInvoices(5);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.reports.recent_invoices",
      expect.objectContaining({
        body: JSON.stringify({ limit: 5 }),
      }),
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.name).toBe("SINV-26-0001");
  });

  it("6. fetchStoreSettings calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          flags: {
            voice_assistant_enabled: false,
            voice_hold_shortcut_enabled: false,
            ai_provider_enabled: false,
            mcp_adapter_enabled: false,
            camera_product_capture_enabled: false,
            batch_expiry_enabled: true,
            expiry_notifications_enabled: true,
            regional_catalog_enabled: true,
            receipt_printing_enabled: true,
            barcode_label_printing_enabled: true,
          },
          expiry_warning_days: "7,30,60",
          profile: {
            store_name: "Demo Store",
            store_phone: "9876543210",
            store_address: "123 Main St",
            receipt_header: "Welcome",
            receipt_footer: "Thank you",
            business_hours: "9 AM - 9 PM",
            tax_number: "GSTIN123",
            currency_symbol: "₹",
            date_format: "DD-MM-YYYY",
          },
        },
      }),
    } as Response);

    const settings = await fetchStoreSettings();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.settings.get_settings",
      expect.any(Object),
    );
    expect(settings.profile?.store_name).toBe("Demo Store");
  });

  it("7. getBillingOverview calls correct route", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 1,
          customer: {
            customer_id: "cust-1",
            business_name: "Demo Store",
            billing_email: "billing@demo.store",
            phone: "+919876543210",
            state_code: "33",
            gstin: null,
            created_at: "2026-10-28T00:00:00Z",
          },
          subscription: {
            subscription_id: "sub-1",
            customer_id: "cust-1",
            tenant_id: "tenant-1",
            plan_id: "professional",
            plan_version: "v1",
            status: "ACTIVE",
            billing_interval: "MONTHLY",
            current_period_start: "2026-10-28T00:00:00Z",
            current_period_end: "2026-11-28T00:00:00Z",
            trial_end: null,
            cancel_at_period_end: false,
            cancelled_at: null,
            grace_period_end: null,
            provider_name: "razorpay_sandbox",
            provider_subscription_id: null,
            provider_customer_id: null,
            created_at: "2026-10-28T00:00:00Z",
            updated_at: "2026-10-28T00:00:00Z",
          },
          plan: {
            plan_id: "professional",
            plan_name: "Professional",
            plan_version: "v1",
            price_paise_monthly: 599900,
            price_paise_annual: 5999000,
            currency: "INR",
            description: "Full retail suite",
            is_active: true,
          },
          entitlements: {
            max_counters: 5,
            max_skus: 50000,
            max_users: 10,
            enable_multi_device_pos: true,
            enable_whatsapp_receipts: true,
            enable_gst_e_invoicing: true,
            enable_tally_export: true,
            enable_offline_durable_queue: true,
          },
          counters_active: 2,
          counters_limit: 5,
          recent_invoices: [],
        },
      }),
    } as Response);

    const overview = await getBillingOverview("tenant-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/method/departmental_store.api.billing.get_billing_overview",
      expect.objectContaining({
        body: JSON.stringify({ tenant_id: "tenant-1" }),
      }),
    );
    expect(overview.subscription?.status).toBe("ACTIVE");
    expect(overview.plan?.plan_name).toBe("Professional");
  });

  it("handles HTTP 404 cleanly by throwing error with status and method name", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Method not found" }),
    } as Response);

    await expect(fetchOwnerSummary()).rejects.toThrow(
      "Method not found",
    );
  });

  it("handles HTTP 401/403 by throwing DashboardAuthError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ exc_type: "PermissionError" }),
    } as Response);

    await expect(fetchOwnerSummary()).rejects.toThrow(DashboardAuthError);
  });

  it("rejects when ERP response fails contract validation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          api_version: 999, // invalid version
        },
      }),
    } as Response);

    await expect(fetchOwnerSummary()).rejects.toThrow("failed contract validation");
  });
});
