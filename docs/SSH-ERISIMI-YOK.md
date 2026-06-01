# SSH erişiminiz yoksa

Müşteri sunucusuna (5.39.8.160) bağlanamıyorsanız iki ayrı ortam vardır: **sizin Mac’inizde geliştirme** ve **müşteride canlı API**. Bunlar aynı makine değildir.

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  Sizin Mac          │         │  Müşteri sunucu 5.39.8.160   │
│  API + yerel MySQL  │         │  API + MySQL (sadece orada)  │
│  Flutter debug      │         │  Flutter mağaza / prod       │
└─────────────────────┘         └──────────────────────────────┘
```

Uzak MySQL şu an Mac’ten **timeout** veriyor (3306 dışarıya kapalı). Bu normal; API’yi siz uzaktan çalıştıramazsınız — **müşteri veya hosting desteği** sunucuda kurmalı.

---

## Sizin yapmanız gerekenler (Mac)

### 1. Yerel ortam

```bash
cp .env.local.example .env.local
brew services start mysql   # veya mevcut MySQL
mysql -u root -e "CREATE DATABASE IF NOT EXISTS lingoladailywords_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm install
npm run db:setup
npm run dev
```

`curl http://localhost:3000/health` → `"database":"up"`

`.env.local`, `.env` dosyasındaki uzak `DATABASE_URL`’i ezer. Üretim şifreleri yerelde kullanılmaz.

### 2. Flutter (geliştirme)

| Ortam | `baseUrl` |
|-------|-----------|
| Simulator | `http://localhost:3000` |
| Fiziksel telefon (aynı Wi‑Fi) | `http://<Mac-LAN-IP>:3000` |

Mac IP: Sistem Ayarları → Ağ, veya `ipconfig getifaddr en0`

Canlı uygulama (`5.39.8.160`) ancak müşteri API’yi kurduktan sonra çalışır.

### 3. Kelimeleri yerelde test

```bash
npm run admin:import-all
```

(`VERB_API_*` `.env` / `.env.local` içinde tanımlı olmalı)

---

## Müşterinin yapması gerekenler (siz SSH kullanmıyorsunuz)

Müşteriye gönderin:

1. Proje zip’i: `npm run package:customer` (veya repo + [`MUSTERI-KURULUM.md`](./MUSTERI-KURULUM.md))
2. [`deploy/env.sunucu.template`](./../deploy/env.sunucu.template) — doldurulmuş `.env`
3. `secrets/firebase-service-account.json` (Firebase’den siz üretin, güvenli kanalla gönderin)

Müşteri sunucuda (panel terminali, SSH veya hosting desteği):

```bash
npm install
npm run production:setup
npm run start    # veya PM2 / hosting “Node uygulaması”
npm run admin:import-all
```

Port **3000** firewall’da açık olmalı. Kontrol: tarayıcıda `http://5.39.8.160:3000/health`

Detaylı adımlar: [`MUSTERI-KURULUM.md`](./MUSTERI-KURULUM.md)

---

## İsteğe bağlı: Mac’ten uzak MySQL (genelde gerekmez)

Müşteriden hosting panelinde **Remote MySQL** → sizin ev/ofis IP’nizi whitelist isteyebilirsiniz. O zaman `.env.local` içinde:

```env
DATABASE_URL="mysql://lingoladailywordsUser:...@5.39.8.160:3306/lingoladailywords"
```

ile sadece **migration / import** çalıştırırsınız; yine de **canlı API** müşteri sunucusunda dinlemeli (Flutter `5.39.8.160:3000`).

---

## Özet

| Soru | Cevap |
|------|--------|
| Mac’te `npm run dev` + uzak DB? | Hayır — timeout. `.env.local` + yerel MySQL. |
| Flutter prod kelime yok? | Müşteri sunucuda API + `production:setup` + `admin:import-all` yapmadı. |
| Siz ne yaparsınız? | Yerel API + Flutter debug; müşteriye kurulum paketi. |
| Müşteri ne yapar? | Sunucuda Node API kurar, 3000’i açar, import çalıştırır. |
