# UrTruck — App Store / Production Release Checklist

Stage 21 (pre-launch hardening). Read top to bottom before
running `eas build --platform ios --profile production`.

---

## 0. Repo state

- Branch: `main` after `stage21-prerelease-hardening` merge
- App version: `1.0.0` (`app.json` `expo.version`)
- iOS bundle: `com.urtruck.app`, `buildNumber: "1"` (auto-increment in EAS production profile)
- Android package: `com.urtruck.app`, `versionCode: 2`
- API: `https://urtruck.kz` (HTTPS, nginx → :8001)
- EAS project: `898bd902-ea62-49f6-96c3-b6e02219f828`

---

## 1. Pre-build env (must be ready BEFORE EAS build)

### 1.1 Apple Developer
- [ ] Active Apple Developer Program membership ($99/yr)
- [ ] App Store Connect app created
  - Name: **UrTruck**
  - Bundle ID: **com.urtruck.app** (matches `app.json`)
  - SKU: any unique value (`urtruck-ios-001` works)
  - Primary language: Russian
- [ ] Apple Distribution certificate + Provisioning profile (EAS handles this on first build)
- [ ] App icons 1024×1024 PNG ready (see `assets/icon.png`)
- [ ] Splash screen reviewed (`assets/splash.png`)
- [ ] Replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` in `eas.json` with the real ASC app ID

### 1.2 EAS / Expo
- [ ] `eas-cli` installed: `npm install -g eas-cli`
- [ ] Logged in: `eas login` (account that owns `898bd902-…`)
- [ ] `EXPO_PUBLIC_API_URL` set in EAS production profile (already wired in `eas.json`)

### 1.3 Backend production env (`backend/.env` on prod VPS)
- [ ] `URTRUCK_ENV=production`
- [ ] `URTRUCK_FAIL_ON_BAD_ENV=1` *(optional but recommended — refuses to start with mock OTP / local storage)*
- [ ] **WhatsApp OTP** (otherwise users cannot register):
  - `WHATSAPP_TOKEN=` (Meta permanent access token)
  - `WHATSAPP_PHONE_ID=` (phone_number_id)
  - `WHATSAPP_ACCOUNT_ID=` (WABA ID)
  - Template `otp_code` approved (RU language)
  - Test number added in Meta Business → real OTP delivered
- [ ] **Storage** (otherwise photos vanish on redeploy):
  - `STORAGE_PROVIDER=supabase` (recommended) or `s3`
  - `SUPABASE_URL=`, `SUPABASE_SERVICE_KEY=`, `SUPABASE_BUCKET=urtruck-docs`
  - Bucket created in Supabase, public-read policy
- [ ] **Admin password** rotated: `ADMIN_PASSWORD=` (not `change_me`)
- [ ] **CORS_ORIGINS** restricted: `https://urtruck.kz` only (no wildcard, no localhost)
- [ ] **TELEGRAM_BOT_TOKEN** set (real bot, not MOCK)
- [ ] **SMS fallback** if WhatsApp throttled: `SMS_PROVIDER=mobizon` + `MOBIZON_API_KEY=`

### 1.4 Public legal docs (App Store will ask)
- [ ] Privacy Policy hosted at `https://urtruck.kz/privacy`
- [ ] Terms of Service at `https://urtruck.kz/terms`
- [ ] Support URL (e.g. `https://urtruck.kz/support` or email)
- [ ] Marketing URL (optional)

### 1.5 App Store Connect content
- [ ] App name (RU)
- [ ] Subtitle (RU, 30 chars max)
- [ ] Description (RU, ~500 words)
- [ ] Keywords
- [ ] Screenshots — iPhone 6.7", 5.5"
- [ ] App Privacy answers (data we collect: phone number, photos, location-when-in-use)
- [ ] Age rating questionnaire
- [ ] Pricing: Free
- [ ] Region availability: KZ, RU, UZ, KG, TJ, CN (start with KZ if pilot)

---

## 2. Build commands

```bash
# 1. Sanity check the working tree
git status                 # must be clean
git checkout main && git pull

# 2. Install deps
npm ci

# 3. Web bundle (also acts as a smoke build)
npm run build:web

# 4. Static smokes (must all pass)
npm run qa:theme
npm run qa:i18n
npm run qa:currency
npm run qa:geo
npm run qa:ux

# 5. Playwright (optional but recommended)
npm run qa:full
npm run qa:mobile

# 6. iOS production build
eas build --platform ios --profile production

# 7. Submit to App Store Connect (TestFlight)
eas submit --platform ios --profile production
```

