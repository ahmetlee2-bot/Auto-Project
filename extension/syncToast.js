(() => {
  if (globalThis.__autolisterSyncToastLoaded) return;
  globalThis.__autolisterSyncToastLoaded = true;

  let host;
  let toastNode;
  let dismissTimer;
  function showToast({ state = "running", text = "Joybuy-Synchronisierung läuft …" } = {}) {
    if (!host?.isConnected) {
      host = document.createElement("div");
      host.id = "autolister-sync-toast-host";
      host.style.cssText = "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;pointer-events:none";
      const shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `<style>
        .toast{display:flex;align-items:flex-start;gap:10px;max-width:340px;padding:12px 15px;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#f8fafc;background:rgba(15,23,42,.93);box-shadow:0 12px 36px rgba(0,0,0,.25);backdrop-filter:blur(12px);font:600 13px/1.4 Inter,"Segoe UI",sans-serif;opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease}
        .toast[data-state=success]{border-color:rgba(34,197,94,.6)}.toast[data-state=warning]{border-color:rgba(245,158,11,.65)}.dot{width:9px;height:9px;flex:none;margin-top:4px;border-radius:50%;background:#60a5fa}.toast[data-state=success] .dot{background:#4ade80}.toast[data-state=warning] .dot{background:#fbbf24}.toast.visible{opacity:1;transform:translateY(0)}
        @media(prefers-reduced-motion:reduce){.toast{transition:none}}
      </style><div class="toast" role="status" aria-live="polite"><i class="dot"></i><span></span></div>`;
      toastNode = shadow.querySelector(".toast");
      document.documentElement.append(host);
    }
    const toast = toastNode;
    if (!toast) return;
    clearTimeout(dismissTimer);
    toast.dataset.state = state;
    toast.querySelector("span").textContent = String(text).slice(0, 180);
    toast.classList.add("visible");
    if (state !== "running") {
      dismissTimer = setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => { if (host?.isConnected && !toast.classList.contains("visible")) host.remove(); }, 250);
      }, 3000);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "AUTO_LISTER_JOYBUY_SYNC_TOAST") showToast(message);
  });
})();
