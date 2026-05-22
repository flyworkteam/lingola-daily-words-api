# Lingola Daily Words — Backend

Firebase Authentication ile giriş yapan mobil kullanıcıları doğrular, kelime/pratik/progress verilerini sunar.

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
# Opsiyonel: virgülle ayrılmış IP listesi
# ADMIN_IP_ALLOWLIST=127.0.0.1,::1
```

```bash
npm install
npx prisma migrate deploy
npm run dev
```

API: `http://localhost:3000`

## Health

`GET /health` — MySQL bağlantısını `SELECT 1` ile kontrol eder.

- `200` → `{ ok: true, database: "up", latencyMs: ... }`
- `503` → veritabanı erişilemiyor

## Kimlik doğrulama

### Mobil (Firebase)

| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/api/v1/auth/session` | Body: `{ "idToken": "<firebase_id_token>" }` |
| `GET` | `/api/v1/auth/me` | Header: `Authorization: Bearer <firebase_id_token>` |

Korumalı endpoint'lerde aynı Firebase ID token kullanılır.

### Admin import

| Method | Path | Header |
|--------|------|--------|
| `POST` | `/api/admin/import-words` | `X-Admin-Api-Key: <ADMIN_API_KEY>` |
| `POST` | `/api/admin/import-all-levels` | aynı |

Alternatif: `Authorization: Bearer <ADMIN_API_KEY>`

`ADMIN_API_KEY` tanımlı değilse admin endpoint'leri `503` döner.

## Idempotency (ödül claim)

Aşağıdaki POST isteklerinde isteğe bağlı header:

`Idempotency-Key: <uuid veya benzersiz string>`

- `POST /api/progress/daily-reward/record`
- `POST /api/rewards/streak-share/claim`

Aynı kullanıcı + scope + key ile tekrarlanan istekler, ilk yanıtı (status code dahil) tekrar döner; çift gem verilmez.

## OpenAPI

Temel sözleşme: [`docs/openapi.yaml`](docs/openapi.yaml)

Swagger UI ile görüntülemek için dosyayı [editor.swagger.io](https://editor.swagger.io) üzerine yapıştırabilirsiniz.

## Flutter

Mobil uygulama giriş sonrası `POST /api/v1/auth/session` çağırır. Sonraki isteklerde aynı Firebase ID token `Authorization` header'ında gönderilir.
