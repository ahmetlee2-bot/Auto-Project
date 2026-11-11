(() => {
  function parseGermanShippingAddress(raw = {}) {
    const fullName = String(raw.fullName || "").trim();
    const rawLine1 = String(raw.addressLine1 || "").trim();
    const rawLine2 = String(raw.addressLine2 || "").trim();
    const postalCode = String(raw.postalCode || "").trim().replace(/\s+/g, "");
    const city = String(raw.city || "").trim();
    const countryCode = String(raw.countryCode || "DE").trim().toUpperCase();
    const phoneNumber = String(raw.phoneNumber || "").trim();

    let isPackstation = false;
    let packstationNumber = null;
    let postNumber = null;

    const packstationRegex = /(?:Packstation|Postfiliale)\s*(\d+)/i;
    const postNumRegex = /(?:Postnummer|Post-Nummer|Kundennummer|Post-Nr\.?|Knd\.?-Nr\.?)\s*[:#]?\s*(\d{6,12})/i;
    const barePostNumRegex = /\b\d{6,10}\b/;

    const packMatch = rawLine1.match(packstationRegex) || rawLine2.match(packstationRegex);
    if (packMatch) {
      isPackstation = true;
      packstationNumber = packMatch[1];
      const postMatch = rawLine1.match(postNumRegex) || rawLine2.match(postNumRegex) || rawLine2.match(barePostNumRegex);
      if (postMatch) {
        postNumber = postMatch[1] || postMatch[0];
      }
    }

    let street = rawLine1;
    let houseNumber = "";

    if (isPackstation) {
      street = `Packstation ${packstationNumber || ""}`.trim();
      houseNumber = "";
    } else {
      const streetHouseMatch = rawLine1.match(/^(.+?)\s+([0-9]+(?:\s*[-/]\s*[0-9]+)?(?:\s*[a-zA-Z])?)\s*$/);
      if (streetHouseMatch) {
        street = streetHouseMatch[1].trim();
        houseNumber = streetHouseMatch[2].trim();
      } else {
        const attachedMatch = rawLine1.match(/^(.+?)\.?\s*([0-9]+[a-zA-Z]?)$/);
        if (attachedMatch && !/^\d+$/.test(attachedMatch[1])) {
          street = attachedMatch[1].trim();
          houseNumber = attachedMatch[2].trim();
        }
      }
    }

    const addressLine2 = isPackstation && postNumber ? `PostNumber: ${postNumber}` : rawLine2;

    const lines = [
      fullName,
      postNumber && isPackstation ? `PostNummer: ${postNumber}` : null,
      isPackstation ? street : `${street} ${houseNumber}`.trim(),
      !isPackstation && addressLine2 ? addressLine2 : null,
      `${postalCode} ${city}`.trim(),
      countryCode === "DE" ? "Deutschland" : countryCode,
      phoneNumber ? `Tel: ${phoneNumber}` : null,
    ].filter(Boolean);

    return {
      fullName,
      isPackstation,
      packstationNumber,
      postNumber,
      street,
      houseNumber,
      addressLine2,
      postalCode,
      city,
      countryCode,
      phoneNumber,
      formattedText: lines.join("\n"),
    };
  }

  globalThis.AlltaghausAddress = { parseGermanShippingAddress };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseGermanShippingAddress };
  }
})();
