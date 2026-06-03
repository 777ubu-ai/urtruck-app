# UrTruck — Live-Device Smoke Runbook

Финальный ручной прогон Driver/Vehicle Verification на реальном iPhone
перед решением **merge integration→main** и deploy. Без секретов, без PII,
без фейковых device-pass.

## 1. Что проверяем

Интеграционная ветка: **`claude/youthful-cerf-barf3`** (актуальный remote HEAD).
Основной flow:

```
Security/Profile → «Подтвердить документы»
  → Identity 1/5 → Selfie 2/5 → VehicleDocs 3/5
  → VehiclePhotos 4/5 → TruckParams 5/5 → Submitted
```

Plus progressive gates: Queue (locked до approved), «Разместить рейс»
(gated до approved).

> ⚠️ Прогон **только** против backend интеграционной ветки (LAN/staging).
> Дефолтный prod `urtruck.kz` сейчас не содержит часть эндпоинтов
> регистрации (deployment gap) — против него flow упадёт в 404.

## 2. Backend на Mac (Terminal 1)

```bash
cd /path/to/urtruck-app
git checkout claude/youthful-cerf-barf3 && git pull
cd backend
pip install -r requirements.txt        # только при первом запуске
uvicorn main:app --host 0.0.0.0 --port 8001
```

## 3. LAN-IP (Terminal 2)

```bash
ipconfig getifaddr en0     # Wi-Fi → 192.168.x.x  (пусто? попробуй en1)
```

## 4. Проверка, что backend правильный

```bash
scripts/smoke_registration_endpoints.sh http://<LAN-IP>:8001/api/v1
```

Ожидаем `PASS — all required registration endpoints present.` (exit 0).
- `GET /system/info` → 200.
- upload/draft/submit роуты → 401/403/405/422 (роут есть), **НЕ 404**.
- Любой `404` → **STOP**: backend не тот/старый, smoke не запускать.

## 5. Frontend на iPhone (Terminal 3)

```bash
git checkout claude/youthful-cerf-barf3 && git pull
EXPO_PUBLIC_API_URL=http://<LAN-IP>:8001 npx expo start
# iPhone → Expo Go → scan QR
```

> ⚠️ **iPhone и Mac должны быть в одной Wi-Fi сети.** iPhone на 5G/cellular
> не достучится до LAN backend. Нет общей Wi-Fi → подними backend на
> staging VPS и используй `EXPO_PUBLIC_API_URL=https://<staging>`.

OTP: whatsapp в MOCK → код в логе backend; либо реальный SMS (mobizon).

## 6. Happy path (отметить P/F)

- [ ] Identity 1/5 — поля имя/фамилия/ДР/ИИН, фото (камера/галерея), preview, gate, Next→Selfie
- [ ] Selfie 2/5 — фронт-камера, retake, success только после backend ok, Next→VehicleDocs
- [ ] VehicleDocs 3/5 — техпаспорт/СРТС + права + селфи-с-правами + даты; **нет** фото авто/кабины; hints; Next→VehiclePhotos
- [ ] VehiclePhotos 4/5 — **только** авто снаружи + салон/кабина; **нет** селфи; оба обязательны; Next→TruckParams
- [ ] TruckParams 5/5 — residence/тип/кузов/марка/модель/цвет/госномер/год/тоннаж/объём; submit→backend
- [ ] Submitted — только после ok; **24–48 часов**; cargo/trips; нет passenger/taxi; primary→Main; status→Security

## 7. Negative tests (отметить P/F)

- [ ] пустые обязательные → Next/Submit блок (каждый экран)
- [ ] **airplane mode во время upload** → карточка error, **НЕ done**
- [ ] **сеть off перед submit** → Submitted overlay **НЕ** появляется + toast
- [ ] Close: «Нет» остаётся / «Да» сохраняет+выходит / save-fail не выходит молча
- [ ] Help/FAQ открывается на всех 5 экранах (24–48 часов, нет passenger/taxi)
- [ ] Back работает на всех 5 экранах
- [ ] Queue (unverified) — locked/promo → «Пройти проверку»→Identity
- [ ] «Разместить рейс» (unverified) — gate-модалка, не открывает CreateTrip

## 8. Proof

Скриншоты (≥9): Identity · Selfie · VehicleDocs · VehiclePhotos · TruckParams · Help · Close-confirm · Submitted · Status/rejected (если доступно).
Видео (≥3): happy path до Submitted · airplane-mode upload (error, не done) · required-gate block.

## 9. Классификация

**BLOCKER:** crash/white-screen · камера не открывается на iOS · gallery
не отдаёт фото · upload done при ошибке · submitted при ошибке submit ·
обход required-gate · недостижимый шаг / dead-end · passenger/taxi в
verification · нет 24–48 часов · PII/raw в логах · backend route 404 на
правильном backend.

**MAJOR:** текст наезжает но кликабельно · OCR слабый но flow цел · retry
неидеален но работает · help-wording.

**MINOR/post-release:** spacing/alignment · длинные KK/ZH строки · PR-B
optional residence docs · delete/replace photo · editable plate/year ·
avatar polish.

## 10. Post-deploy check (после merge→main)

CI `deploy.yml` деплоит frontend + backend вместе и теперь проверяет
роуты регистрации. Дополнительно вручную:

```bash
scripts/smoke_registration_endpoints.sh https://urtruck.kz/security/api/v1
```

Должно быть `PASS` (exit 0). Если `404` — backend-деплой не доехал, откат/повтор.

## 11. Decision rule

- **0 BLOCKER** → можно давать команду **merge integration→main**.
- **Есть BLOCKER** → чинить только blocker, остальное не трогать.
- **PR-B optional residence docs** — post-release (backend-blocked), если
  владелец явно не решит иначе.
- **email-login** — после релиза (отдельный backend PR).
- **PR-G3 Deal/bid gate** — после релиза.
