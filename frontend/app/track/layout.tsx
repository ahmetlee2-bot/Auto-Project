import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aquiline Logistics · Offizielle Sendungsverfolgung",
  description: "Echtzeit-Sendungsverfolgung für innerdeutsche und grenzüberschreitende Paketsendungen.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function TrackingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
