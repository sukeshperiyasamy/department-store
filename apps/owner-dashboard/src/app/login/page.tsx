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
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="page">
      <h1>Owner Dashboard — Sign in</h1>
      <p className="muted">
        Uses the store ERP accounts. Managers and owners with reporting access.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form action={loginAction}>
        <label>
          Username
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="button" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}
