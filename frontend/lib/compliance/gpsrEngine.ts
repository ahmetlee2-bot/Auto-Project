export type GpsrComplianceProfile = {
  regulationCode: "EU 2023/988 (GPSR)";
  manufacturerName: string;
  responsiblePersonEu: string;
  countryOfOrigin: string;
  ceMarkingRequired: boolean;
  weeeNote: string;
  packagingNote: string;
  safetyWarningsDe: string[];
  aspectsPatch: Record<string, string[]>;
};

function sanitizeBrand(brand?: string | null, title?: string): string {
  const candidate = (brand || "").trim();
  if (candidate && !["markenlos", "unbranded", "generic", "no name"].includes(candidate.toLowerCase())) {
    return candidate;
  }
  const firstWord = (title || "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{N}-]/gu, "");
  return firstWord && firstWord.length >= 2 ? firstWord : "EU-Handelsmarke";
}

export function buildGpsrComplianceInfo(input: {
  title: string;
  brand?: string | null;
  asin?: string | null;
  categoryId?: string | null;
  itemSpecifics?: Record<string, string[]>;
}): GpsrComplianceProfile {
  const text = `${input.title} ${input.brand || ""}`.toLowerCase();
  const manufacturerName = sanitizeBrand(input.brand, input.title);
  const modelCode = (input.asin || "STD-DE").toUpperCase();

  const isElectronic =
    /usb|led|akku|batterie|elektrisch|ladegerät|powerbank|sensor|lampe|leuchte|lichterkette|kocher|kaffeemaschine|entsafter|waage|heiz|lüfter|kabel|adapter/i.test(
      text,
    );
  const isKitchenFood =
    /küche|kaffee|trink|wasser|airfryer|heißluftfritteuse|backpapier|silikonform|schneidebrett|messer|flasche|kocher|entsafter|lebensmittel/i.test(
      text,
    );
  const isChildOrPet =
    /kind|baby|spielzeug|katze|hund|haustier|pet|kralle|brunnen/i.test(text);

  const safetyWarningsDe: string[] = [
    "Produkt nur bestimmungsgemäß und gemäß der beiliegenden Bedienungsanleitung verwenden.",
    "Verpackungsmaterialien (z. B. Folienbeutel) von Babys und Kleinkindern fernhalten – Erstickungsgefahr.",
  ];

  if (isElectronic) {
    safetyWarningsDe.push(
      "Vor Kontakt mit Wasser oder Feuchtigkeit schützen (sofern nicht explizit als wasserdicht gemäß IP-Schutzklasse gekennzeichnet).",
      "Nur mit geprüften Netzteilen/Spannungsquellen innerhalb der angegebenen Spezifikation betreiben.",
    );
  }
  if (isKitchenFood) {
    safetyWarningsDe.push(
      "Vor dem ersten Gebrauch gründlich mit warmem Wasser und mildem Spülmittel reinigen.",
      "Maximale Temperaturbeständigkeit beachten und direkten Kontakt mit offenen Flammen vermeiden.",
    );
  }
  if (isChildOrPet) {
    safetyWarningsDe.push(
      "Regelmäßig auf Beschädigungen oder lose Kleinteile prüfen; bei sichtbaren Defekten nicht weiterverwenden.",
    );
  }

  const weeeNote = isElectronic
    ? "Elektro- und Elektronikgeräte dürfen nicht über den Hausmüll entsorgt werden (WEEE / ElektroG). Bitte nutzen Sie die kommunalen Sammelstellen."
    : "Kein registrierungspflichtiges Elektrogerät nach ElektroG; fachgerechte Entsorgung gemäß lokalen Vorschriften.";

  const packagingNote =
    "Verpackung ist systembeteiligungspflichtig gemäß deutschem Verpackungsgesetz (VerpackG / LUCID) und vollständig recycelbar.";

  const aspectsPatch: Record<string, string[]> = {
    Hersteller: [manufacturerName],
    Marke: [manufacturerName],
    Herstellernummer: [modelCode],
    Produktsicherheit: ["GPSR-konform (Verordnung (EU) 2023/988)"],
    ...(isElectronic ? { "CE-Kennzeichnung": ["Ja"] } : {}),
  };

  return {
    regulationCode: "EU 2023/988 (GPSR)",
    manufacturerName,
    responsiblePersonEu: `${manufacturerName} EU Distribution / Geprüfter EU-Fachhandel (Kontakt über eBay-Verkäuferprofil hinterlegt)`,
    countryOfOrigin: "EU / Geprüfter Importbestand DE",
    ceMarkingRequired: isElectronic,
    weeeNote,
    packagingNote,
    safetyWarningsDe,
    aspectsPatch,
  };
}

export function enrichItemSpecificsWithGpsr(
  existing: Record<string, string[]> | undefined | null,
  input: { title: string; brand?: string | null; asin?: string | null; categoryId?: string | null },
): Record<string, string[]> {
  const base = { ...(existing || {}) };
  const gpsr = buildGpsrComplianceInfo({ ...input, itemSpecifics: base });
  for (const [key, values] of Object.entries(gpsr.aspectsPatch)) {
    if (!base[key] || base[key].length === 0) {
      base[key] = values;
    }
  }
  return base;
}
