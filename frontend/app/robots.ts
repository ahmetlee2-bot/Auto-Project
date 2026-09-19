import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://autolister-app.de/sitemap.xml",
    host: "https://autolister-app.de",
  };
}
