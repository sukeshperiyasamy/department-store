"use client";
import Link from "next/link";

export function Nav({ active }: { active: string }) {
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/sync", label: "Sync & Server" },
  ];
  return (
    <nav className="nav" style={{ maxWidth: 1100 - 48, margin: "0 auto 20px", borderRadius: 10, border: "1px solid var(--border)" }}>
      <span className="brand">Department Store</span>
      {items.map((item) => (
        <Link key={item.href} href={item.href} style={{ fontWeight: item.href === active ? 700 : 400 }}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
