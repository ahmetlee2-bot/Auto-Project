import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";

export async function getRequestUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export function isAutolisterAdmin(userId: string): boolean {
  const configured = (process.env.AUTOLISTER_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(userId.toLowerCase());
}

export function marketplaceFlag(marketplaceId: string): string {
  const flags: Record<string, string> = {
    EBAY_US: "🇺🇸",
    EBAY_DE: "🇩🇪",
    EBAY_GB: "🇬🇧",
    EBAY_AU: "🇦🇺",
    EBAY_CA: "🇨🇦",
    EBAY_FR: "🇫🇷",
    EBAY_IT: "🇮🇹",
    EBAY_ES: "🇪🇸",
  };
  return flags[marketplaceId] || "🌐";
}
