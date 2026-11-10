export function cleanEbayTitle(value: string, limit = 80): string {
  const clean = value.replace(/[®™©]/g, "").replace(/[|;:]+/g, " ").replace(/,(?!\d)/g, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((word) => {
    const key = word.toLocaleLowerCase("de-DE");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let output = "";
  for (const word of unique) {
    if (!output) { if (word.length <= limit) output = word; continue; }
    if (`${output} ${word}`.length > limit) break;
    output += ` ${word}`;
  }
  return output.trim();
}

export function deterministicEbayTitle(value: string): string {
  const source = value.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
  const quantity = source.match(/\b(\d{1,3})\s*(?:x|St(?:ück)?\b)/i)?.[1];
  const model = source.match(/\b\d{3,5}\s?(?:ZZ|2RS|RS|Z|2Z)\b/i)?.[0]?.replace(/\s/g, "").toUpperCase();
  const dimensions = source.match(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*mm\b/i)?.[0].replace(/\s+/g, "").replace(/×/g, "x");
  const found: string[] = [];
  if (quantity) found.push(`${quantity}x`);
  if (model) found.push(model);
  if (/kugellager/i.test(source)) found.push("Kugellager");
  if (/\bmetall|stahl/i.test(source)) found.push(/stahl/i.test(source) ? "Stahl" : "Metall");
  if (/doppelt\s+geschirmt|double\s+shielded|608zz/i.test(source)) found.push("Doppelt geschirmt");
  if (/rillenkugellager/i.test(source)) found.push("Rillenkugellager");
  if (/skateboard/i.test(source)) found.push("Skateboard");
  if (/inline[ -]?skates?/i.test(source)) found.push("Inline Skates");
  if (/roller/i.test(source)) found.push("Roller");
  if (/modellbau/i.test(source)) found.push("Modellbau");
  if (dimensions) found.push(dimensions);
  const unique = [...new Set(found)];
  const candidate = unique.length >= 3 ? unique.join(" ") : source;
  const optimized = cleanEbayTitle(candidate, 80);
  if (optimized) return optimized;
  return cleanEbayTitle(source, 80);
}
