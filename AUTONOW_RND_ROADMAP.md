# AUTONOW R&D Roadmap

## 1. Projenin cekirdegi

AUTONOW'un asil degeri "AI var" olmasi degil.
Asil deger:

- Uygun araci bulmak
- Riski hizli anlamak
- Kar potansiyelini hesaplamak
- Pazarlikta avantaj saglamak
- Portfoyu takip etmek

Bu urun, genel kullaniciya degil once "kucuk capli arac alip satan kisi" icin tasarlanmali.
Ilk kullanici zaten sensin. Bu buyuk avantaj.

## 2. Kullanici profili

Ilk hedef persona:

- Hamburg'da yasiyor
- Turkce konusuyor, Almanca da kullaniyor
- Kfz Ausbildung yapiyor
- Arac ve parca al-sat tarafina girmek istiyor
- Dusuk butceli veya firsat araclari hizli analiz etmek istiyor
- Kleinanzeigen, Facebook Marketplace ve benzeri kaynaklari surekli takip etmek istiyor

Bu profil dogru kuruldugunda urun daha sonra su segmentlere acilabilir:

- Kucuk galericiler
- Export yapan arac toplayicilar
- Parca al-sat yapanlar
- Kendi aracini akilli satmak isteyen bireysel kullanicilar

## 3. Mevcut prototipin durumu

Mevcut HTML prototipi guclu bir demo hissi veriyor ama urun degil.

Su an var olanlar:

- Iyi bir arayuz vizyonu
- Dogru moduller: scan, valuation, analyzer, negotiation, portfolio
- Kullaniciya deger teklifini anlatan bir akis

Su an eksik olanlar:

- Gercek veri toplama
- Kalici veri tabani
- Guvenli AI entegrasyonu
- Kullanici hesaplari
- Gercek fiyat/model dogrulama
- Kaynaklardan surekli veri guncelleme

Sonuc:
Bu prototip cop degil. Tam tersine, iyi bir product concept demo.
Ama su anda karar motoru ve veri motoru henuz yok.

## 4. Dogru urun tezi

AUTONOW'u "arac ilan sitesi" gibi dusunmemek lazim.
En dogru konumlandirma:

"AI destekli deal intelligence ve flipping cockpit"

Yani urun su soruya cevap vermeli:

"Bu ilani almaya deger mi, ne kadar teklif vermeliyim, ne kadar masraf cikar, kac gunde satarim, ne kadar kar ederim?"

## 5. MVP tanimi

Ilk gercek MVP'de her seyi ayni anda yapmaya gerek yok.
En dogru MVP:

- Kullanici ilan linki veya ilan metni girer
- Sistem ilani parse eder
- Arac ozelliklerini normalize eder
- AI risk ve pazarlik analizi yapar
- Sistem masraf ve kar tahmini cikarir
- Kullanici ilani kaydeder
- Portfoy ve favoriler tutulur

Bu asamada tam otomatik scraping zorunlu degil.
Once "insan destekli akilli analiz" ile baslamak daha dogru.

## 6. Neyi once yapmaliyiz, neyi ertelemeliyiz

Ilk asamada yap:

- Ilandan veri cikarma
- AI analiz
- Kar hesaplama
- Portfoy takibi
- Favori ilan takibi
- Basit kullanici sistemi

Ilk asamada ertele:

- Tum siteleri canli tarama
- Buyuk olcekli scraping
- Kendi fiyat tahmin modeli
- Otomatik mesaj gonderme
- Mobil uygulama
- Cok ulkeli genisleme

## 7. Teknik mimari onerisi

Onerilen yapi:

- Frontend: Next.js + TypeScript
- Backend API: Python FastAPI
- Database: PostgreSQL
- Queue/worker: Celery veya RQ
- Cache: Redis
- AI gateway: backend uzerinden Anthropic/OpenAI
- Auth: Clerk veya Supabase Auth
- Hosting: Vercel (frontend) + Railway/Render (backend/db)

Neden bu yapi:

- Frontend hizli urunlestirilir
- Python veri isleme, scraping ve analiz icin daha uygundur
- AI keyleri browser yerine backend'de guvenli tutulur
- Sonradan worker ekleyip otomasyon kurmak kolay olur

## 8. Veri mimarisi

Temel tablolar:

- users
- sources
- listings
- vehicles
- analyses
- watchlists
- portfolios
- deals
- price_observations

Temel mantik:

- listing = ilanin ham hali
- vehicle = normalize edilmis arac verisi
- analysis = AI ve kural tabanli yorumlar
- deal = alis, masraf, satis, kar sonucu

Bu ayrim ileride cok is kurtarir.

## 9. AI'nin urundeki gercek rolu

AI'nin rolunu dogru sinirlamak lazim.

AI iyi yaptiklari:

- Ilandan bilgi cekme
- Eksik/verimsiz ilani yorumlama
- Riskleri metinden cikarimlama
- Pazarlik cumlesi olusturma
- Notlari ozetleme

AI'nin tek basina guvenilmemesi gereken yerler:

- Kesin piyasa degeri
- Kesin tamir maliyeti
- Kesin satis suresi
- Kesin hukuki/mevzuat yorumu

Bu yuzden iyi urun formulu:

AI + rule engine + kullanicinin saha bilgisi + zamanla biriken kendi veri setin

