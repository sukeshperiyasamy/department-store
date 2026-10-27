import { Metadata } from "next";
import Link from "next/link";
import { verifyContactToken } from "@/lib/frappe-server";

export const metadata: Metadata = {
  title: "Verify Contact Address — Department Store ERP",
  description: "Verify your email address to advance your store onboarding application.",
};

export default async function OnboardingVerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ request_id?: string; token?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const requestId = resolvedParams.request_id || "";
  const token = resolvedParams.token || "";

  let success = false;
  let message = "";

  if (requestId && token) {
    try {
      const res = await verifyContactToken(requestId, token);
      success = true;
      message = res.message || "Email address verified successfully.";
    } catch (err) {
      success = false;
      message = err instanceof Error ? err.message : "Verification failed or token expired.";
    }
  } else {
    message = "Missing verification request ID or token parameters.";
  }

  const trackerUrl = `/onboarding/status?request_id=${encodeURIComponent(requestId)}`;

  return (
    <div style={{ padding: "60px 0 100px" }}>
      <div className="mkt-container" style={{ maxWidth: 600 }}>
        <div className="form-card" style={{ padding: "48px 36px", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: success ? "var(--success-soft)" : "var(--error-soft)",
              color: success ? "var(--success)" : "var(--error)",
              fontSize: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            {success ? "✓" : "!"}
          </div>

          <h1 style={{ fontSize: 26, margin: "0 0 12px", color: "var(--text)" }}>
            {success ? "Email Verified Successfully" : "Verification Failed"}
          </h1>

          <p style={{ color: "var(--muted)", fontSize: "var(--fs-md)", lineHeight: 1.6, margin: "0 0 24px" }}>
            {message}
          </p>

          {requestId && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "16px 20px",
                textAlign: "left",
                fontSize: "var(--fs-sm)",
                marginBottom: 28,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--muted)" }}>Reference ID:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>
                  {requestId}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Next Step:</span>
                <span style={{ fontWeight: 600 }}>
                  {success ? "Platform Business Review" : "Request New Verification Email"}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            {requestId ? (
              <Link href={trackerUrl} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                View Onboarding Status Portal →
              </Link>
            ) : (
              <Link href="/register" className="btn btn-primary" style={{ padding: "10px 24px" }}>
                Go to Shop Registration
              </Link>
            )}
            <Link href="/" className="btn btn-outline" style={{ padding: "10px 20px" }}>
              Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
