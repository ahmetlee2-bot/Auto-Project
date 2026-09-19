import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://autolister-app.de"),
  title: {
    default: "AutoLister – Amazon zu eBay automatisieren | autolister-app.de",
    template: "%s | AutoLister",
  },
  description:
    "AutoLister automatisiert Amazon-zu-eBay-Listings, synchronisiert Bestand und Preise und hilft Online-Händlern, schneller zu verkaufen.",
  keywords: ["AutoLister", "Amazon zu eBay", "eBay Automation", "eBay Listings", "Bestand synchronisieren"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://autolister-app.de/",
    siteName: "AutoLister",
    title: "AutoLister – Amazon zu eBay automatisieren",
    description:
      "Produkte schneller bei eBay listen, Bestand synchronisieren und Bestellungen zentral verwalten.",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "AutoLister – Amazon zu eBay Automation" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoLister – Amazon zu eBay automatisieren",
    description: "eBay Listings, Bestände, Preise und Bestellungen in einem Dashboard.",
    images: ["/og-image.svg"],
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
