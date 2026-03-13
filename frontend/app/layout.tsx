import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUTONOW Select",
  description: "Valuation-first cockpit for vehicle pricing, operator buy-box review, and comparables.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
