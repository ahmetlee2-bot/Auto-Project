import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequiredAspectsFromData } from "../lib/repricer/ebay";

const required = (localizedAspectName: string, localizedValues: string[] = []) => ({
  localizedAspectName,
  aspectConstraint: { aspectRequired: true, aspectMode: localizedValues.length ? "SELECTION_ONLY" : "FREE_TEXT" },
  aspectValues: localizedValues.map((localizedValue) => ({ localizedValue })),
});

const hatAspects = [
  required("Abteilung", ["Damen", "Herren", "Kinder", "Unisex Erwachsene"]),
  required("Farbe", ["Beige", "Braun", "Rosa", "Mehrfarbig"]),
  required("Größe", ["Einheitsgröße", "One Size", "55-58 cm", "M"]),
  required("Stil", ["Sportlich", "Outdoor", "Casual", "Sonnenblende"]),
  required("Produktart", ["Sonnenhut", "Sonnenblende", "Hut"]),
];

test("Beneunder BM715 fills German department, coffee color, size fallback and hat aspects", () => {
  const title = "Beneunder BM715 Damen Entenschnabel Sonnenhut Kaffeefarbe Outdoor Sport";
  const result = resolveRequiredAspectsFromData(hatAspects, title, "Leichter Sonnenhut für den Outdoor-Einsatz.");
  assert.equal(result.Abteilung[0], "Damen");
  assert.equal(result.Farbe[0], "Braun");
  assert.equal(result.Größe[0], "Einheitsgröße");
  assert.equal(result.Stil[0], "Sportlich");
  assert.equal(result.Produktart[0], "Sonnenhut");
  assert.ok(hatAspects.every((aspect) => result[aspect.localizedAspectName!]?.[0]));
});

test("Beneunder SS01k fills Damen, Sky Pink and explicit 55-58 hat size", () => {
  const title = "Beneunder Damenleichtgewicht 3D Sonnenblende SS01k - Sky Pink - 55-58";
  const result = resolveRequiredAspectsFromData(hatAspects, title, "Leichte Sonnenblende mit verstellbarer Passform.");
  assert.equal(result.Abteilung[0], "Damen");
  assert.equal(result.Farbe[0], "Rosa");
  assert.equal(result.Größe[0], "55-58 cm");
  assert.equal(result.Stil[0], "Sonnenblende");
  assert.equal(result.Produktart[0], "Sonnenblende");
  assert.ok(hatAspects.every((aspect) => result[aspect.localizedAspectName!]?.[0]));
});

test("unknown required aspects receive generic values and allowed values are respected", () => {
  const fields = [required("Marke"), required("Herstellernummer"), required("Maßeinheit"), required("Anzahl der Einheiten"), required("Saison", ["Frühling", "Sommer", "Winter"])];
  const result = resolveRequiredAspectsFromData(fields, "Beneunder Sonnenhut", "");
  assert.equal(result.Marke[0], "Beneunder");
  assert.equal(result.Herstellernummer[0], "Nicht zutreffend");
  assert.equal(result.Maßeinheit[0], "Einheit");
  assert.equal(result["Anzahl der Einheiten"][0], "1");
  assert.equal(result.Saison[0], "Frühling");
});
