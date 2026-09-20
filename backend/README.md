# Alltaghaus SaaS Backend

Node.js API katmanı Supabase service role anahtarını yalnızca sunucu ortamından okur; Chrome extension'a hiçbir gizli anahtar verilmez.

Kurulum:

```powershell
cd backend
npm install
Copy-Item .env.example .env
# .env içine Supabase ve eBay değerlerini gir
npm run check
npm start
```

Supabase SQL Editor'de `src/db/schema.sql` dosyasını çalıştırın. Ürün oluşturma endpoint'i geçerli Supabase Bearer token ister.
