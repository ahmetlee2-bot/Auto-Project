(() => {
  const overlayAssets = {
    topLeft: "assets/badges/top_left.png",
    bottomRight: "assets/badges/bottom_right.png",
  };

  async function loadAsset(path) {
    const response = await fetch(chrome.runtime.getURL(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`Overlay asset yüklenemedi: ${path}`);
    const bitmap = await createImageBitmap(await response.blob());
    if (!bitmap.width || !bitmap.height) { bitmap.close(); throw new Error(`Bos rozet: ${path}`); }
    return bitmap;
  }

  function overlayLayout(width, height, topLeft, bottomRight) {
    const topPadding = Math.round(width * 0.015);
    const topWidth = Math.max(1, Math.round(width * 0.49));
    const bottomWidth = Math.max(1, Math.round(width * 0.21));
    const topHeight = Math.round(topWidth * (topLeft.height / topLeft.width));
    const bottomHeight = Math.round(bottomWidth * (bottomRight.height / bottomRight.width));
    return {
      // Exact proportions from the approved reference image.
      topLeft: { x: topPadding, y: topPadding, width: topWidth, height: topHeight },
      bottomRight: { x: width - bottomWidth, y: height - bottomHeight, width: bottomWidth, height: bottomHeight },
    };
  }

  async function drawCustomOverlay(context, width, height) {
    const assets = await Promise.allSettled([loadAsset(overlayAssets.topLeft), loadAsset(overlayAssets.bottomRight)]);
    if (assets.some((asset) => asset.status === "rejected")) {
      assets.forEach((asset) => { if (asset.status === "fulfilled") asset.value.close(); });
      throw new Error("Rozetler yuklenemedi; ana gorsel gonderilmedi. PNG dosyalarini kontrol edin.");
    }
    const [topLeft, bottomRight] = assets.map((asset) => asset.value);
    try {
      const layout = overlayLayout(width, height, topLeft, bottomRight);
      context.drawImage(topLeft, layout.topLeft.x, layout.topLeft.y, layout.topLeft.width, layout.topLeft.height);
      context.drawImage(bottomRight, layout.bottomRight.x, layout.bottomRight.y, layout.bottomRight.width, layout.bottomRight.height);
    } finally {
      topLeft.close();
      bottomRight.close();
    }
  }

  globalThis.AlltaghausOverlay = { overlayAssets, overlayLayout, drawCustomOverlay };
})();
