const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
for (const file of ["seoProcessor.js", "priceCalculator.js", "identifierProcessor.js", "descriptionProcessor.js", "imageProcessor.js", "listingValidator.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}

const specifics = context.AlltaghausSeo.normalizeSpecifics({ Color: "Schwarz", Material: "Edelstahl" });
assert.deepEqual(JSON.parse(JSON.stringify(specifics)), { Farbe: ["Schwarz"], Material: ["Edelstahl"] });
const title = context.AlltaghausSeo.compactTitle("Premium Premium Wasserflasche mit Edelstahl für Sport", specifics);
assert.ok(title.length <= 80);
const orderedTitle = context.AlltaghausSeo.compactTitle("Premium Trinkflasche Schwarz für Sport", {
  Marke: ["HydroMax"], Modell: ["X2"], Farbe: ["Schwarz"], Größe: ["750 ml"],
});
assert.match(orderedTitle, /^HydroMax X2 /);
assert.ok(orderedTitle.length <= 80);
assert.equal(context.AlltaghausPrice.calculateSalePrice("20,00 EUR", 20), "24.00");
assert.equal(context.AlltaghausPrice.calculateSalePrice("20,00 EUR", 25), "25.00");
assert.equal(context.AlltaghausIdentifier.isValidEan("4006381333931"), true);
assert.equal(context.AlltaghausIdentifier.isValidEan("4006381333932"), false);
assert.equal(context.AlltaghausIdentifier.resolveEan("4006381333931").status, "VALID");
assert.equal(context.AlltaghausIdentifier.resolveEan("", { explicitlyNotApplicable: true }).status, "NOT_APPLICABLE");
assert.equal(context.AlltaghausImage.normalizeCropRatio(0.03), 0.03);
assert.equal(context.AlltaghausImage.normalizeCropRatio(0.2), 0.05);
const cleanDescription = context.AlltaghausDescription.cleanDescription(`Robuste Trinkflasche aus Edelstahl.\n<script>window.__APEX_DATA__ = {"props": true};</script>\nconst tracking = "hidden";\nSpülmaschinengeeignet.`);
assert.match(cleanDescription, /Robuste Trinkflasche/);
assert.match(cleanDescription, /Spülmaschinengeeignet/);
assert.doesNotMatch(cleanDescription, /APEX_DATA|tracking/);
const descriptionHtml = context.AlltaghausDescription.buildEbayDescription({
  title: "Edelstahl Trinkflasche", description: cleanDescription,
  highlights: ["Robust und alltagstauglich", "Spülmaschinengeeignet"],
  specifics: { Material: ["Edelstahl"], Farbe: ["Schwarz"] },
  legalNotice: "Hinweis: Nahrungsergänzungsmittel dienen nicht als Ersatz.",
});
assert.match(descriptionHtml, /Blitzversand aus Deutschland/);
assert.match(descriptionHtml, /Top Kundenservice/);
assert.match(descriptionHtml, /Artikelzustand: neu/);
assert.match(descriptionHtml, /Nahrungsergänzungsmittel dienen nicht als Ersatz/);
assert.doesNotMatch(descriptionHtml, /APEX_DATA|<script/i);
const seoTerms = context.AlltaghausSeo.applySearchTerms("Veganer Bio Multivitamin", "Laborgeprüfte Qualität", { Marke: ["Example"] });
assert.deepEqual(JSON.parse(JSON.stringify(seoTerms.specifics.Besonderheiten)), ["Vegan", "Laborgeprüft", "Bio"]);
const notOrganic = context.AlltaghausSeo.applySearchTerms("Multivitamin mit Bioaktiv-Formen", "", { Marke: ["Example"] });
assert.equal(notOrganic.terms.includes("Bio"), false);
assert.equal(context.AlltaghausSeo.resolveBrand({ Hersteller: ["natural elements"] }), "natural elements");
assert.equal(context.AlltaghausSeo.resolveBrand({ Marke: ["Unbranded"] }), "");
assert.deepEqual(JSON.parse(JSON.stringify(context.AlltaghausSeo.usefulSpecifics({ Marke: ["Example"], ReleaseDate: ["20251019"], "Garantierte Software-Updates": ["unbekannt"] }))), { Marke: ["Example"] });
const invalidListing = context.AlltaghausListing.validateListing({ title: "Short", salePrice: "12.99", quantity: 1, images: [], itemSpecifics: {} });
assert.equal(invalidListing.ready, false);
assert.ok(invalidListing.blockers.some((message) => /görsel/i.test(message)));
const readyListing = context.AlltaghausListing.validateListing({
  ebayTitle: "Edelstahl Wasserflasche Schwarz 750 ml Sport", salePrice: "24.99", quantity: 1,
  images: ["https://example.test/image.jpg"], imageRightsConfirmed: true, itemSpecifics: { Farbe: ["Schwarz"], Material: ["Edelstahl"] },
  ebayDescription: descriptionHtml, ean: "4006381333931",
});
assert.equal(readyListing.ready, true);

console.log("Processor tests passed: title, specifics, price and EAN validation.");
