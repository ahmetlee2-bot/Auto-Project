import type { MetadataRoute } from "next";
import { legalIdentity } from "../lib/legal";

const baseUrl = "https://autolister-app.de";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
      lastModified: new Date(),
    },
  ];

  // Auth pages are intentionally noindex. Keep placeholder legal pages out of
  // the sitemap too; publish the canonical app-router versions once configured.
  if (!legalIdentity().isExample) {
    pages.push(
      { url: `${baseUrl}/impressum`, changeFrequency: "yearly", priority: 0.3 },
      { url: `${baseUrl}/datenschutz`, changeFrequency: "yearly", priority: 0.3 },
    );
  }

  return pages;
}
