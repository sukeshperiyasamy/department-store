"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/app/actions";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

/** Application shell: light sidebar (fixed ≥900px, drawer below) + top header. */
export function Shell({
  items,
  children,
}: {
  items: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const activeLabel = items.find((i) => i.href === pathname)?.label ?? "Dashboard";

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>
            <span className="brand-name">Department Store</span>
            <br />
            <span className="brand-sub">Manager Console</span>
          </span>
        </div>
        <div className="nav-section">Operations</div>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${pathname === item.href ? " active" : ""}`}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
            {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
          </Link>
        ))}
        <div className="sidebar-foot">Light theme · data from your ERP</div>
      </nav>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn menu-btn"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <span className="topbar-title">{activeLabel}</span>
          <span className="topbar-right">
            <LogoutButton />
          </span>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn" type="submit" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <LogOut size={14} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </form>
  );
}
