(() => {
  const EBAY_TOTAL_FEE_RATE = 0;

  function parsePrice(value) {
    const normalized = String(value || "")
      .replace(/[^\d,.]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const price = Number.parseFloat(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function charmPrice(value) {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return null;
    return (Math.ceil(price * 100 - 1e-8) / 100).toFixed(2);
  }

  function calculateSalePrice(sourcePrice, marginPercent = 20) {
    const source = typeof sourcePrice === "number" ? sourcePrice : parsePrice(sourcePrice);
    const margin = Number(marginPercent) / 100;
    if (!source || !Number.isFinite(margin) || margin < 0 || margin > 3) return null;
    const rawTarget = (source * (1 + margin)) / (1 - EBAY_TOTAL_FEE_RATE);
    return (Math.ceil(rawTarget * 100 - 1e-8) / 100).toFixed(2);
  }

  globalThis.AlltaghausPrice = { parsePrice, charmPrice, calculateSalePrice };
})();
