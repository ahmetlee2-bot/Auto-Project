(() => {
  function connectionError(url, error) {
    let local = false;
    try { local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch {}
    const timeout = error?.name === "AbortError" || error?.name === "TimeoutError";
    return new Error(local
      ? `Lokaler eBay-Dienst ${timeout ? "antwortet nicht rechtzeitig" : "ist nicht erreichbar"}. start-bridge.cmd starten und erneut versuchen. URL: ${url}`
      : `Verbindung ${timeout ? "abgelaufen" : "fehlgeschlagen"}: ${url}`);
  }

  async function requestJson(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      // Keep the deadline active until the body, not just its headers, arrives.
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { throw new Error(`Dienst lieferte kein JSON (HTTP ${response.status}): ${url}`); }
      if (!response.ok) {
        const error = new Error(body.message || body.error || `HTTP ${response.status}: ${url}`);
        Object.assign(error, {
          code: body.code || "",
          stage: body.stage || "HTTP",
          operation: body.operation || "",
          status: body.status || response.status,
          requestId: body.requestId || "",
          details: body.details || [],
        });
        if (error.requestId) error.message += ` | Request-ID: ${error.requestId}`;
        throw error;
      }
      return body;
    } catch (error) {
      console.error("BRIDGE REQUEST ERROR:", { url, method: options.method || "GET", message: error.message });
      if (error?.name === "AbortError" || error?.name === "TimeoutError" || error instanceof TypeError) throw connectionError(url, error);
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function check(baseUrl) {
    const health = await requestJson(`${baseUrl.replace(/\/$/, "")}/health`, {}, 4000);
    if (health.ok !== true) throw new Error("Der lokale eBay-Dienst meldet einen Fehler.");
    if (health.mode !== "api") throw new Error("Der Dienst laeuft im Testmodus; kein echtes eBay-Angebot moeglich.");
    if (health.oauthConfigured !== true) throw new Error("Die eBay-Verbindung des lokalen Dienstes fehlt.");
    return health;
  }
  function displayError(error) {
    const parts = [error?.message || String(error)];
    if (error?.requestId) parts.push(`Request-ID: ${error.requestId}`);
    return parts.filter(Boolean).join(" | ");
  }
  globalThis.AlltaghausBridge = { requestJson, check, connectionError, displayError };
})();
