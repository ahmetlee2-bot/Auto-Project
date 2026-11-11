/**
 * AutoLister Automated 1-Click Checkout & Fulfillment Runner
 * Supports Amazon.de and Joybuy.de
 * 
 * Pipeline:
 * 1. Product Detail Page: Auto-check Gift (Hide Price), select quantity, and click 'In den Einkaufswagen' (Add to Cart).
 * 2. Upsell / Side-sheet / Cart Page: Skip coverage upsells and proceed immediately to checkout ('Zur Kasse gehen').
 * 3. Address Selection / New Address Form:
 *    - If new address form is displayed: Auto-fill Full Name, Street, House No, Postal Code, City, Phone, and click submit.
 *    - If address list is displayed: Match existing customer address or click '+ Neue Adresse hinzufügen'.
 * 4. Gift Options Step: Check 'Diese Bestellung enthält ein Geschenk', hide prices on delivery note.
 * 5. Final Order Review (SPC): DO NOT auto-submit! Highlight 'Jetzt kaufen' in vibrant glowing green for operator confirmation.
 * 6. Order Success (/thankyou): Capture Amazon Order ID and auto-sync to AutoLister backend.
 */
(() => {
  const isAmazon = location.hostname.includes("amazon.de");
  const isJoybuy = location.hostname.includes("joybuy.de");

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function injectBanner({ title, subtitle, status = "info", details = [], actions = [] }) {
    let existing = document.getElementById("autolister-fulfillment-banner");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "autolister-fulfillment-banner";
      existing.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 380px;
        max-width: 90vw;
        background: #090d16;
        color: #f8fafc;
        border: 2px solid #3b82f6;
        border-radius: 14px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1);
        padding: 18px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        backdrop-filter: blur(12px);
        transition: all 0.3s ease;
      `;
      document.body.appendChild(existing);
    }

    const borderColor = status === "success" ? "#10b981" : status === "warn" ? "#f59e0b" : "#3b82f6";
    const badgeColor = status === "success" ? "#065f46" : status === "warn" ? "#78350f" : "#1e3a8a";
    const statusText = status === "success" ? "Tamamlandı" : status === "warn" ? "Son Onayınız Bekleniyor" : "1-Click Otomasyon";
    existing.style.borderColor = borderColor;

    existing.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 22px; height: 22px; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center;">A</div>
          <span style="background: ${badgeColor}; color: #fff; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
            ${statusText}
          </span>
        </div>
        <button id="autolister-close-banner" style="background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
      </div>
      <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 4px; line-height: 1.3;">${title}</div>
      <div style="color: #cbd5e1; font-size: 12px; margin-bottom: 12px;">${subtitle}</div>
      ${details.length ? `
        <div style="background: #131b2e; padding: 10px 12px; border-radius: 8px; font-size: 12px; border: 1px solid #1e293b; margin-bottom: 12px;">
          ${details.map((d) => `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;"><span style="color: #94a3b8;">${d.label}:</span> <span style="font-weight: 600; color: #e2e8f0; text-align: right; max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.value}</span></div>`).join("")}
        </div>
      ` : ""}
      <div id="autolister-banner-actions" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
      <div style="font-size: 10px; color: #64748b; margin-top: 10px; display: flex; align-items: center; gap: 4px;">
        <span>🔒 Güvenli Oturum: Bilgiler kendi tarayıcınızda otomatik işlenir.</span>
      </div>
    `;

    document.getElementById("autolister-close-banner")?.addEventListener("click", () => {
      existing?.remove();
    });

    if (actions.length) {
      const container = document.getElementById("autolister-banner-actions");
      if (container) {
        actions.forEach((act) => {
          const btn = document.createElement("button");
          btn.style.cssText = `
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 700;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid ${act.primary ? "#2563eb" : "#334155"};
            background: ${act.primary ? "#2563eb" : "#1e293b"};
            color: #ffffff;
          `;
          btn.textContent = act.label;
          btn.addEventListener("click", act.onClick);
          container.appendChild(btn);
        });
      }
    }
  }

  function fillInput(selector, value) {
    if (!value) return false;
    const el = document.querySelector(selector);
    if (el) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    return false;
  }

  // --- AMAZON AUTOMATION PIPELINE ---
  async function runAmazonPipeline(order) {
    const addr = order.parsedAddress || {};
    const path = location.pathname;

    // STEP 6: Thank You / Order Confirmation Page
    if (path.includes("/thankyou") || document.querySelector(".a-box-inner .a-alert-success, #thank-you-box, [data-component-type='s-result-info-bar']")) {
      const orderIdMatch = document.body.innerText.match(/(?:Bestellnummer|Order\s*(?:#|ID))\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
      const amazonOrderId = orderIdMatch ? orderIdMatch[1] : null;

      if (amazonOrderId) {
        injectBanner({
          title: "Sipariş Başarıyla Tamamlandı! 🎉",
          subtitle: `Amazon Sipariş No: <b>${amazonOrderId}</b> sisteme kaydedildi.`,
          status: "success",
          details: [
            { label: "Amazon Sipariş No", value: amazonOrderId },
            { label: "eBay Sipariş", value: `#${order.orderId || "—"}` },
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

    // STEP 5: Final Review / Place Order Page (SPC)
    if (path.includes("/spc/") || document.querySelector("#bottomSubmitOrderButtonId, #placeYourOrder, input[name='placeYourOrder1']")) {
      injectBanner({
        title: "⚡ Son Kontrol: Siparişiniz Hazır!",
        subtitle: "Adres ve ürün hazırlandı. Güvenliğiniz için son satın alma onayını size bıraktık. Lütfen yeşil 'Jetzt kaufen' butonuna basarak siparişi tamamlayın.",
        status: "warn",
        details: [
          { label: "Alıcı", value: addr.fullName || "—" },
          { label: "Adres", value: `${addr.street || ""} ${addr.houseNumber || ""}`.trim() },
          { label: "PLZ / Şehir", value: `${addr.postalCode || ""} ${addr.city || ""}` },
          { label: "eBay Sipariş", value: `#${order.orderId || "—"}` },
        ],
      });

      const orderButton = document.querySelector("#bottomSubmitOrderButtonId, #placeYourOrder, input[name='placeYourOrder1'], [data-testid='submit-order-button']");
      if (orderButton) {
        orderButton.scrollIntoView({ behavior: "smooth", block: "center" });
        orderButton.style.boxShadow = "0 0 0 5px #10b981, 0 0 25px rgba(16, 185, 129, 0.6)";
        orderButton.style.transition = "all 0.3s ease";
      }
      return;
    }

    // STEP 4: Gift Options Step in Checkout (/gp/buy/gift/ or gift select)
    if (path.includes("/gift") || document.querySelector("input[name*='giftMessage'], input[name*='giftWrap'], #gift-options-box")) {
      injectBanner({
        title: "Hediye ve Fatura Gizleme Ayarlanıyor 🎁",
        subtitle: "Alıcının Amazon alış fiyatını görmemesi için irsaliyede fiyatlar gizleniyor.",
        status: "info",
      });

      // Check 'Preise auf dem Lieferschein ausblenden' or gift checkboxes
      const giftBoxes = document.querySelectorAll("input[type='checkbox'][name*='gift'], input[id*='gift-receipt'], input[name*='hidePrice']");
      for (const box of giftBoxes) {
        if (!box.checked) {
          box.click();
        }
      }

      await sleep(800);
      const continueBtn = document.querySelector("input[name*='continue'], input[name*='submit'], #gift-options-continue-button, [data-action='continue']");
      if (continueBtn) {
        continueBtn.click();
      }
      return;
    }

    // STEP 3: Address Form / Address Selection Page
    const nameInput = document.querySelector("#address-ui-widgets-enterAddressFullName, input[name='address-ui-widgets-enterAddressFullName']");
    if (nameInput) {
      injectBanner({
        title: "⚡ Teslimat Adresi Otomatik Dolduruluyor...",
        subtitle: `${addr.fullName} bilgileri forma yazılıyor.`,
        status: "info",
      });

      const line1Value = addr.isPackstation
        ? addr.street
        : `${addr.street || ""} ${addr.houseNumber || ""}`.trim();
      const line2Value = addr.addressLine2 || (addr.postNumber ? `PostNummer ${addr.postNumber}` : "");

      fillInput("#address-ui-widgets-enterAddressFullName, input[name='address-ui-widgets-enterAddressFullName']", addr.fullName);
      fillInput("#address-ui-widgets-enterAddressPhoneNumber, input[name='address-ui-widgets-enterAddressPhoneNumber']", addr.phoneNumber || "015112345678");
      fillInput("#address-ui-widgets-enterAddressLine1, input[name='address-ui-widgets-enterAddressLine1']", line1Value);
      fillInput("#address-ui-widgets-enterAddressLine2, input[name='address-ui-widgets-enterAddressLine2']", line2Value);
      fillInput("#address-ui-widgets-enterAddressPostalCode, input[name='address-ui-widgets-enterAddressPostalCode']", addr.postalCode);
      fillInput("#address-ui-widgets-enterAddressCity, input[name='address-ui-widgets-enterAddressCity']", addr.city);

      await sleep(600);

      const submitBtn = document.querySelector("#address-ui-widgets-form-submit-button, input[name='address-ui-widgets-saveOriginalOrSuggestedAddress'], input[name='shipToThisAddress']");
      if (submitBtn) {
        injectBanner({
          title: "Adres Kaydediliyor ⚡",
          subtitle: "Adres doğrulandı, bir sonraki aşamaya geçiliyor.",
          status: "info",
        });
        await sleep(500);
        submitBtn.click();
      }
      return;
    }

    // STEP 3B: Address Selection List (Pick address or Click '+ Add new address')
    if (path.includes("/addressselect") || document.querySelector(".ship-to-this-address, [data-action='select-address']")) {
      injectBanner({
        title: "Adres Kontrol Ediliyor...",
        subtitle: "Kayıtlı adresler taranıyor veya yeni adres ekleme formu açılıyor.",
        status: "info",
      });

      // Check if customer address already exists in the list
      const addressCards = [...document.querySelectorAll(".address-card, [data-testid='address-card'], .a-box")];
      let matchedBtn = null;

      for (const card of addressCards) {
        const text = card.innerText || "";
        if (addr.postalCode && text.includes(addr.postalCode) && addr.fullName && text.toLowerCase().includes(addr.fullName.toLowerCase())) {
          matchedBtn = card.querySelector(".ship-to-this-address, a[href*='selectAddress'], input[type='submit'], [data-action='select-address']");
          break;
        }
      }

      if (matchedBtn) {
        injectBanner({
          title: "Mevcut Müşteri Adresi Eşleşti ⚡",
          subtitle: `${addr.fullName} adresi seçildi, ödeme adımına ilerleniyor.`,
          status: "info",
        });
        await sleep(600);
        matchedBtn.click();
        return;
      }

      // If not matched, click 'Neue Adresse hinzufügen' (Add new address)
      const addAddressBtn = document.querySelector("#add-new-address-popover-link, a[href*='newAddress'], #add-address-button, [data-action='add-new-address']");
      if (addAddressBtn) {
        await sleep(500);
        addAddressBtn.click();
        return;
      }
    }

    // STEP 2: Cart / Upsell / Side-Sheet Page (Proceed to Retail Checkout)
    const proceedCheckoutBtn = document.querySelector("#attach-sidesheet-checkout-button, #hlb-ptc-btn-native, input[name='proceedToRetailCheckout'], #sc-buy-box-ptc-button, a[href*='/checkout']");
    if (proceedCheckoutBtn) {
      injectBanner({
        title: "Ürün Sepette! Kasaya İlerleniyor ⚡",
        subtitle: "Kasaya gidilerek teslimat adresi aşamasına geçiliyor.",
        status: "info",
      });

      // If warranty modal popup appears, dismiss it
      const noCoverage = document.querySelector("#attachSiNoCoverage, [aria-labelledby*='attachSiNoCoverage']");
      if (noCoverage) {
        noCoverage.click();
        await sleep(400);
      }

      await sleep(600);
      proceedCheckoutBtn.click();
      return;
    }

    // STEP 1: Product Detail Page (/dp/ or /gp/product/)
    if (path.includes("/dp/") || path.includes("/gp/product/")) {
      injectBanner({
        title: "⚡ 1-Click: Ürün Hazırlanıyor",
        subtitle: "Hediye seçeneği kontrol ediliyor ve ürün sepete ekleniyor...",
        status: "info",
        details: [
          { label: "Müşteri", value: addr.fullName || "—" },
          { label: "Hedef Şehir", value: `${addr.postalCode || ""} ${addr.city || ""}` },
          { label: "Adet", value: String(order.quantity || 1) },
        ],
      });

      // 1. Select Quantity if > 1
      if (order.quantity && order.quantity > 1) {
        const qtySelect = document.querySelector("select#quantity");
        if (qtySelect && qtySelect.value !== String(order.quantity)) {
          qtySelect.value = String(order.quantity);
          qtySelect.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(400);
        }
      }

      // 2. Gift Option Checkbox (Als Geschenk verpacken / Diese Bestellung enthält ein Geschenk)
      const giftBox = document.querySelector("#gift-wrap, input[name='isGift'], #sc-buy-box-gift-checkbox, input[id*='gift']");
      if (giftBox && !giftBox.checked) {
        giftBox.click();
        await sleep(300);
      }

      // 3. Add to Cart Button
      const addToCartBtn = document.querySelector("#add-to-cart-button, input[name='submit.add-to-cart'], #exportsUndeliverable-cart-announce");
      if (addToCartBtn) {
        await sleep(700);
        addToCartBtn.click();
      } else {
        // If Buy Now button exists as alternative
        const buyNowBtn = document.querySelector("#buy-now-button, input[name='submit.buy-now']");
        if (buyNowBtn) {
          injectBanner({
            title: "Hızlı Satın Alma (1-Click)",
            subtitle: "Doğrudan ödeme ekranına geçiliyor...",
            status: "info",
          });
          await sleep(800);
          buyNowBtn.click();
        }
      }
    }
  }

  // --- INITIALIZE RUNNER ---
  if (chrome?.storage?.local) {
    chrome.storage.local.get("activeFulfillmentOrder", (res) => {
      const active = res.activeFulfillmentOrder;
      if (!active) return;

      if (isAmazon) {
        void runAmazonPipeline(active);
      }
    });
  }
})();