## 10. En buyuk AR-GE riskleri

1. Veri kaynagi riski
Marketplace siteleri scraping'e karsi koruma koyabilir, HTML yapisini degistirebilir veya hukuki kisitlar olabilir.

2. Veri kalitesi riski
Ilanlar eksik, yaniltici veya manipule edilmis olabilir.

3. Fiyat tahmini riski
Aracin gercek satis fiyati ile ilan fiyati ayni degildir.

4. Tamir maliyeti riski
Ayni ariza farkli araclarda cok farkli masraf cikarabilir.

5. Guven riski
Kullanici AI'nin her dedigini dogru sanirsa zarar edebilir.

Bu nedenle urunde guven skor, belirsizlik bandi ve "neden boyle dusunuyoruz" aciklamasi olmalidir.

## 11. Fazlara gore gelisim plani

### Faz 0 - Product discovery ve prototip temizlik
Sure: 3-7 gun

Hedef:

- Mevcut HTML prototipi sadeleştir
- Karakter encoding sorunlarini temizle
- Demo veriyi ayikla
- Ekranlari gercek urun akisina gore tekrar isimlendir
- Hangi ekran MVP'ye giriyor netlestir

Cikti:

- Temiz UI prototipi
- Ekran listesi
- Net MVP siniri

### Faz 1 - Gercek MVP iskeleti
Sure: 1-2 hafta

Hedef:

- Frontend + backend ayrimi
- Guvenli AI cagrisi
- Link/metin ile ilan analizi
- Sonucu veritabaniyla kaydetme

Cikti:

- Kullanici ilan linki girer
- Sistem analiz doner
- Kullanici favoriye ve portfoye ekler

### Faz 2 - Deal engine
Sure: 1-2 hafta

Hedef:

- Alis fiyatı
- Tahmini masraf
- Hazirlik gideri
- Komisyon
- Hedef satis
- Net kar
- Risk seviyesi

icin standard bir hesap motoru kurmak

Bu faz kritik cunku urunun bel kemiği budur.

### Faz 3 - Yari otomatik kaynak toplama
Sure: 2-4 hafta

Hedef:

- Kullanici filtre tanimlar
- Sistem belirli periyotlarla yeni ilanlari toplar
- Kullaniciya uygun ilanlari listeler

Burada ilk adim tam scraping olmak zorunda degil.
Alternatifler:

- Kaydedilmis arama URL'leri
- E-posta bildirimlerini parse etme
- Browser extension
- Manual import + AI parse

### Faz 4 - Skorlama ve ogrenme
Sure: 3-6 hafta

Hedef:

- Gecmis ilanlardan kendi veri setini toplamak
- Hangi araclarda kar cikti, hangilerinde cikmadi anlamak
- Basit bir firsat skoru modeline gecmek

Bu noktada artik urun "AI wrapper" olmaktan cikmaya baslar.

### Faz 5 - Operasyon paneli
Sure: 2-3 hafta

Hedef:

- Portfoy takibi
- Satin alinan araclar
- Yapilan masraflar
- Satildi/satista/hazirlaniyor durumlari
- Gerceklesen kar takibi

Bu faz seni dogrudan sahada destekler.

## 12. Zaman tahmini

Tek kisi ve part-time tempo ile:

- Kullanilabilir ilk MVP: 4-8 hafta
- Gercek veriyle anlamli beta: 2-3 ay
- Operasyonel olarak guclu urun: 4-6 ay

Kucuk ekip ile:

- 2 kisilik ekip: 6-10 hafta icinde ciddi beta
- 3 kisilik ekip: 2-4 ay icinde guclu ilk versiyon

## 13. Para kazandiran kisim neresi

Uzun vadede asil deger su 3 yerde birikir:

- En iyi veri toplama sistemi
- En dogru kar/risk skoru
- Kullaniciya zaman kazandiran operasyon paneli

AI tek basina savunulabilir bir avantaj degil.
Ama veri + workflow + guvenilir skor avantaj olabilir.

## 14. Benim stratejik onerim

Sirayla su yolu izlemek en mantiklisi:

1. HTML prototipi temizle ve gercek MVP ekranlarini ayikla
2. Tek linkten ilan analizi yapan calisir MVP kur
3. Favori/portfoy ve hesap motorunu kalici hale getir
4. Yari otomatik ilan toplama ekle
5. Kendi veri setini biriktir
6. Sonra akilli firsat skoru gelistir

## 15. Hemen sonraki teknik adim

Bir sonraki uygulama sprintinde yapilacak en dogru is:

- `autonow.html` dosyasini urun modullerine gore sadeleştirmek
- AI cagrilarini browser'dan cikarmak
- MVP icin frontend/backend ayrimi planlamak
- Ilk veri modeli ve API contract'larini yazmak

## 16. Karar

Bu fikir teknik olarak gerceklesebilir.
Ama basarinin anahtari guzel ekran degil.

Basarinin anahtari:

- dogru niche
- veri toplama disiplini
- guvenli sistem mimarisi
- sahadaki gercek al-sat bilgini urune cevirmek

Bu projede en degerli sey senin saha tecrubene donusecek olan bilgi birikimi.
AUTONOW o bilgiyi yazilima cevirirse degerli olur.
