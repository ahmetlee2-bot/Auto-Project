const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const active = { asin: "B085LQVHV8", title: "Active product", priceText: "8,52 EUR", images: ["https://m.media-amazon.com/images/I/product.jpg"], itemSpecifics: {}, sourceUrl: "https://www.amazon.de/dp/B085LQVHV8", inStock: true };
let contentHandler, scheduledCapture;
const storage = {};
const calls = [];
const mainImage = { src: active.images[0], naturalWidth: 1500, naturalHeight: 1200, getAttribute: () => null };
const content = vm.createContext({
  URL, console,
  location: { pathname: "/dp/B085LQVHV8", href: active.sourceUrl, hostname: "www.amazon.de" },
  document: {
    querySelector(selector) {
      if (selector === "#ASIN") return { value: active.asin };
      if (selector === "#productTitle") return { textContent: active.title };
      if (selector === "#landingImage") return mainImage;
      if (selector === "#corePrice_feature_div .a-offscreen") return { textContent: active.priceText };
      if (selector === "#add-to-cart-button, #buy-now-button") return {};
      return null;
    }, querySelectorAll: () => [],
  },
  setTimeout(callback) { scheduledCapture = callback; },
  chrome: {
    runtime: { onMessage: { addListener(handler) { contentHandler = handler; } }, async sendMessage(message) { calls.push(message); throw new Error("Image work must not happen while opening a page"); } },
    storage: { local: { async set(data) { Object.assign(storage, data); } } },
  },
});
for (const file of ["amazon_parser.js", "content.js"]) vm.runInContext(read(file), content);
function element() {
  return { value: "", textContent: "", innerHTML: "", dataset: {}, entries: [], disabled: false, classList: { toggle() {} },
    listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; }, prepend(value) { this.entries.unshift(value); }, replaceChildren() { this.entries = []; }, querySelector() { return element(); } };
}
(async () => {
  scheduledCapture();
  await new Promise(setImmediate);
  assert.equal(storage.activeProduct.price, 8.52);
  assert.equal(storage.activeProduct.processedImageData, undefined);
  assert.equal(calls.length, 0);
  const extracted = await new Promise((resolve) => contentHandler({ action: "EXTRACT_AMAZON_PRODUCT" }, {}, resolve));
  assert.equal(extracted.ok, true);
  assert.equal(extracted.product.images.length, 1);
  assert.equal(calls.length, 0);

  const nodes = new Map();
  const query = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  query("#profitMargin").value = "20";
  query("#imageRightsConfirmed").checked = true;
  let popupReady, bridgeUp = false;
  const commands = [];
  const popup = vm.createContext({
    URL, console, document: { readyState: "loading", querySelector: query, createElement: element, addEventListener(_event, fn) { popupReady = fn; } },
    chrome: {
      runtime: { getManifest: () => ({ version: "0.8.1" }), async openOptionsPage() {}, async sendMessage(message) {
        commands.push(message);
        if (message.type === "CHECK_BRIDGE") return { ok: bridgeUp, error: "start-bridge.cmd starten" };
        return { ok: true, result: { status: "PUBLISHED", listingId: "test-only-item" } };
      } },
      tabs: { async query() { return [{ id: 42, url: active.sourceUrl }]; }, async sendMessage() { return { ok: true, product: active }; } },
      storage: { onChanged: { addListener() {} }, local: {
        async get() { return { activeProduct: { ...active, asin: "B000000000", title: "WRONG OTHER TAB" }, autoListerMargin: 20 }; }, async set() {},
      } },
    },
  });
  for (const file of ["priceCalculator.js", "popup.js"]) vm.runInContext(read(file), popup);
  popupReady();
  await popup.initialize();
  assert.equal(query("#sourcePrice").textContent, "8,52 EUR");
  assert.match(query("#salePrice").textContent, /10.23/);
  assert.equal(query("#productName").textContent, active.title);
  assert.doesNotMatch(query("#productMeta").textContent, /bereinigt/);
  query("#manualPrice").value = "29,99";
  await popup.listProduct();
  assert.equal(commands.filter((message) => message.type === "CREATE_EBAY_DRAFT").length, 0);
  assert.match(query("#status").textContent, /start-bridge.cmd/);
  bridgeUp = true;
  await popup.listProduct();
  const sent = commands.find((message) => message.type === "SAVE_CLOUD_PRODUCT");
  assert.equal(sent.product.asin, active.asin);
  assert.equal(sent.product.salePrice, "29.99");
  assert.match(query("#status").textContent, /Erfolgreich gelistet/);
  query("#manualPrice").value = "";
  query("#profitMargin").value = "30";
  query("#profitMargin").listeners.input();
  assert.match(query("#salePrice").textContent, /11.08/);
  console.log("Capture/popup tests passed: raw auto-capture, message compatibility, active-tab identity, manual price, offline no-submit, simulated success.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
