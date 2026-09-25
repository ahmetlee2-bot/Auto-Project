"use strict";

const { adminClient, defaultTenantId, isConfigured } = require("./supabase");

function assertDatabase() {
  if (!isConfigured()) throw Object.assign(new Error("Supabase bağlantısı yapılandırılmamış."), { status: 503, code: "DATABASE_NOT_CONFIGURED" });
}

function tenant(context = {}) {
  const tenantId = context.tenantId || defaultTenantId;
  if (!tenantId) throw Object.assign(new Error("SUPABASE_DEFAULT_TENANT_ID veya kullanıcı tenant üyeliği gerekli."), { status: 503, code: "TENANT_NOT_CONFIGURED" });
  return tenantId;
}

async function listLegacyMappings(context) {
  assertDatabase();
  const { data, error } = await adminClient.from("legacy_listing_mappings").select("*")
    .eq("tenant_id", tenant(context)).order("updated_at", { ascending: false });
  if (error) throw new Error(`Legacy eşleşmeleri okunamadı: ${error.message}`);
  return data || [];
}

async function upsertLegacyMapping(context, mapping) {
  assertDatabase();
  const row = {
    tenant_id: tenant(context), ebay_item_id: String(mapping.itemId), amazon_asin: String(mapping.asin),
    amazon_url: String(mapping.amazonUrl), title: String(mapping.title || ""), ebay_sku: String(mapping.sku || ""),
    ebay_offer_id: String(mapping.offerId || ""), ebay_price: Number(mapping.ebayPrice || 0) || null,
    ebay_quantity: Number(mapping.ebayQuantity ?? 1), target_margin_percent: Number(mapping.targetMarginPercent ?? 20),
    status: "ACTIVE", updated_at: new Date().toISOString(),
  };
  const { data, error } = await adminClient.from("legacy_listing_mappings").upsert(row, { onConflict: "tenant_id,ebay_item_id" }).select().single();
  if (error) throw new Error(`Legacy eşleşmesi kaydedilemedi: ${error.message}`);
  return data;
}

async function deleteLegacyMapping(context, itemId) {
  assertDatabase();
  const { error } = await adminClient.from("legacy_listing_mappings").delete()
    .eq("tenant_id", tenant(context)).eq("ebay_item_id", String(itemId));
  if (error) throw new Error(`Legacy eşleşmesi silinemedi: ${error.message}`);
  return { removed: true, itemId: String(itemId) };
}

async function recordApiError(context, event) {
  if (!isConfigured()) return null;
  const tenantId = context?.tenantId || defaultTenantId || null;
  const row = {
    tenant_id: tenantId, user_id: context?.userId || null, stage: String(event.stage || "UNKNOWN"),
    error_code: String(event.error?.code || event.code || ""), message: String(event.error?.message || event.message || ""),
    request_id: String(event.error?.requestId || event.requestId || ""), operation: String(event.error?.operation || event.operation || ""),
    details: event.error?.details || event.details || {}, context: event,
  };
  const { error } = await adminClient.from("api_error_events").insert(row);
  if (error) console.error("SUPABASE AUDIT ERROR:", error.message);
  return !error;
}

module.exports = { deleteLegacyMapping, listLegacyMappings, recordApiError, upsertLegacyMapping };
