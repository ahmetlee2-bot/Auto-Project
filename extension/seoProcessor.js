(() => {
  const STOP_WORDS = new Set([
    "für", "mit", "und", "der", "die", "das", "ein", "eine", "von", "the", "best",
    "neu", "original", "hochwertig", "premium", "amazon", "angebot", "sale",
  ]);
  const LABELS = {
    brand: "Marke", model: "Modell", color: "Farbe", colour: "Farbe", farbe: "Farbe",
    size: "Größe", größe: "Größe", material: "Material", gewicht: "Gewicht",
    weight: "Gewicht", dimensions: "Maße", abmessungen: "Maße", capacity: "Kapazität",
    modellnummer: "Modell", modelnummer: "Modell", model: "Modell", marke: "Marke",
    hersteller: "Hersteller", stil: "Stil", style: "Stil", produktart: "Produktart",
  };

  function clean(value) {
    return String(value || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  }

  function usefulSpecifics(specifics = {}) {
    const ignored = /^(?:package(?:height|width|length|weight)|releasedate|garantierte software-updates|software updates|batterien|asin)$/i;
    return Object.fromEntries(Object.entries(specifics).filter(([key, values]) => {
      const value = Array.isArray(values) ? values.join(" ") : values;
      return !ignored.test(clean(key)) && clean(value).length > 0;
    }));
  }

  function resolveBrand(specifics = {}, sourceTitle = "") {
    const entries = Object.entries(specifics);
    const direct = entries.find(([key]) => /^(marke|brand)$/i.test(clean(key)))?.[1]?.[0];
    const manufacturer = entries.find(([key]) => /^(hersteller|manufacturer)$/i.test(clean(key)))?.[1]?.[0];
    const candidate = clean(direct || manufacturer);
    if (candidate && !/^(unbranded|generic|unbekannt|n\/?a)$/i.test(candidate) && candidate.length <= 80) return candidate;
    // A missing brand must remain missing. Guessing "Unbranded" conflicts with branded packaging.
    return "";
  }

  function titleCase(value) {
    return clean(value).replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  }

  function normalizeSpecifics(rawSpecifics = {}) {
    const specifics = {};
    for (const [rawKey, rawValue] of Object.entries(rawSpecifics)) {
      const key = clean(rawKey);
      const value = clean(rawValue);
      if (!key || !value || value.length > 120) continue;
      const normalizedKey = LABELS[key.toLocaleLowerCase("de-DE")] || titleCase(key);
      specifics[normalizedKey] ||= [];
      if (!specifics[normalizedKey].includes(value)) specifics[normalizedKey].push(value);
    }
    return specifics;
  }

  function compactTitle(sourceTitle, specifics = {}) {
    const source = clean(sourceTitle).replace(/[|•·]+/g, " ");
    const first = (key) => clean(Array.isArray(specifics[key]) ? specifics[key][0] : specifics[key]);
    const ordered = [first("Marke") || first("Hersteller"), first("Modell")].filter(Boolean);
    const prefixWords = new Set(ordered.join(" ").split(/\s+/).map((word) => word.toLocaleLowerCase("de-DE")));
    const words = source.split(/[\s,;:()[\]{}]+/).filter(Boolean);
    const kept = [];
    const seen = new Set(prefixWords);
    for (const word of words) {
      const normalized = word.toLocaleLowerCase("de-DE");
      if (STOP_WORDS.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      kept.push(word);
      if ([...ordered, ...kept].join(" ").length >= 62) break;
    }

    const attributes = [specifics.Farbe?.[0], specifics.Größe?.[0], specifics.Material?.[0]]
      .filter(Boolean)
      .filter((value) => !new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(kept.join(" ")));
    const parts = [...ordered, ...kept, ...attributes];
    let result = "";
    for (const part of parts) {
      const candidate = clean(`${result} ${part}`);
      if (candidate.length > 80) break;
      result = candidate;
    }
    return result || source.slice(0, 80).trim();
  }

  function applySearchTerms(sourceTitle, description, specifics = {}) {
    const source = `${sourceTitle || ""} ${description || ""} ${Object.values(specifics).flat().join(" ")}`;
    const hasTerm = (term) => term === "Bio"
      ? /\bbio\b/iu.test(source)
      : new RegExp(`\\b${term}\\p{L}*`, "iu").test(source);
    // "Bioaktiv" describes a nutrient form; it is not an organic-product claim.
    const terms = ["Vegan", "Laborgeprüft", "Bio"].filter(hasTerm);
    const nextSpecifics = { ...specifics };
    if (terms.length) nextSpecifics.Besonderheiten = [...new Set([...(nextSpecifics.Besonderheiten || []), ...terms])];
    let title = compactTitle(sourceTitle, nextSpecifics);
    for (const term of terms) {
      if (hasTerm(title, term)) continue;
      const candidate = clean(`${title} ${term}`);
      if (candidate.length <= 80) title = candidate;
    }
    return { title, specifics: nextSpecifics, terms };
  }

  globalThis.AlltaghausSeo = { clean, normalizeSpecifics, usefulSpecifics, resolveBrand, compactTitle, applySearchTerms };
})();
