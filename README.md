# Lingola Daily Words — Backend

Firebase Authentication ile giriş yapan mobil kullanıcıları doğrular, kelime/pratik/progress verilerini sunar.

**Stack:** Node.js (ES modules), Express, **klasik JavaScript**, **mysql2** paketi (MySQL 8 kimlik doğrulaması; Prisma / TypeScript yok).

## SSH erişiminiz yoksa (özet)

- **Siz (Mac):** `.env.local` + yerel MySQL → `npm run dev` → Flutter `http://<Mac-IP>:3000`
- **Canlı (müşteri):** API müşteri sunucusunda kurulmalı → Flutter `http://5.39.8.160:3000`
- Uzak MySQL Mac’ten genelde **kapalı** (timeout); bu beklenen davranış.

Ayrıntı: [`docs/SSH-ERISIMI-YOK.md`](docs/SSH-ERISIMI-YOK.md) · Müşteriye gönderilecek: [`docs/MUSTERI-KURULUM.md`](docs/MUSTERI-KURULUM.md) · Paket: `npm run package:customer`

## Kurulum (yerel)

Müşteri sunucusuna erişiminiz yoksa **uzak MySQL kullanmayın**; `.env.local` ile yerel MySQL kullanın.

```bash
cd "LingolaDaily WordsBackend"
cp .env.example .env
cp .env.local.example .env.local
mkdir -p secrets
```

Firebase Console → **Project settings** → **Service accounts** → **Generate new private key**  
İndirilen JSON dosyasını `secrets/firebase-service-account.json` olarak kaydedin.

MySQL sunucusunun çalıştığından emin olun:

```bash
brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS lingola_daily_words CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

`.env` içinde yerel bağlantı (varsayılan):

```env
DATABASE_URL="mysql://root@localhost:3306/lingola_daily_words"
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
ADMIN_API_KEY=your-long-random-admin-key
```

```bash
npm install
npm run db:setup
npm run dev
```

API: `http://localhost:3000` — `GET /health` → `{"ok":true,"database":"up"}`

Mobil uygulama API adresi: `http://<bilgisayar-ip>:3000` (simülatörde genelde `http://localhost:3000`).

**Müşteri sunucusu (5.39.8.160):** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — kurulum, migration, kelime import.  
**Flutter:** [`docs/FLUTTER.md`](docs/FLUTTER.md) — auth akışı ve vocabulary endpoint’leri.

```bash
npm run production:setup   # sunucuda: migrate + örnek kelimeler
npm run admin:import-all # eski: seviye başına ~300 kelime
npm run import:all     # tam sözlük ~28k (A1–B2)
npm run db:export-local  # yerel dump üretir → database/lingoladailywords-local.sql
```

Hazır veri (sunucuya import): `database/lingoladailywords-local.sql` — ~28k kelime, 8 dilde çeviri.

## Veritabanı

- Şema SQL dosyaları: `database/migrations/*/migration.sql`
- `npm run db:migrate` — migration'ları sırayla uygular (`_schema_migrations` tablosu ile)
- `npm run db:seed` — örnek dil, seviye, ders ve kelimeler
- `npm run db:setup` — migrate + seed (ilk kurulum)

## Health

`GET /health` — MySQL bağlantısını `SELECT 1` ile kontrol eder.

## Kimlik doğrulama

### Mobil (Firebase)

| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/api/v1/auth/session` | Body: `{ "idToken": "<firebase_id_token>" }` |
| `GET` | `/api/v1/auth/me` | Header: `Authorization: Bearer <firebase_id_token>` |

### Admin import

`X-Admin-Api-Key: <ADMIN_API_KEY>` veya `Authorization: Bearer <ADMIN_API_KEY>`

## OpenAPI

[`docs/openapi.yaml`](docs/openapi.yaml)
