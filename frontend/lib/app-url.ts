export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || "https://autolister-app.de";
  try {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && (url.protocol !== "https:" || /^(localhost|127\.|\[::1\])/.test(url.hostname))) return "https://autolister-app.de";
    return url.origin;
  } catch { return "https://autolister-app.de"; }
}
