import { NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";

export const runtime = "nodejs";

function configured(name: string, ...fallbackNames: string[]): boolean {
  return [name, ...fallbackNames].some((key) => {
    const value = process.env[key]?.trim() || "";
    return Boolean(value) && !/^(YOUR_|CHANGE_ME|GENERATE_)/i.test(value);
  });
}

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });

  const requirements = [
    { name: "EBAY_CLIENT_ID", ready: configured("EBAY_CLIENT_ID", "EBAY_APP_ID") },
    { name: "EBAY_CLIENT_SECRET", ready: configured("EBAY_CLIENT_SECRET", "EBAY_CERT_ID") },
    { name: "EBAY_MULTI_STORE_RU_NAME", ready: configured("EBAY_MULTI_STORE_RU_NAME", "EBAY_RU_NAME") },
    { name: "EBAY_TOKEN_ENCRYPTION_KEY", ready: configured("EBAY_TOKEN_ENCRYPTION_KEY") },
    { name: "EBAY_OAUTH_STATE_SECRET", ready: configured("EBAY_OAUTH_STATE_SECRET") },
  ];
  const environment = String(process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
  const missing = requirements.filter((item) => !item.ready).map((item) => item.name);

  return NextResponse.json({ configured: missing.length === 0, environment, missing }, {
    headers: { "Cache-Control": "no-store" },
  });
}
