# AutoLister sunucu otomasyonu

`compose.yml` sunucuda frontend, API ve eBay köprüsünü çalıştırır. Chrome eklentisi Amazon ürününü ilk kez okur ve galeri dosyalarını API'ye teslim eder. Sunucudaki eBay köprüsü taslağı oluşturur, yayın kontrolünü yapar, ilanı yayınlar ve sonucu kalıcı Docker volume'üne yazar. Bilgisayar kapatılsa da kabul edilmiş iş sunucuda devam eder.

## Sunucu sırları

- Sunucu kökündeki `.env` içinde `EBAY_BRIDGE_SHARED_SECRET` için rastgele en az 32 baytlık değer ve `EBAY_LEGACY_OWNER_USER_ID` için eBay hesabına sahip AutoLister kullanıcı UUID'si bulunmalıdır.
- Sunucu kökündeki `ebay-bridge.env` dosyası yerel köprüde kullanılan Production eBay OAuth ve satıcı ayarlarını içerir. `EBAY_MODE=api`, `EBAY_ENV=production`, `EBAY_CREDENTIAL_ENV=production`, geçerli refresh token ve otomatik yayın isteniyorsa `ALLOW_LIVE_PUBLISH=true` gerekir.
- Bu iki dosya Git'e eklenmez. `EBAY_BRIDGE_SHARED_SECRET` iki container'a Compose tarafından aktarılır. Köprü yalnızca `app-internal` Docker ağına bağlıdır; dışarıya port açılmaz.

## Dağıtım

1. Sunucuda mevcut Compose projesinin ve veri volume'lerinin yedeğini alın.
2. Yeni frontend, API ve eBay köprüsü imajlarını oluşturun veya GHCR'a yayınlanan etiketi çekin.
3. `docker compose -f compose.yml config` ile yapılandırmayı doğrulayın.
4. `docker compose -f compose.yml up -d ebay-bridge api frontend` çalıştırın.
5. `docker compose -f compose.yml ps` ve `https://api.autolister-app.de/api/v1/health` sonucunu kontrol edin.
6. AutoLister hesabıyla `/api/v1/ebay/readiness` çağrısının `ready: true` ve `livePublishEnabled: true` döndürdüğünü doğrulayın.

Başlangıç için eBay köprüsü Docker volume'ü `ebay-bridge-data` kullanır. Windows'taki eski taslaklar gerekiyorsa `production-drafts.json` dosyasını sunucudaki volume'e, `drafts.json` adıyla, mevcut sunucu dosyası yedeklendikten sonra aktarın. Yayındaki ilanları yanlışlıkla ikinci kez yayınlamamak için bu veri önemli olabilir.

`restart: unless-stopped` container'ları Docker açılışında yeniden başlatır. Sunucuda Docker servisinin açılışta etkin olduğunu ayrıca doğrulayın.