---

## 3. Manual TestFlight checks (real device)

Run on at least one real iPhone from each side (driver + shipper).

### Onboarding
- [ ] App launches without crash
- [ ] RoleScreen renders the full hero image
- [ ] "Я водитель" hotspot navigates into driver flow
- [ ] "Я грузовладелец" hotspot navigates into shipper flow
- [ ] "Войти" hotspot opens AuthScreen

### Registration / OTP
- [ ] Phone field accepts +7 / +86 / etc.
- [ ] OTP request hits **real WhatsApp** (not the log-only mock)
- [ ] Wrong OTP → clear error message
- [ ] Resend OTP works after the timeout
- [ ] Successful OTP → next step

### Profile
- [ ] First name / last name save and survive restart
- [ ] City field accepts free text and saves
- [ ] Country shows "Казахстан" (read-only for the KZ pilot)
- [ ] Avatar picker asks for permission politely
- [ ] Permission denied → toast `"Разрешите доступ к фото в настройках"` (not silent)
- [ ] Photo selected → preview shows up
- [ ] Save → reopen profile → values persist

### Feed / Cargo / Trip
- [ ] Feed loads (cargos for driver, trips for shipper)
- [ ] Filter chips open distinct sheets
- [ ] Tap card → CargoDetail/TripDetail without crash
- [ ] Sticky CTA "Предложить цену" opens BidModal
- [ ] BidModal submits → toast "Ставка отправлена"
- [ ] Other side sees the bid in the bids list

### Bid → Deal → Chat
- [ ] Cargo owner taps "Принять" on a bid → deal block appears
- [ ] Chat opens after accepted bid (single chat surface, no duplicates)
- [ ] Status transitions: accepted → in_progress → delivered
- [ ] After delivered: review prompt appears (CargoDetail, not TripDetail)

### Push notifications
- [ ] iOS asks for notification permission on first relevant action
- [ ] Permission granted → backend `/push/register` receives the APNs token
- [ ] Test push from admin panel arrives within 10s
- [ ] Tap on push opens the right screen

### Errors / Edge cases
- [ ] Airplane mode → "Нет связи с сервером" toast, no crash
- [ ] Backend 429 → "Слишком много запросов" (or generic error), no crash
- [ ] Backend 500 → graceful error, retry possible

---

## 4. Known risks (Stage 21 audit)

### P0 — block the App Store submission until resolved
- **WhatsApp OTP not yet wired in production env.** Without `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID` real users get nothing. The backend startup guard now logs this loudly when `URTRUCK_ENV=production`; flip `URTRUCK_FAIL_ON_BAD_ENV=1` before launching to refuse to start without keys.
- **Storage = local FS** today. First server reinstall = all uploaded photos gone. Migrate to Supabase Storage (provider already abstracted) before any paying user uploads.
- **Apple Developer / EAS credentials**, App Store Connect app, screenshots, Privacy/Support URLs — all manual, not in repo.

### P1 — desirable before pilot
- Real Telegram bot polling (`TELEGRAM_BOT_TOKEN`) so role-1 verification works end-to-end.
- SMS fallback (`SMS_PROVIDER=mobizon`) if WhatsApp delivery throttles.
- nginx / FastAPI rate-limit tuning — QA already saw 429 from internal traffic; production end-users could hit the same limits.
- Sentry / error reporting (frontend `ErrorBoundary` exists, but no upstream sink).
- Light analytics (Plausible / Y.Metrika) on the web bundle for funnel observability.

### P2 — can ship without
- KK / ZH / EN copy quality review by native speakers (volume is 100%, polish isn't).
- Multi-country picker on `EditProfileScreen` (currently KZ-only read-only — works for the pilot).
- Della/ATI parser real connection (mock is harmless, doesn't reach end-users as "real" data).

---

## 5. Rollback plan

If a TestFlight build introduces a regression:
1. Revert the offending commit on `main` (`git revert <sha>`).
2. `npm run build:web && ./deploy.sh` — web bundle restores previous behaviour within 5 minutes.
3. iOS: bump `ios.buildNumber` and submit a new TestFlight build.
4. App Store: do **not** mass-promote to production until TestFlight is stable.

Backend rollback:
- `pm2 restart urtruck-security-api` after git checkout of the previous backend commit.
- SQLite is single-file: take a snapshot before any schema migration.
