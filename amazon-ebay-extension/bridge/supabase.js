"use strict";

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "");
const secretKey = String(process.env.SUPABASE_SECRET_KEY || "");
const defaultTenantId = String(process.env.SUPABASE_DEFAULT_TENANT_ID || "");

const commonOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const authClient = supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey, commonOptions) : null;
const adminClient = supabaseUrl && secretKey ? createClient(supabaseUrl, secretKey, commonOptions) : null;

function isConfigured() {
  return Boolean(authClient && adminClient);
}

function bearerToken(request) {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function authenticateRequest(request, { required = false } = {}) {
  const token = bearerToken(request);
  if (!token) {
    if (required) throw Object.assign(new Error("Supabase oturumu gerekli."), { status: 401, code: "AUTH_REQUIRED" });
    return { userId: "", tenantId: defaultTenantId, claims: null };
  }
  if (!authClient) throw Object.assign(new Error("Supabase Auth yapılandırılmamış."), { status: 503, code: "AUTH_NOT_CONFIGURED" });
  const { data, error } = await authClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw Object.assign(new Error("Supabase oturumu geçersiz veya süresi dolmuş."), { status: 401, code: "INVALID_JWT" });
  const userId = String(data.claims.sub);
  if (!adminClient) throw Object.assign(new Error("Supabase backend istemcisi yapılandırılmamış."), { status: 503, code: "DATABASE_NOT_CONFIGURED" });
  const { data: membership, error: membershipError } = await adminClient
    .from("memberships").select("tenant_id").eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (membershipError) throw new Error(`Tenant üyeliği okunamadı: ${membershipError.message}`);
  const tenantId = membership?.tenant_id || defaultTenantId;
  if (!tenantId) throw Object.assign(new Error("Kullanıcının bağlı olduğu bir tenant bulunamadı."), { status: 403, code: "TENANT_REQUIRED" });
  return { userId, tenantId, claims: data.claims };
}

module.exports = { adminClient, authenticateRequest, defaultTenantId, isConfigured };
