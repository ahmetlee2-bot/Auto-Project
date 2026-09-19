import type { MetadataRoute } from "next";

const baseUrl = "https://autolister-app.de";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "weekly", priority: 1, lastModified: new Date() },
    { url: `${baseUrl}/register`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/privacy-policy.html`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms.html`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
