(() => {
  function parsePrice(value) {
    const normalized = String(value || "")
      .replace(/[^\d,.]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const price = Number.parseFloat(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function charmPrice(value, ending = ".99") {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) return null;
    const cents = ending === ".95" ? 0.95 : 0.99;
    return (Math.ceil(price) - 1 + cents).toFixed(2);
  }

  function calculateSalePrice(sourcePrice, marginPercent = 20, ending = ".99") {
    const source = typeof sourcePrice === "number" ? sourcePrice : parsePrice(sourcePrice);
    const margin = Number(marginPercent) / 100;
    if (!source || !Number.isFinite(margin) || margin < 0 || margin >= 0.9) return null;
    return charmPrice(source / (1 - margin), ending);
  }

  globalThis.AlltaghausPrice = { parsePrice, charmPrice, calculateSalePrice };
})();
