import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Boxes,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCw,
  Settings,
} from "lucide-react";
import { Shell, type NavItem } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const hasSession = Boolean((await cookies()).get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);
  if (!hasSession && !hasToken) redirect("/login");

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
    { href: "/catalog", label: "Catalog", icon: <Package size={16} /> },
    { href: "/sales", label: "Sales", icon: <Receipt size={16} /> },
    { href: "/inventory", label: "Inventory", icon: <Boxes size={16} /> },
    { href: "/sync", label: "Sync & Health", icon: <RefreshCw size={16} /> },
    { href: "/settings", label: "Settings", icon: <Settings size={16} /> },
    { href: "/billing", label: "Billing & Plans", icon: <CreditCard size={16} /> },
  ];
  return <Shell items={items}>{children}</Shell>;
}
