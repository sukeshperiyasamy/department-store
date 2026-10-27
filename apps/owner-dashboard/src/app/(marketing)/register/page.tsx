import { RegisterShopForm } from "@/components/RegisterShopForm";

export const metadata = {
  title: "Register Your Shop — Department Store ERP",
  description:
    "Reserve your store subdomain and submit an onboarding request for multi-counter billing and ERPNext management.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialPlan = resolvedParams.plan || "starter";

  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div className="mkt-container">
        <div className="mkt-section-head">
          <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 12px", borderRadius: 999, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 12 }}>
            Phase 2 Store Onboarding
          </div>
          <h1>Register Your Retail Business</h1>
          <p>
            Join Indian retailers running high-speed, crash-proof Windows billing counters with cloud-authoritative ERPNext inventory.
          </p>
        </div>

        <RegisterShopForm initialPlan={initialPlan} />
      </div>
    </div>
  );
}
