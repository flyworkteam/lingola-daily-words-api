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
| `POST /api/user/learning-profile` | `currentLevel`, `targetLang`, `dailyGoal` (üçü birlikte zorunlu) |

Örnek yanıt sarmalayıcısı:

```json
{
  "success": true,
  "data": [ ... ]
}
```

## Hedef dil (`targetLang`)

Desteklenen: `tr`, `en`, `de`, `fr`, `it`, `es`, `pt`, `ru`, `ja`, `ko`, `hi`, `zh`

Kelimeler `VocabularyTranslation` tablosunda kullanıcının `targetLang` değerine göre döner (`POST /api/user/learning-profile` ile `de`, `fr`, vb.). Import:

```bash
npm run import:all          # kelimeler + tüm dillerdeki çeviriler
npm run import:translations # yalnızca çeviriler (kelimeler zaten varken)
```

**Verb API'de çevirisi olan diller:** `tr`, `en`, `de`, `fr`, `it`, `es`, `pt`, `ru`  
**Henüz veri yok (Türkçe'ye düşer):** `ja`, `ko`, `hi`, `zh`

---

## Flutter entegrasyonu (hedef dil = kelime anlamı dili)

Uygulama arayüz dili ile kelime **anlamı** dili backend'de `targetLang` ile belirlenir. Kullanıcı Almanca seçince Flutter `targetLang: "de"` göndermeli; vocabulary yanıtlarındaki `targetText` otomatik Almanca gelir. **Ek query parametresi veya UI model değişikliği gerekmez** — aynı `sourceText` / `targetText` alanlarını kullanmaya devam edin.

### 1. Dil kodu eşlemesi

| Uygulama seçimi | Backend `targetLang` |
|-----------------|----------------------|
| Türkçe | `tr` |
| Almanca | `de` |
| İngilizce | `en` |
| Fransızca | `fr` |
| İspanyolca | `es` |
| İtalyanca | `it` |
| Portekizce | `pt` |
| Rusça | `ru` |

Locale → kod: `Locale('de')` → `'de'`, `languageCode` doğrudan kullanılabilir (desteklenen listede olmalı).

### 2. Oturum sonrası profil

```dart
// GET /api/user/learning-profile
// Authorization: Bearer <firebase_id_token>
final profile = response['data'];
// { currentLevel, targetLang, dailyGoal, sourceLang: "en", ... }
```

Varsayılan profil: `targetLang: "tr"`, `currentLevel: "A1"`, `dailyGoal: 10`.

### 3. Kullanıcı dili değişince (kritik)

Backend **POST** bekler; body'de **üç alan birlikte** zorunlu:

```dart
await api.post('/api/user/learning-profile', body: {
  'currentLevel': profile.currentLevel,  // mevcut profilden
  'targetLang': 'de',                     // yeni anlam dili
  'dailyGoal': profile.dailyGoal,
});
```

Önce `GET` ile profili al, sadece `targetLang` değiştir, sonra `POST` et. `PUT` kullanmayın.

### 4. Kelime istekleri

Giriş yapmış kullanıcıda query'ye `targetLang` **eklemenize gerek yok** — backend `UserLearningProfile.targetLang` okur:

```dart
GET /api/vocabulary?level=A1&limit=20
GET /api/vocabulary/daily-word
GET /api/vocabulary/dictionary?limit=50&offset=0
```

Yanıt (değişmedi):

```json
{
  "success": true,
  "data": [{
    "sourceText": "many",
    "targetText": "viele",
    "pronunciationText": "...",
    "level": { "code": "A1" }
  }]
}
```

### 5. Dil değişiminden sonra Flutter tarafı

1. `POST /api/user/learning-profile` başarılı
2. Bellekteki kelime cache'lerini temizle veya ekranları yeniden fetch et
3. `daily-word`, sözlük, pratik ekranları aynı endpoint'lerden tekrar çağır

Tasarım aynı kalır: kartlarda `sourceText` (İngilizce) + `targetText` (seçilen dilde anlam).

### 6. Kontrol

Profil `de` iken:

```bash
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/vocabulary?level=A1&limit=3"
```

`targetText` değerleri Almanca olmalı (`viele`, `neu`, …).

### 7. Sık hatalar

| Belirti | Sebep |
|---------|--------|
| Anlamlar hep Türkçe | `targetLang` hâlâ `tr` veya POST atılmadı |
| 400 Invalid request body | POST'ta `currentLevel` / `dailyGoal` eksik |
| 401 | `auth/session` atlanmış |
| Seçilen dilde anlam yok | `ja/ko/hi/zh` — backend Türkçe'ye düşer |

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
