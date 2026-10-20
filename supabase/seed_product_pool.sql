-- Idempotent, non-publishable preview records for the Product Depot.
-- These are synthetic examples, not real ASINs, offers, prices, stock or VERO assessments.-- Clearly marked preview records make the Depot UI usable before an operator
-- imports genuine catalog data. They are hidden from public queries and cannot
-- be approved, queued, or published.
with demo_products(asin, source_marketplace, title, amazon_price, estimated_shipping, category_hint) as (
  values
    ('DEMO000001', 'AMZ_DE', 'DEMO · OBD2 Bluetooth Diagnoseadapter', 18.90::numeric, 3.90::numeric, 'Automotive Elektronik'),
    ('DEMO000002', 'AMZ_US', 'DEMO · OBD2 Wireless Diagnoseadapter', 21.50::numeric, 4.50::numeric, 'Automotive Electronics'),
    ('DEMO000003', 'AMZ_DE', 'DEMO · Digitales Reifendruckmessgerät', 12.80::numeric, 2.90::numeric, 'Autozubehör'),
    ('DEMO000004', 'AMZ_US', 'DEMO · Digital Tire Pressure Gauge', 14.25::numeric, 3.50::numeric, 'Automotive Accessories'),
    ('DEMO000005', 'AMZ_DE', 'DEMO · Magnetische Handyhalterung', 16.40::numeric, 3.20::numeric, 'Autozubehör'),
    ('DEMO000006', 'AMZ_US', 'DEMO · Magnetic Car Phone Mount', 17.95::numeric, 3.75::numeric, 'Automotive Accessories'),
    ('DEMO000007', 'AMZ_DE', 'DEMO · Sicherungsprüfer für Fahrzeuge', 11.90::numeric, 2.80::numeric, 'Automotive Elektronik'),
    ('DEMO000008', 'AMZ_US', 'DEMO · Automotive Fuse Tester Kit', 13.60::numeric, 3.10::numeric, 'Automotive Electronics'),
    ('DEMO000009', 'AMZ_DE', 'DEMO · Espressostampfer aus Edelstahl', 19.50::numeric, 3.60::numeric, 'Kaffee und Espresso'),
    ('DEMO000010', 'AMZ_US', 'DEMO · Stainless Espresso Tamper', 22.75::numeric, 4.25::numeric, 'Coffee and Espresso'),
    ('DEMO000011', 'AMZ_DE', 'DEMO · Digitale Kaffeewaage mit Timer', 24.90::numeric, 4.20::numeric, 'Kaffee und Espresso'),
    ('DEMO000012', 'AMZ_US', 'DEMO · Coffee Scale with Timer', 26.80::numeric, 4.80::numeric, 'Coffee and Espresso'),
    ('DEMO000013', 'AMZ_DE', 'DEMO · Abschlagbox für Espressosatz', 17.20::numeric, 3.50::numeric, 'Kaffee und Espresso'),
    ('DEMO000014', 'AMZ_US', 'DEMO · Espresso Knock Box', 18.60::numeric, 3.95::numeric, 'Coffee and Espresso'),
    ('DEMO000015', 'AMZ_DE', 'DEMO · Edelstahl-Milchkännchen 350 ml', 10.90::numeric, 2.70::numeric, 'Küche'),
    ('DEMO000016', 'AMZ_US', 'DEMO · Stainless Milk Frothing Pitcher', 12.40::numeric, 3.00::numeric, 'Home and Kitchen'),
    ('DEMO000017', 'AMZ_DE', 'DEMO · Verstellbarer Schubladenteiler', 15.80::numeric, 3.40::numeric, 'Ordnung und Aufbewahrung'),
    ('DEMO000018', 'AMZ_US', 'DEMO · Adjustable Drawer Organizer Set', 18.30::numeric, 4.00::numeric, 'Storage and Organization'),
    ('DEMO000019', 'AMZ_DE', 'DEMO · Kabelmanagement-Set für den Schreibtisch', 9.95::numeric, 2.50::numeric, 'Büro'),
    ('DEMO000020', 'AMZ_US', 'DEMO · Desk Cable Management Kit', 11.80::numeric, 2.90::numeric, 'Office Products'),
    ('DEMO000021', 'AMZ_DE', 'DEMO · Modulares 3D-Schreibtisch-Organizer-Set', 14.70::numeric, 3.30::numeric, 'Büro und Schreibtisch'),
    ('DEMO000022', 'AMZ_US', 'DEMO · Modular 3D Desk Organizer Set', 16.90::numeric, 3.75::numeric, 'Office and Desk'),
    ('DEMO000023', 'AMZ_DE', 'DEMO · Vertikaler Kopfhörerständer', 13.50::numeric, 3.10::numeric, 'Büro und Schreibtisch'),
    ('DEMO000024', 'AMZ_US', 'DEMO · Vertical Headphone Stand', 15.60::numeric, 3.45::numeric, 'Office and Desk'),
    ('DEMO000025', 'AMZ_DE', 'DEMO · Tablet- und Buchständer, faltbar', 20.40::numeric, 3.80::numeric, 'Home und Büro')
), computed as (
  select *, ceil(((amazon_price + estimated_shipping) * 1.20 / 0.85 - 0.00000001) * 100) / 100 as suggested_price
  from demo_products
)
insert into public.product_pool
  (asin, source_marketplace, title, description, brand, condition, category_id, amazon_price,
   suggested_ebay_price, estimated_profit, estimated_shipping, images, item_specifics,
   is_vero_safe, stock_status, is_published, is_demo)
select
  asin,
  source_marketplace,
  title,
  'DEMO-Datensatz ohne Live-Preis, Bestand, Bild- oder Rechteprüfung. Importiere echte Produktdaten und prüfe Kategorie, Nutzungsrechte und VERO-Risiko vor jeder Freigabe.',
  null,
  'NEW',
  null,
  amazon_price,
  suggested_price,
  greatest(0, round(suggested_price * 0.85 - amazon_price - estimated_shipping, 2)),
  estimated_shipping,
  jsonb_build_array('/assets/demo-product.svg'),
  jsonb_build_object('Demo-Kategorie', category_hint, 'Datentyp', 'Vorschau'),
  false,
  'out_of_stock',
  false,
  true
from computed
on conflict (asin, source_marketplace) do nothing;
