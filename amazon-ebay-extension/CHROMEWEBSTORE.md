# Chrome Web Store Listing — Alltaghaus Amazon to eBay

> Last Updated: 2026-09-27

## Store Listing

**Extension Name**

Alltaghaus Amazon to eBay

**Short Description**

Erfasst Amazon.de-Produktdaten und bereitet daraus eBay-Angebotsentwürfe in deinem AutoLister-Konto vor.

**Detailed Description**

Alltaghaus Amazon to eBay erfasst Produktdaten auf einer von dir geöffneten Amazon.de-Produktseite und bereitet daraus einen eBay-Angebotsentwurf in deinem AutoLister-Konto vor.

Die Erweiterung liest Titel, Preis, Verfügbarkeit, Bilder und Produktmerkmale der aktuellen Amazon.de-Produktseite. Du legst Marge, Menge und die Bestätigung der Bildnutzungsrechte fest. Der AutoLister-Server erstellt daraus einen Entwurf und verarbeitet ihn weiter für eBay.de.

So verwendest du die Erweiterung: Öffne eine Amazon.de-Produktseite, klicke auf das Erweiterungssymbol, melde dich bei deinem AutoLister-Konto an, prüfe die Angaben und starte den Auftrag. Die Verarbeitung wird im Dashboard angezeigt.

Produktdaten werden nur für den von dir ausgelösten Import an AutoLister übertragen. Zugangsdaten werden nur zur Anmeldung verwendet. Details stehen in der Datenschutzerklärung.

Support und Datenschutzanfragen: ahmetmetin4201@gmail.com

Version 1.0.2: Entfernt nicht benötigte Berechtigungen und begrenzt den Zugriff auf die tatsächlich unterstützten Domains.

**Category**

Shopping

**Single Purpose**

Überträgt auf Nutzeraktion Produktdaten von Amazon.de zur Erstellung von eBay-Angebotsentwürfen in AutoLister.

**Primary Language**

German

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | icons/icon128.png |
| Screenshot 1 | 1280×800 | ✅ Ready | autolister-extension-screenshot-1280x800.png |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| tabs | permissions | Liest die URL des aktuell geöffneten Tabs, damit die Erweiterung nur auf einer Amazon.de-Produktseite arbeitet. |
| storage | permissions | Speichert lokale Einstellungen, den Anmeldestatus für die laufende Browser-Sitzung und den zuletzt erfassten Produktstatus. |
| scripting | permissions | Liest auf Nutzeraktion die Produktdaten der aktuell geöffneten Amazon.de-Produktseite aus, wenn die Seite nach dem Laden erneut geprüft werden muss. |
| https://*.amazon.de/* | host_permissions | Erfasst Produktdaten nur auf Amazon.de-Produktseiten, die der Nutzer selbst geöffnet hat. |
| https://*.media-amazon.com/* | host_permissions | Liest die zugehörigen Amazon-Produktbilder für den ausdrücklich ausgelösten Angebotsentwurf. |
| https://*.ssl-images-amazon.com/* | host_permissions | Liest Amazon-Produktbilder, wenn Amazon sie über diesen Bildhost bereitstellt. |
| https://images-na.ssl-images-amazon.com/* | host_permissions | Liest Amazon-Produktbilder, wenn Amazon sie über diesen Bildhost bereitstellt. |
| https://api.autolister-app.de/* | host_permissions | Überträgt den vom Nutzer gestarteten Importauftrag an das AutoLister-Konto und liest den Auftragsstatus. |
| https://rdwqrygkkzzouiamrxwq.supabase.co/* | host_permissions | Meldet den Nutzer bei seinem AutoLister-Konto an und erneuert die Sitzung. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|------------|------------------------|---------|---------------------------|
| Authentication info | Yes | Yes | Anmeldung beim AutoLister-Konto | Supabase verarbeitet die Anmeldung für AutoLister. |
| User activity | Yes | Yes | Der vom Nutzer gestartete Importauftrag und dessen Status | Nein, außer für die angeforderte eBay-Angebotserstellung. |
| Website content | Yes | Yes | Titel, Preis, Verfügbarkeit, Bilder, Beschreibung und Merkmale der vom Nutzer geöffneten Amazon.de-Produktseite | An AutoLister; erforderliche Angebotsdaten an eBay für die Erstellung des Entwurfs. |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**

https://autolister-app.de/privacy-policy.html

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**

Alltaghaus

**Contact Email**

ahmetmetin4201@gmail.com

**Support URL / Email**

ahmetmetin4201@gmail.com

**Homepage URL**

https://autolister-app.de

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.2 | 2026-09-27 | Removed unused permissions and narrowed domain access to supported services. | Draft |
| 1.0.1 | 2026-09-26 | Removed unused offscreen and declarative network request permissions. | Draft |
| 1.0.0 | 2026-09-21 | Rejected: unused permissions. | Rejected |

## Review Notes

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| 2026-09-21 | Purple Potassium: unused `offscreen` and `declarativeNetRequest` permissions. | Both permissions removed in 1.0.1. Additional permission minimization completed in 1.0.2. | Pending |
