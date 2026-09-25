(() => {
  function assertAuthorizedImage(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Görsel HTTPS üzerinden erişilebilir olmalı.");
  }

  function normalizeCropRatio(value) {
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return 0;
    return Math.min(0.05, Math.max(0, ratio));
  }

  async function createMetadataFreePreview(url, { maxSide = 1600, cropRatio = 0, quality = 0.9 } = {}) {
    assertAuthorizedImage(url);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Görsel yüklenemedi: HTTP ${response.status}`);
    const source = await createImageBitmap(await response.blob());
    const crop = normalizeCropRatio(cropRatio);
    const sourceX = Math.round(source.width * crop);
    const sourceY = Math.round(source.height * crop);
    const sourceWidth = Math.max(1, source.width - sourceX * 2);
    const sourceHeight = Math.max(1, source.height - sourceY * 2);
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const side = Math.max(500, Math.round(Math.max(sourceWidth, sourceHeight) * scale));
    const drawWidth = Math.round(sourceWidth * scale);
    const drawHeight = Math.round(sourceHeight * scale);
    const canvas = new OffscreenCanvas(side, side);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, side, side);
    context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, Math.round((side - drawWidth) / 2), Math.round((side - drawHeight) / 2), drawWidth, drawHeight);
    source.close();
    return canvas.convertToBlob({ type: "image/jpeg", quality: Math.min(0.95, Math.max(0.75, Number(quality) || 0.9)) });
  }

  async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
  }

  async function processForEbay(url, options = {}) {
    const blob = await createMetadataFreePreview(url, { cropRatio: 0, maxSide: 1400, quality: 0.86, ...options });
    return { dataUrl: await blobToDataUrl(blob), mimeType: "image/jpeg", cropRatio: 0 };
  }

  globalThis.AlltaghausImage = {
    assertAuthorizedImage, normalizeCropRatio, createMetadataFreePreview, blobToDataUrl, processForEbay,
  };
})();
