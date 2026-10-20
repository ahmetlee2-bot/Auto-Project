import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { bearerUser } from "../supabase/bearer-user";
import { normalizeProductImages } from "../images/normalizeProductImages";

export async function draftRequestUser(request: Request): Promise<User | null> {
  const tokenUser = await bearerUser(request);
  if (tokenUser) return tokenUser;
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function parseDraftImages(value: unknown): string[] {
  return normalizeProductImages(value);
}

export function parseDraftAmazonUrl(value: unknown, asinValue?: unknown): { asin: string; sourceUrl: string } {
  const raw = String(value || "").trim();
  const asin = String(asinValue || "").trim().toUpperCase();
  const url = new URL(raw || `https://www.amazon.de/dp/${asin}`);
  if (url.protocol !== "https:" || !/(^|\.)amazon\.de$/i.test(url.hostname)) {
    throw new Error("Eine gültige Amazon.de-Produktseite ist erforderlich.");
  }
  const pathAsin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase();
  const resolvedAsin = asin || pathAsin;
  if (!resolvedAsin || !/^[A-Z0-9]{10}$/.test(resolvedAsin)) throw new Error("Eine gültige Amazon-ASIN ist erforderlich.");
  if (pathAsin && pathAsin !== resolvedAsin) throw new Error("ASIN und Amazon-Link stimmen nicht überein.");
  return { asin: resolvedAsin, sourceUrl: `https://www.amazon.de/dp/${resolvedAsin}` };
}
