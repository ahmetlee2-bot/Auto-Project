import type { Metadata } from "next";
import "./globals.css";
import "./saas.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://autolister-app.de"),
  title: {
    default: "AutoLister — 1-Klick Amazon zu eBay Dropshipping & Cloud-Sync",
    template: "%s | AutoLister",
  },
  description: "Amazon-Produktdaten für eBay-Listings vorbereiten, Entwürfe prüfen und Server-Aufträge im AutoLister Dashboard verfolgen.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  keywords: ["AutoLister", "Amazon zu eBay", "eBay Automation", "eBay Listings", "Bestand synchronisieren"],
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://autolister-app.de/",
    siteName: "AutoLister",
    title: "AutoLister — Amazon zu eBay in einem Cloud-Workflow",
    description: "Produkte importieren, eBay-Entwürfe prüfen und Server-Aufträge zentral verfolgen.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AutoLister Dashboard und Cloud-Workflow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoLister — Amazon zu eBay in einem Cloud-Workflow",
    description: "Produktimport, eBay-Listings und Server-Aufträge in einem Dashboard.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  verification: {
    google: "_L3Wl0isi_zC97IidhOnuUssBTmsl-yjY_4ntIuM1j8",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
