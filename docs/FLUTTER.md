# Flutter — API bağlantısı

## Base URL

| Ortam | URL | Kim kurar |
|-------|-----|-----------|
| **Üretim** | `http://5.39.8.160:3000` | Müşteri sunucusunda API (SSH gerekmez; hosting paneli) |
| **Geliştirme** | `http://<geliştirici-Mac-IP>:3000` | Sizin Mac’inizde `npm run dev` + `.env.local` |

Üretim API kurulmadan mağaza/build’de `5.39.8.160` çalışmaz. Geliştirme sırasında Flutter’ı Mac IP’nize yönlendirin.

Üretim (müşteri sunucusu):

```
http://5.39.8.160:3000
```

Yerel geliştirme (fiziksel cihaz):

```
http://<bilgisayarınızın-LAN-IP>:3000
```

iOS Simulator / Android Emulator:

```
http://localhost:3000   # veya 10.0.2.2:3000 (Android emulator → host)
```

`PUBLIC_API_BASE_URL` sunucu `.env` dosyasında tanımlı olabilir; uygulama aynı değeri kullanmalıdır.

## Zorunlu akış

```
Firebase sign-in
    → POST /api/v1/auth/session  { "idToken": "<firebase_id_token>" }
    → (sonraki tüm korumalı istekler) Authorization: Bearer <firebase_id_token>
```

`auth/session` kullanıcıyı veritabanına yazar ve varsayılan öğrenme profilini (A1, hedef dil `tr`) oluşturur. Bu adım atlanırsa vocabulary istekleri **401 Unauthorized** döner.

## Kelime endpoint’leri

Tümü `Authorization: Bearer <token>` gerektirir.

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/vocabulary` | Seviyeye göre kelime listesi |
| `GET /api/vocabulary/daily-word` | Günün kelimesi |
| `GET /api/vocabulary/common?limit=20` | Sık kullanılanlar |
| `GET /api/vocabulary/dictionary?limit=50` | Sözlük |
| `GET /api/user/learning-profile` | Profil (yoksa oluşturulur) |
| `PUT /api/user/learning-profile` | `currentLevel`, `targetLang`, `dailyGoal` |

Örnek yanıt sarmalayıcısı:

```json
{
  "success": true,
  "data": [ ... ]
}
```

## Hedef dil (`targetLang`)

Desteklenen: `tr`, `en`, `de`, `fr`, `it`, `es`, `pt`, `ru`, `ja`, `ko`, `hi`, `zh`

Kelimeler `VocabularyTranslation` tablosunda bu dile göre filtrelenir. Import sırasında `targetLang: "tr"` kullanıldığından Flutter profili de `tr` olmalı (varsayılan zaten `tr`).

## Auth olmadan kullanılabilenler

- `GET /health`
- `GET /api/languages`
- `GET /api/levels`
- `GET /api/categories`
- `GET /api/lessons`

## Kontrol listesi (kelime gelmiyorsa)

1. `GET {baseUrl}/health` → `database: "up"`
2. Firebase ile giriş → `POST {baseUrl}/api/v1/auth/session`
3. `GET {baseUrl}/api/vocabulary` + Bearer token → `success: true`, `data` dolu
4. Sunucuda kelime var mı: `npm run admin:import-all` veya seed
