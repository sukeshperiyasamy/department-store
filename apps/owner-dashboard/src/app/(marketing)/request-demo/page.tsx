import { DemoRequestForm } from "@/components/DemoRequestForm";

export const metadata = {
  title: "Request a Store Demo — Department Store ERP",
  description:
    "Schedule an interactive demonstration of native Windows billing counters, offline synchronization, and ERPNext inventory control.",
};

export default function RequestDemoPage() {
  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div className="mkt-container">
        <div className="mkt-section-head">
          <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 12px", borderRadius: 999, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 12 }}>
            Interactive Walkthrough
          </div>
          <h1>See High-Speed Billing in Action</h1>
          <p>
            Experience sub-second barcode checkout, durable offline synchronization, and real-time manager reporting configured for Indian supermarkets.
          </p>
        </div>

        <DemoRequestForm />
      </div>
    </div>
  );
}
