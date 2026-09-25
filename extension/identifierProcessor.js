(() => {
  function normalizeEan(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidEan(value) {
    const ean = normalizeEan(value);
    if (![8, 13].includes(ean.length)) return false;
    const digits = [...ean].map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  function resolveEan(value, { explicitlyNotApplicable = false } = {}) {
    const ean = normalizeEan(value);
    if (isValidEan(ean)) return { value: ean, status: "VALID" };
    if (explicitlyNotApplicable && !ean) return { value: null, status: "NOT_APPLICABLE" };
    return { value: null, status: ean ? "INVALID" : "MISSING" };
  }

  globalThis.AlltaghausIdentifier = { normalizeEan, isValidEan, resolveEan };
})();
