import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { EbayDashboard } from "../../components/ebay-dashboard";

export const metadata: Metadata = { title: { absolute: "Dashboard | AutoLister Operations" }, robots: { index: false, follow: false } };

export default async function DashboardPage() { const supabase = await createClient(); const { data } = await supabase.auth.getClaims(); const claims = data?.claims; if (!claims) redirect("/login?next=/dashboard"); return <EbayDashboard email={String(claims.email || "")} />; }
