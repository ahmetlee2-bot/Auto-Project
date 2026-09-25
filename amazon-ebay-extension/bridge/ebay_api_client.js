"use strict";

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xmlValue(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function normalizeParameters(parameters) {
  if (!Array.isArray(parameters)) return [];
  return parameters.map((parameter) => ({
    name: String(parameter?.name || ""),
    value: String(parameter?.value || ""),
  })).filter((parameter) => parameter.name || parameter.value);
}

function restErrors(body, status) {
  const items = Array.isArray(body?.errors) ? body.errors : [];
  if (!items.length) {
    return [{
      errorCode: String(body?.errorId || status || "UNKNOWN"),
      shortMessage: String(body?.message || body?.error || `eBay HTTP ${status}`),
      longMessage: String(body?.longMessage || body?.error_description || ""),
      domain: String(body?.domain || ""),
      category: String(body?.category || ""),
      parameters: normalizeParameters(body?.parameters),
    }];
  }
  return items.map((item) => ({
    errorCode: String(item?.errorId || status || "UNKNOWN"),
    shortMessage: String(item?.message || "eBay request failed"),
    longMessage: String(item?.longMessage || ""),
    domain: String(item?.domain || ""),
    category: String(item?.category || ""),
    parameters: normalizeParameters(item?.parameters),
  }));
}

function tradingErrors(xml, status) {
  const blocks = [...String(xml || "").matchAll(/<Errors>([\s\S]*?)<\/Errors>/gi)].map((match) => match[1]);
  const source = blocks.length ? blocks : [xml];
  return source.map((block) => ({
    errorCode: xmlValue(block, "ErrorCode") || String(status || "UNKNOWN"),
    shortMessage: xmlValue(block, "ShortMessage") || `Trading API HTTP ${status}`,
    longMessage: xmlValue(block, "LongMessage"),
    severity: xmlValue(block, "SeverityCode"),
    classification: xmlValue(block, "ErrorClassification"),
    parameters: [...String(block || "").matchAll(/<ErrorParameters[^>]*ParamID="([^"]+)"[^>]*>[\s\S]*?<Value>([\s\S]*?)<\/Value>[\s\S]*?<\/ErrorParameters>/gi)]
      .map((match) => ({ name: decodeXml(match[1]), value: decodeXml(match[2]).trim() })),
  }));
}

function errorLine(item) {
  const message = item.longMessage || item.shortMessage || "Unknown eBay error";
  const parameters = item.parameters?.length
    ? ` (${item.parameters.map((parameter) => `${parameter.name}=${parameter.value}`).join(", ")})`
    : "";
  return `eBay ${item.errorCode}: ${message}${parameters}`;
}

class EbayApiError extends Error {
  constructor({ stage, operation, status, method, endpoint, requestId, errors, cause }) {
    const normalizedErrors = errors?.length ? errors : [{ errorCode: String(status || "UNKNOWN"), shortMessage: cause?.message || "eBay request failed", longMessage: "", parameters: [] }];
    super(`[${stage}] ${normalizedErrors.map(errorLine).join(" | ")}`);
    this.name = "EbayApiError";
    this.code = normalizedErrors[0].errorCode;
    this.stage = stage;
    this.operation = operation;
    this.status = status || 0;
    this.method = method;
    this.endpoint = endpoint;
    this.requestId = requestId || "";
    this.details = normalizedErrors;
    if (cause) this.cause = cause;
  }
}

function requestIdFrom(response) {
  return response?.headers?.get?.("x-ebay-c-request-id")
    || response?.headers?.get?.("x-ebay-correlation-id")
    || response?.headers?.get?.("x-ebay-request-id")
    || "";
}

function createRestError({ response, body, stage, operation, method, endpoint, cause }) {
  return new EbayApiError({
    stage, operation, method, endpoint, cause,
    status: response?.status || 0,
    requestId: requestIdFrom(response),
    errors: restErrors(body, response?.status),
  });
}

function createTradingError({ response, xml, stage, operation, method = "POST", endpoint }) {
  return new EbayApiError({
    stage, operation, method, endpoint,
    status: response?.status || 0,
    requestId: requestIdFrom(response),
    errors: tradingErrors(xml, response?.status),
  });
}

function toPublicError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: String(error?.code || ""),
    stage: String(error?.stage || "UNKNOWN"),
    operation: String(error?.operation || ""),
    status: Number(error?.status || 0),
    requestId: String(error?.requestId || ""),
    details: Array.isArray(error?.details) ? error.details : [],
  };
}

function payloadSummary(body) {
  if (!body || typeof body !== "object") return {};
  return {
    sku: String(body.sku || ""),
    categoryId: String(body.categoryId || ""),
    titleLength: String(body.product?.title || body.title || "").length,
    descriptionLength: String(body.product?.description || body.listingDescription || body.description || "").length,
    imageCount: Array.isArray(body.product?.imageUrls) ? body.product.imageUrls.length : Array.isArray(body.imageUrls) ? body.imageUrls.length : 0,
    aspectCount: Object.keys(body.product?.aspects || body.itemSpecifics || {}).length,
    quantity: body.availableQuantity ?? body.availability?.shipToLocationAvailability?.quantity ?? body.quantity ?? null,
    price: body.pricingSummary?.price?.value ?? body.price ?? null,
  };
}

module.exports = { EbayApiError, createRestError, createTradingError, payloadSummary, toPublicError, tradingErrors, restErrors };
