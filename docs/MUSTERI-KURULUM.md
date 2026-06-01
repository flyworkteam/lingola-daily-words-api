# Lingola Daily Words API — Sunucu kurulumu (müşteri)

Bu belge, **geliştiricinin sunucuya SSH erişimi olmadan** hosting sağlayıcısında API’yi çalıştırmak içindir. Adımları hosting panelinden (cPanel, Plesk, DirectAdmin) **Terminal** veya destek ekibi uygulayabilir.

## Gereksinimler

- Sunucu IP: **5.39.8.160**
- Node.js **20** veya üzeri
- MySQL veritabanı: `lingoladailywords` (zaten oluşturulmuş olmalı)
- Gelen bağlantı portu: **3000** (veya reverse proxy ile 443)

## 1. Dosyaları yükleyin

Geliştiricinin gönderdiği zip’i sunucuda bir klasöre açın, örneğin:

`/home/kullanici/lingola-api/`

## 2. `.env` dosyası

Klasörde `.env` oluşturun (geliştiricinin `env.sunucu.template` dosyasındaki değerleri kullanın):

```env
PORT=3000
HOST=0.0.0.0
PUBLIC_API_BASE_URL=http://5.39.8.160:3000

DATABASE_URL="mysql://lingoladailywordsUser:SIFRE@127.0.0.1:3306/lingoladailywords"

FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
ADMIN_API_KEY=...
VERB_API_BASE_URL=http://verbs.fly-work.com/api
VERB_API_TOKEN=...

CDN_HOSTNAME=lingoladailywords.b-cdn.net
CDN_USERNAME=lingoladailywords
CDN_PASSWORD=...
```

**Önemli:** `HOST` satırına asla `5.39.8.160` yazmayın; sadece `0.0.0.0`.  
MySQL şifresinde `?` `]` gibi karakterler varsa geliştirici URL-encode edilmiş halini verecektir.

## 3. Firebase dosyası

`secrets/firebase-service-account.json` dosyasını geliştiriciden alıp `secrets/` klasörüne koyun.

## 4. Kurulum komutları

Proje klasöründe:

```bash
npm install
npm run production:setup
```

Başarılıysa:

```bash
curl -s http://127.0.0.1:3000/health
```

Yanıt: `"ok":true,"database":"up"`

## 5. API’yi sürekli çalıştırma

### PM2 (önerilir)

```bash
npm install -g pm2
pm2 start src/server.js --name lingola-api
pm2 save
pm2 startup
```

### veya hosting “Node.js uygulaması”

- Başlangıç dosyası: `src/server.js`
- Port: `3000`
- Çalışma dizini: proje kökü

## 6. Kelimeleri yükleme

API çalışırken aynı klasörde:

```bash
npm run admin:import-all
```

Bu işlem birkaç dakika sürebilir.

## 7. Dış erişim testi

Başka bir bilgisayardan veya telefondan:

`http://5.39.8.160:3000/health`

`ok: true` görmelisiniz. Görmüyorsanız firewall’da **3000** portunu açtırın.

## 8. Mobil uygulama

Uygulama adresi: **`http://5.39.8.160:3000`** (HTTPS kurulduysa `https://...`)

Kurulum tamamlandığında geliştiriciye şu çıktıyı iletin:

- `curl http://127.0.0.1:3000/health` sonucu
- `npm run admin:import-all` son satırı (başarılı mı)

## Sık sorunlar

| Sorun | Çözüm |
|-------|--------|
| `EADDRNOTAVAIL` | `.env` içinde `HOST=0.0.0.0` olmalı |
| `database: down` | `DATABASE_URL` host `127.0.0.1` olmalı; MySQL çalışıyor mu kontrol edin |
| Dışarıdan `/health` açılmıyor | Port 3000 firewall |
| Uygulamada kelime yok | `npm run admin:import-all` çalıştırılmamış |
