import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Department Store — Owner Dashboard",
  description: "Sales, inventory and sync health for the departmental store",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
