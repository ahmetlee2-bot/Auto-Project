/**
 * AutoLister Web Dashboard Bridge
 * Bridges messages between the AutoLister Web App (https://autolister-app.de)
 * and the AutoLister Chrome Extension service worker.
 */
(() => {
  try {
    window.__AUTOLISTER_EXTENSION_ACTIVE = true;
    document.documentElement.dataset.autolisterExtension = "ready";
    window.postMessage({ type: "AUTOLISTER_EXTENSION_READY", version: "1.1.9" }, "*");
  } catch {}

  window.addEventListener("message", (event) => {
    // Only accept messages from self window
    if (event.source !== window || !event.data || typeof event.data !== "object") return;

    if (event.data.type === "AUTOLISTER_TRIGGER_AUTO_ORDER") {
      const orderPayload = event.data.payload;
      if (!orderPayload) return;

      chrome.runtime.sendMessage({
        type: "START_AUTO_FULFILLMENT",
        order: orderPayload,
      }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: "AUTOLISTER_AUTO_ORDER_RESPONSE",
            ok: false,
            error: chrome.runtime.lastError.message,
          }, "*");
          return;
        }
        window.postMessage({
          type: "AUTOLISTER_AUTO_ORDER_RESPONSE",
          ok: response?.ok ?? true,
          tabId: response?.tabId,
        }, "*");
      });
    }
  });
})();
