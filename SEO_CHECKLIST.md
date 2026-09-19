# AutoLister SEO / Google Indexing Checklist

## Uygulanan teknik güncellemeler

- Next.js metadata: title, 150–160 karakterlik Almanca description, keywords, canonical, Open Graph ve Twitter Card.
- `frontend/app/robots.ts`: tüm botlara izin verir ve `https://autolister-app.de/sitemap.xml` adresini bildirir.
- `frontend/app/sitemap.ts`: ana sayfa, kayıt, giriş, gizlilik ve kullanım şartları URL’lerini dinamik sitemap olarak üretir.
- Ana sayfaya `SoftwareApplication`, `Organization` ve `WebSite` JSON-LD eklendi.
- `lang="de"` korunuyor; site tek dilli olduğu için hreflang seti eklenmedi.
- `/og-image.svg` sosyal paylaşım önizlemesi olarak eklendi.

## Yayına aldıktan sonra GSC adımları

1. [Google Search Console](https://search.google.com/search-console) açın ve **Domain** mülkü olarak `autolister-app.de` ekleyin.
2. Google’ın verdiği DNS TXT kaydını domain sağlayıcınızın DNS paneline ekleyin. DNS yayılımından sonra GSC’de doğrulamayı tamamlayın. Alternatif olarak URL-prefix mülkünde HTML doğrulama dosyası kullanılabilir.
3. Sol menüden **Sitemaps** bölümüne gidin ve yalnızca `sitemap.xml` gönderin. Başarılı sonuç `https://autolister-app.de/sitemap.xml` olmalıdır.
4. **URL Denetimi** ekranında `https://autolister-app.de/` adresini test edin; canlı URL testi başarılıysa **Dizine eklenmesini iste** seçeneğine basın.
5. Aynı işlemi önemli herkese açık sayfalar için tekrarlayın. Oturum gerektiren dashboard sayfalarını sitemap’e eklemeyin.
6. GSC’de **Sayfalar**, **Core Web Vitals** ve **Güvenlik / Manuel işlemler** raporlarını ilk hafta düzenli kontrol edin.

## Organik büyüme planı

- `/blog` veya `/ratgeber` altında Almanca, arama niyetine göre içerik mimarisi kurun: “Amazon Produkte auf eBay verkaufen”, “eBay Bestand synchronisieren”, “eBay Listing automatisieren” gibi konularda özgün rehberler yayınlayın.
- Her yazıda tek bir ana konu, açıklayıcı H1/H2 başlıkları, iç bağlantılar ve ilgili ürün sayfasına doğal CTA kullanın. Kopya veya yapay içerik üretmeyin.
- Chrome Web Store profilini siteye, siteyi mağaza profiline bağlayın; Product Hunt, ilgili e-ticaret dizinleri ve Almanca satıcı topluluklarında gerçek kullanım faydasını anlatan lansmanlar yapın.
- Reddit, LinkedIn ve e-ticaret forumlarında tanıtım yerine sorulara yararlı teknik cevaplar verip yalnızca ilgili olduğunda bağlantı paylaşın.
- Kullanıcı yorumları, vaka çalışmaları ve entegrasyon sayfalarıyla güven sinyalleri oluşturun; spam backlink paketlerinden kaçının.
- Search Console sorgularını aylık inceleyip düşük CTR’lı sayfalarda title/description testleri yapın; dönüşümü Analytics veya benzeri ölçümle takip edin.

## Gerçekçi beklenti

İndeksleme isteği garanti edilmiş sıralama anlamına gelmez. Yeni bir domain için tarama ve güven sinyallerinin oluşması günler veya haftalar sürebilir. DNS, HTTPS, 200 durum kodu ve robots/sitemap erişilebilirliği yayında ayrıca kontrol edilmelidir.
