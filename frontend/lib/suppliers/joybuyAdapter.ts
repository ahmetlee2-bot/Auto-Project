import "server-only";
import { load } from "cheerio";
import type { NormalizedSupplierProduct, SupplierAdapter } from "./types";

function productUrl(input: string): { url: URL; id: string } {
  let url: URL;
  try { url = new URL(/^\d+$/.test(input.trim()) ? `https://www.joybuy.de/dg/${input.trim()}` : input.trim()); }
  catch { throw new Error("Bitte eine gültige Joybuy.de Produkt-URL oder SKU eingeben."); }
  if (url.protocol !== "https:" || !/(^|\.)joybuy\.de$/i.test(url.hostname)) throw new Error("Nur Joybuy.de Produktlinks werden unterstützt.");
  const id = url.pathname.match(/\/(?:dp\/[^/]+\/|dg\/|landingPage\/dp\/)(\d{6,20})(?:\/|$)/i)?.[1];
  if (!id) throw new Error("Keine Joybuy-Produkt-ID in der URL gefunden.");
  return { url, id };
}
const text = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function normalizeImage(value: string): string { try { const u = new URL(value, "https://www.joybuy.de"); if (u.protocol !== "https:" || !/(^|\.)joy-sourcing\.com$/i.test(u.hostname) || !/\/product\/s\d+x\d+_/i.test(u.pathname)) return ""; u.search = ""; return u.toString(); } catch { return ""; } }
function harvest(html: string, url: URL, id: string): NormalizedSupplierProduct | null {
  const $ = load(html);
  const metas = (key: string) => $(`meta[property="${key}"],meta[name="${key}"]`).first().attr("content") || "";
  const scripts = $('script[type="application/ld+json"]').toArray().flatMap((el) => { try { const x = JSON.parse($(el).text()); return Array.isArray(x) ? x : [x]; } catch { return []; } });
  const p = scripts.find((x: any) => String(x?.["@type"]).toLowerCase().includes("product")) as any;
  const offers = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
  const title = text(String(p?.name || metas("og:title") || $("title").text()));
  const price = Number(String(offers?.price || metas("product:price:amount") || "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0]);
  const rawImages = [p?.image, metas("og:image"), ...$("[class*='mainImageFloor_imgShowThumbnail'] img").toArray().map((el) => $(el).attr("data-src") || $(el).attr("src"))].flat().filter((x) => typeof x === "string").map(normalizeImage).filter(Boolean);
  const images = [...new Set(rawImages)].slice(0, 12);
  if (!title || !Number.isFinite(price) || price <= 0 || !images.length) return null;
  const specs: Record<string,string> = {};
  $("table tr,[role='row']").each((_, row) => {
    const cells = $(row).find("th,td,[role='rowheader'],[role='columnheader'],[role='cell']").toArray().map((el) => text($(el).text())).filter(Boolean);
    if (cells.length > 1 && cells[0] && cells[1]) specs[cells[0]] = cells.slice(1).join(" ");
  });
  const bullets = $("li").toArray().map((el) => text($(el).text())).filter((x) => x.length > 20).slice(0, 15);
  const availability = `${offers?.availability || ""} ${text($("body").text())}`;
  const inStock = /outofstock|nicht verfügbar|nicht lieferbar|ausverkauft/i.test(availability) ? false : /instock|lieferbar|auf lager|verfügbar/i.test(availability) ? true : null;
  if (inStock === null) return null;
  return { supplier:"joybuy_de", supplierProductId:id, sourceUrl:url.toString(), rawTitle:title, priceEur:Math.round(price*100)/100, inStock, images, bulletPoints:bullets, specifications:specs, rawDescription:text(p?.description || metas("description")) };
}
async function read(url: URL, id: string): Promise<NormalizedSupplierProduct | null> {
  const response = await fetch(url, { headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","Accept-Language":"de-DE,de;q=0.9","Accept":"text/html,application/xhtml+xml"}, redirect:"follow", cache:"no-store", signal:AbortSignal.timeout(20000) });
  if (!response.ok) return null;
  const html = await response.text();
  if (/risk control|security verification|captcha|sicherheitsüberprüfung/i.test(html)) return null;
  return harvest(html, url, id);
}
export const joybuyAdapter: SupplierAdapter = { id:"joybuy_de", canHandle(input) { try { return /(^|\.)joybuy\.de$/i.test(new URL(input).hostname) || /^\d{6,20}$/.test(input.trim()); } catch { return false; } }, async fetchProduct(input) { const {url,id}=productUrl(input); const product=await read(url,id).catch(()=>null); if(!product) throw new Error("Joybuy-Daten waren nicht vollständig verfügbar; ohne verifizierten Preis, Bestand und Bilder wurde kein Entwurf erstellt."); return product; } };
