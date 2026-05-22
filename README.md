# Lingola Daily Words — Backend

Firebase Authentication ile giriş yapan mobil kullanıcıları doğrular, kelime/pratik/progress verilerini sunar.

**Stack:** Node.js (ES modules), Express, **klasik JavaScript**, **mysql2** paketi (MySQL 8 kimlik doğrulaması; Prisma / TypeScript yok).

## Kurulum

```bash
cd "LingolaDaily WordsBackend"
cp .env.example .env
mkdir -p secrets
```

Firebase Console → **Project settings** → **Service accounts** → **Generate new private key**  
İndirilen JSON dosyasını `secrets/firebase-service-account.json` olarak kaydedin.

MySQL sunucusunun çalıştığından emin olun (Homebrew: `brew services start mysql`).

MySQL veritabanını oluşturun:

```sql
CREATE DATABASE lingola_daily_words CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`.env` örneği:

```env
DATABASE_URL="mysql://root@localhost:3306/lingola_daily_words"
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
ADMIN_API_KEY=your-long-random-admin-key
```

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

API: `http://localhost:3000`

## Veritabanı

- Şema SQL dosyaları: `database/migrations/*/migration.sql`
- `npm run db:migrate` — migration'ları sırayla uygular (`_schema_migrations` tablosu ile)
- `npm run db:seed` — örnek dil, seviye, ders ve kelimeler

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
