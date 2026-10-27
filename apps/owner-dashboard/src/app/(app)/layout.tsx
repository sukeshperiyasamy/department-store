import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell, type NavItem } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const hasSession = Boolean((await cookies()).get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);
  if (!hasSession && !hasToken) redirect("/login");

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "▤" },
    { href: "/catalog", label: "Catalog", icon: "❑" },
    { href: "/sales", label: "Sales", icon: "₹" },
    { href: "/inventory", label: "Inventory", icon: "◱" },
    { href: "/sync", label: "Sync & Health", icon: "⇅" },
    { href: "/settings", label: "Settings", icon: "⚙" },
    { href: "/billing", label: "Billing & Plans", icon: "💳" },
  ];
  return <Shell items={items}>{children}</Shell>;
}
