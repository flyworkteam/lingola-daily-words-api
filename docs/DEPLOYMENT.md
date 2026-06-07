# Sunucu kurulumu (müşteri — 5.39.8.160)

Geliştiricinin SSH erişimi yoksa önce [`SSH-ERISIMI-YOK.md`](./SSH-ERISIMI-YOK.md) okuyun; müşteriye [`MUSTERI-KURULUM.md`](./MUSTERI-KURULUM.md) gönderin.

API **sunucuda** çalışır; MySQL aynı makinede. Flutter uygulaması bu sunucunun **public IP** ve portuna istek atar.

## 1. `.env` (sunucuda)

```env
PORT=3000
HOST=0.0.0.0

# API aynı makinede olduğu için MySQL için 127.0.0.1 kullanın (5.39.8.160 değil)
# Şifrede ? ] @ # vb. varsa URL-encode edin (? → %3F, ] → %5D)
DATABASE_URL="mysql://lingoladailywordsUser:SIFRE@127.0.0.1:3306/lingoladailywords"

PUBLIC_API_BASE_URL=http://5.39.8.160:3000

FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
ADMIN_API_KEY=uzun-gizli-anahtar

VERB_API_BASE_URL=http://verbs.fly-work.com/api
VERB_API_TOKEN=...

CDN_HOSTNAME=lingoladailywords.b-cdn.net
CDN_USERNAME=lingoladailywords
CDN_PASSWORD=...
```

| Değişken | Açıklama |
|----------|----------|
| `HOST` | **Her zaman** `0.0.0.0` veya `127.0.0.1`. Asla MySQL IP’si yazmayın. |
| `DATABASE_URL` host | Sunucuda: `127.0.0.1`. Mac’ten uzak DB: `5.39.8.160` (firewall izni gerekir). |
| `PUBLIC_API_BASE_URL` | Flutter’ın kullanacağı tam API kökü |

## 2. Kurulum komutları (SSH ile sunucuda)

```bash
cd "LingolaDaily WordsBackend"
npm install
mkdir -p secrets
# firebase-service-account.json → secrets/

npm run production:setup    # migration + örnek kelimeler
npm run start               # veya: pm2 start src/server.js --name lingola-api
```

Sağlık kontrolü:

```bash
curl -s http://127.0.0.1:3000/health
# {"ok":true,"database":"up",...}
```

## 3. Kelimeleri veritabanına alma

**Tam sözlük (~28k kelime, A1–B2)** — sunucuda `.env` içinde `VERB_API_*` tanımlı olmalı:

```bash
npm run import:all
```

Eski yöntem (seviye başına ~300 kelime, yetersiz):

```bash
npm run admin:import-all
```

Yerel Mac'ten dump ile aktarma (`.env.local` + yerel MySQL dolu ise):

```bash
npm run db:export-local
# scp dist/lingoladailywords-local.sql müşteri sunucusuna
# sunucuda: mysql ... lingoladailywords < dosya.sql
```

Tek seviye:

```bash
curl -s -X POST http://127.0.0.1:3000/api/admin/import-words \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -d '{"level":"A1","targetLang":"tr","limit":50,"offset":0}'
```

## 4. Firewall

- **3306**: Sadece sunucu içi (dışarıya kapalı olması önerilir)
- **3000** (veya nginx **443**): Flutter / internet erişimi için açık

## 5. Flutter entegrasyonu

Bkz. [FLUTTER.md](./FLUTTER.md)

Özet:

1. `baseUrl = http://5.39.8.160:3000` (HTTPS varsa onu kullanın)
2. Girişten sonra `POST /api/v1/auth/session` + `{ "idToken": "..." }`
3. Sonraki istekler: `Authorization: Bearer <firebase_id_token>`
4. Kelimeler: `GET /api/vocabulary`, `GET /api/vocabulary/daily-word`, vb.

## 6. Sık hatalar

| Belirti | Çözüm |
|---------|--------|
| `EADDRNOTAVAIL` | `HOST` MySQL IP’si olmamalı → `0.0.0.0` |
| `database: down` / `ETIMEDOUT` | Sunucuda `127.0.0.1` kullanın; Mac’ten uzak DB için IP whitelist |
| Flutter `Unauthorized` | Önce `/api/v1/auth/session` çağrılmalı |
| Boş kelime listesi | `npm run production:setup` ve `npm run import:all` |
| `No vocabulary for daily word` | A1 + `targetLang=tr` için import yapılmamış |
