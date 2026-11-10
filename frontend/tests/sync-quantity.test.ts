import test from "node:test";
import assert from "node:assert/strict";
import { resolveEbayQuantity } from "../lib/repricer/sync";

test("keeps an eBay quantity changed outside AutoLister as the manual override", () => {
  assert.deepEqual(resolveEbayQuantity({
    amazonInStock: true,
    desiredQuantity: 1,
    manualQuantityOverride: null,
    storedQuantity: 1,
    liveQuantity: 0,
  }), { quantity: 0, manualQuantityOverride: 0 });
});

test("keeps a saved manual quantity override even when eBay still has the old value", () => {
  assert.deepEqual(resolveEbayQuantity({
    amazonInStock: true,
    desiredQuantity: 1,
    manualQuantityOverride: 0,
    storedQuantity: 1,
    liveQuantity: 1,
  }), { quantity: 0, manualQuantityOverride: 0 });
});

test("sets quantity to zero when Amazon is out of stock and there is no manual override", () => {
  assert.deepEqual(resolveEbayQuantity({
    amazonInStock: false,
    desiredQuantity: 1,
    manualQuantityOverride: null,
    storedQuantity: 1,
    liveQuantity: 1,
  }), { quantity: 0, manualQuantityOverride: null });
});
