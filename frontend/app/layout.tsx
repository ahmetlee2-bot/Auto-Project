import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUTONOW",
  description: "Deal intelligence cockpit for low-budget vehicle flipping.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

