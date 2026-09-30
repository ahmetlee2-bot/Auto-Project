import type { Metadata } from "next";
import "./globals.css";
import "./saas.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://autolister-app.de"),
  title: {
    default: "AutoLister — 1-Klick Amazon zu eBay Dropshipping & Cloud-Sync",
    template: "%s | AutoLister",
  },
  description:
    "Amazon-Produktdaten für eBay-Listings vorbereiten, Entwürfe prüfen und Server-Aufträge im AutoLister Dashboard verfolgen.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  keywords: [
    "AutoLister",
    "Amazon zu eBay",
    "eBay Automation",
    "eBay Listings",
    "Bestand synchronisieren",
  ],
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://autolister-app.de/",
    siteName: "AutoLister",
    title: "AutoLister — Amazon zu eBay in einem Cloud-Workflow",
    description:
      "Produkte importieren, eBay-Entwürfe prüfen und Server-Aufträge zentral verfolgen.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AutoLister Dashboard und Cloud-Workflow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoLister — Amazon zu eBay in einem Cloud-Workflow",
    description:
      "Produktimport, eBay-Listings und Server-Aufträge in einem Dashboard.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  verification: {
    google: "_L3Wl0isi_zC97IidhOnuUssBTmsl-yjY_4ntIuM1j8",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="alternate icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
