import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import "./dashboard.css";
import { StoreSwitcher } from "../../components/dashboard/StoreSwitcher";
import { StoreProvider } from "../../lib/ebay/StoreContext";
import { getRequestUser } from "../../lib/dashboard/server-auth";

const sections = [
  ["/dashboard", "Overview"],
  ["/dashboard/depot", "Product Depot"],
  ["/dashboard/queue", "Queue & Logs"],
  ["/dashboard/orders", "Orders"],
  ["/track", "Tracking 📦"],
  ["/dashboard/academy", "Academy"],
] as const;

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getRequestUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  return (
    <StoreProvider>
      <div className="proDashboardRoot">
        <header className="proDashboardNav">
          <Link className="proDashboardBrand" href="/dashboard" aria-label="AutoLister Dashboard">
            <span className="proBrandIcon">A</span>
            <span>AutoLister <small>PRO</small></span>
          </Link>
          <nav className="proDashboardLinks" aria-label="Dashboard navigation">
            {sections.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <StoreSwitcher />
        </header>
        {children}
      </div>
    </StoreProvider>
  );
}
