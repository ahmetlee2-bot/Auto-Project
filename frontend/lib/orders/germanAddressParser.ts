export type RawShippingAddress = {
  fullName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phoneNumber?: string | null;
};

export type ParsedGermanAddress = {
  fullName: string;
  isPackstation: boolean;
  packstationNumber: string | null;
  postNumber: string | null; // PostNummer / Kundennummer
  street: string;
  houseNumber: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phoneNumber: string;
  formattedText: string;
};

/**
 * Parses German addresses from eBay orders into Amazon/Joybuy form-compatible components.
 * Properly separates Street name and House number (e.g. "Musterstraße 12a", "Packstation 123", "Hauptstr. 4b").
 */
export function parseGermanShippingAddress(raw: RawShippingAddress): ParsedGermanAddress {
  const fullName = (raw.fullName || "").trim();
  const rawLine1 = (raw.addressLine1 || "").trim();
  const rawLine2 = (raw.addressLine2 || "").trim();
  const postalCode = (raw.postalCode || "").trim().replace(/\s+/g, "");
  const city = (raw.city || "").trim();
  const countryCode = (raw.countryCode || "DE").trim().toUpperCase();
  const phoneNumber = (raw.phoneNumber || "").trim();

  let isPackstation = false;
  let packstationNumber: string | null = null;
  let postNumber: string | null = null;

  // Check Packstation in Line1 or Line2
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

  // Normal Street + House number separation
  // German street format is usually: [Street Name] [House Number + optional letter / suffix]
  // e.g., "Hauptstraße 45", "Am Rathaus 12 a", "Wiesenweg 3-5", "Berliner Str. 104b"
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
      // Fallback: Check if house number is attached without space, e.g., "Musterstr.12"
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
  ].filter(Boolean) as string[];

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
