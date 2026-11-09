import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sendungsverfolgung", robots: { index: false, follow: false, noarchive: true } };

export default function TrackingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
