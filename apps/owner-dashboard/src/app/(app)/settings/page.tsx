import { fetchServerStatus, fetchStoreSettings } from "@/lib/frappe-server";
import { SettingsClient } from "@/components/SettingsClient";
import { type ServerStatus, type StoreSettings } from "@departmental/shared-types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings: StoreSettings | null = null;
  let status: ServerStatus | null = null;
  let loadError: string | null = null;

  const [settingsRes, statusRes] = await Promise.allSettled([
    fetchStoreSettings(),
    fetchServerStatus(),
  ]);

  if (settingsRes.status === "fulfilled") {
    settings = settingsRes.value;
  } else {
    loadError =
      settingsRes.reason instanceof Error
        ? settingsRes.reason.message
        : String(settingsRes.reason);
  }

  if (statusRes.status === "fulfilled") {
    status = statusRes.value;
  } else if (!loadError) {
    loadError =
      statusRes.reason instanceof Error
        ? statusRes.reason.message
        : String(statusRes.reason);
  }

  return (
    <SettingsClient
      initialSettings={settings}
      serverStatus={status}
      loadError={loadError}
    />
  );
}
