import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Department Store — Manager Console",
  description: "Sales, catalog, inventory and sync health for the departmental store",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
