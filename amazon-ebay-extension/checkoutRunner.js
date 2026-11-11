/**
 * AutoLister Checkout & Order Fulfillment Runner
 * Runs on Amazon.de and Joybuy.de to auto-fill customer delivery addresses,
 * guide the operator through 1-Click checkout, and capture Order IDs upon completion.
 */
(() => {
  const isAmazon = location.hostname.includes("amazon.de");
  const isJoybuy = location.hostname.includes("joybuy.de");

  function injectBanner({ title, subtitle, status = "info", details = [] }) {
    let existing = document.getElementById("autolister-fulfillment-banner");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "autolister-fulfillment-banner";
      existing.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999999;
        max-width: 420px;
        background: #0f172a;
        color: #f8fafc;
        border: 2px solid #3b82f6;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.5;
      `;
      document.body.appendChild(existing);
    }

    const borderColor = status === "success" ? "#10b981" : status === "warn" ? "#f59e0b" : "#3b82f6";
    const badgeColor = status === "success" ? "#065f46" : status === "warn" ? "#78350f" : "#1e3a8a";
    existing.style.borderColor = borderColor;

    existing.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="background: ${badgeColor}; color: #fff; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
          AutoLister 1-Click
        </span>
        <button id="autolister-close-banner" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; line-height: 1;">&times;</button>
      </div>
      <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px;">${title}</div>
      <div style="color: #cbd5e1; margin-bottom: 10px;">${subtitle}</div>
      ${details.length ? `
        <div style="background: #1e293b; padding: 10px; border-radius: 8px; font-size: 12px; border: 1px solid #334155; margin-bottom: 10px;">
          ${details.map((d) => `<div><b>${d.label}:</b> ${d.value}</div>`).join("")}
        </div>
      ` : ""}
      <div style="font-size: 11px; color: #94a3b8;">
        Güvenli Oturum: Bilgiler doğrudan kendi tarayıcınızda dolduruldu.
      </div>
    `;

    document.getElementById("autolister-close-banner")?.addEventListener("click", () => {
      existing?.remove();
    });
  }

  function fillInput(selector, value) {
    if (!value) return false;
    const el = document.querySelector(selector);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function handleAmazonCheckout(order) {
    const addr = order.parsedAddress || {};
    const path = location.pathname;

    // 1. Check if on Thank You / Confirmation Page
    if (path.includes("/thankyou") || document.querySelector(".a-box-inner .a-alert-success, #thank-you-box, [data-component-type='s-result-info-bar']")) {
      const orderIdMatch = document.body.innerText.match(/(?:Bestellnummer|Order\s*(?:#|ID))\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
      const amazonOrderId = orderIdMatch ? orderIdMatch[1] : null;

      if (amazonOrderId) {
        injectBanner({
          title: "Sipariş Başarıyla Tamamlandı! 🎉",
          subtitle: `Amazon Sipariş No: <b>${amazonOrderId}</b> sisteme kaydediliyor.`,
          status: "success",
          details: [
            { label: "Amazon Sipariş No", value: amazonOrderId },
            { label: "eBay Sipariş No", value: order.orderId || "—" },
            { label: "Alıcı", value: addr.fullName || "—" },
          ],
        });

        // Notify background to sync with AutoLister backend
        chrome.runtime.sendMessage({
          type: "ORDER_FULFILLED_SUCCESS",
          payload: {
            orderId: order.orderId,
            storeId: order.storeId,
            supplierOrderId: amazonOrderId,
            supplier: "amazon_de",
            recipientName: addr.fullName,
            recipientCity: addr.city,
            recipientZip: addr.postalCode,
          },
        });

        // Clear active order
        chrome.storage.local.remove("activeFulfillmentOrder");
        return;
      }
    }

    // 2. Check if on Address Form / Address Selection Page
    const nameInput = document.querySelector("#address-ui-widgets-enterAddressFullName, input[name='address-ui-widgets-enterAddressFullName']");
    if (nameInput) {
      const line1Value = addr.isPackstation
        ? addr.street
        : `${addr.street || ""} ${addr.houseNumber || ""}`.trim();

      const line2Value = addr.addressLine2 || (addr.postNumber ? `PostNummer ${addr.postNumber}` : "");

      fillInput("#address-ui-widgets-enterAddressFullName", addr.fullName);
      fillInput("#address-ui-widgets-enterAddressPhoneNumber", addr.phoneNumber || "015112345678");
      fillInput("#address-ui-widgets-enterAddressLine1", line1Value);
      fillInput("#address-ui-widgets-enterAddressLine2", line2Value);
      fillInput("#address-ui-widgets-enterAddressPostalCode", addr.postalCode);
      fillInput("#address-ui-widgets-enterAddressCity", addr.city);

      injectBanner({
        title: "Teslimat Adresi Otomatik Dolduruldu ⚡",
        subtitle: "Lütfen adresi kontrol edin ve 'Adresse verwenden' butonuna tıklayın.",
        status: "info",
        details: [
          { label: "Alıcı Adı", value: addr.fullName || "—" },
          { label: "Sokak / No", value: line1Value || "—" },
          { label: "Zusatz / PostNr", value: line2Value || "—" },
          { label: "PLZ / Şehir", value: `${addr.postalCode || ""} ${addr.city || ""}` },
        ],
      });

      // Highlight the submit/use address button
      const submitBtn = document.querySelector("#address-ui-widgets-form-submit-button, input[name='address-ui-widgets-saveOriginalOrSuggestedAddress']");
      if (submitBtn) {
        submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        (submitBtn as HTMLElement).style.outline = "4px solid #3b82f6";
      }
      return;
    }

    // 3. Final Review / Place Order Page (SPC)
    if (path.includes("/spc/") || document.querySelector("#bottomSubmitOrderButtonId, #placeYourOrder")) {
      injectBanner({
        title: "Son Kontrol: Sipariş Verilmeye Hazır",
        subtitle: "Fiyatı ve adresi teyit ettikten sonra 'Jetzt kaufen' butonuna basarak siparişi tamamlayın.",
        status: "warn",
        details: [
          { label: "eBay Sipariş", value: `#${order.orderId || "—"}` },
          { label: "Alıcı", value: addr.fullName || "—" },
          { label: "Teslimat Şehri", value: `${addr.postalCode || ""} ${addr.city || ""}` },
        ],
      });

      const orderButton = document.querySelector("#bottomSubmitOrderButtonId, #placeYourOrder, input[name='placeYourOrder1']");
      if (orderButton) {
        (orderButton as HTMLElement).style.outline = "4px solid #10b981";
      }
    }
  }

  // Initialize
  if (chrome?.storage?.local) {
    chrome.storage.local.get("activeFulfillmentOrder", (res) => {
      const active = res.activeFulfillmentOrder;
      if (!active) return;

      if (isAmazon) {
        void handleAmazonCheckout(active);
      }
    });
  }
})();
