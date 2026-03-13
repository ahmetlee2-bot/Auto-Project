import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparables,
  buildScenarios,
  calculateEstimate,
  createInitialFormState,
  getLocalBuyBoxSignal,
  getSourceAdapter,
  toAnalyzeRequest,
  type ValuationFormState,
} from "../lib/valuation";

function buildForm(overrides: Partial<ValuationFormState> = {}): ValuationFormState {
  return {
    ...createInitialFormState(),
    rawText: "VW Golf 1.6, Hamburg, TUV yeni",
    ...overrides,
  };
}

test("calculateEstimate preserves valuation bands and operator cost outputs", () => {
  const estimate = calculateEstimate(buildForm());

  assert.deepEqual(estimate, {
    fair: 4050,
    low: 3690,
    high: 4330,
    fastSale: 3560,
    buyBox: 3280,
    prep: 280,
    fees: 240,
    totalCost: 4930,
    resale: 3930,
    netProfit: -1000,
    margin: -20,
    dealTag: "Pahali gorunuyor",
    risk: "Dusuk",
  });
});

test("comparables keep the three-band market structure from the reference", () => {
  const form = buildForm({ source: "AutoScout24" });
  const estimate = calculateEstimate(form);
  const comparables = buildComparables(form, estimate);

  assert.equal(comparables.length, 3);
  assert.deepEqual(
    comparables.map((item) => item.tag),
    ["Ust bant", "Orta piyasa", "Alt bant"],
  );
  assert.deepEqual(
    comparables.map((item) => item.source),
    ["AutoScout24", "AutoScout24", "Marketplace"],
  );
  assert.equal(comparables[1]?.price, estimate.fair);
});

test("scenario cases stay ordered as conservative, base, upside", () => {
  const form = buildForm({ askingPrice: 2800 });
  const estimate = calculateEstimate(form);
  const scenarios = buildScenarios(form, estimate);

  assert.deepEqual(
    scenarios.map((scenario) => scenario.title),
    ["Conservative", "Base case", "Upside"],
  );
  assert.ok(scenarios[2].netProfit >= scenarios[1].netProfit);
  assert.ok(scenarios[1].netProfit >= scenarios[0].netProfit);
});

test("local buy-box signal distinguishes fit, review and out states", () => {
  const fitForm = buildForm({ askingPrice: 2800 });
  const reviewForm = buildForm({ askingPrice: 3900 });
  const outForm = buildForm({ askingPrice: 4700 });

  assert.equal(getLocalBuyBoxSignal(fitForm, calculateEstimate(fitForm)).status, "fit");
  assert.equal(getLocalBuyBoxSignal(reviewForm, calculateEstimate(reviewForm)).status, "review");
  assert.equal(getLocalBuyBoxSignal(outForm, calculateEstimate(outForm)).status, "out");
});

test("source adapters keep frontend labels while mapping backend request sources", () => {
  assert.deepEqual(getSourceAdapter("Kleinanzeigen"), {
    key: "Kleinanzeigen",
    label: "Kleinanzeigen",
    analyzeSource: "Kleinanzeigen",
    hint: "Fastest parser path for the current backend.",
  });
  assert.equal(toAnalyzeRequest(buildForm({ source: "AutoScout24" })).source, "Mobile.de");
  assert.equal(toAnalyzeRequest(buildForm({ source: "Marketplace" })).source, "Facebook Marketplace");
});
