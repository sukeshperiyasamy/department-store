import { redirect } from "next/navigation";
import { loginAndCaptureSession } from "@/lib/frappe-server";

async function loginAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await loginAndCaptureSession(username, password);
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : "login failed")}`);
  }
  redirect("/app");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: 400, maxWidth: "100%", padding: 30 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>
            <span className="brand-name">Department Store</span>
            <br />
            <span className="brand-sub">Manager Console</span>
          </span>
        </div>
        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Uses your ERP account. Reporting access is enforced by the ERP.
        </p>
        {error && (
          <div className="error-banner" role="alert">{error}</div>
        )}
        <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label>
            Username
            <input name="username" autoComplete="username" required style={{ width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required
                   style={{ width: "100%", marginTop: 4 }} />
          </label>
          <button className="btn primary" type="submit" style={{ justifyContent: "center", padding: "10px 14px" }}>
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
