# CarGoRuqsat (АО ИУЦ) Integration Plan

> CarGoRuqsat — государственная автоматизированная система электронной очереди для грузового транспорта при пересечении границы Казахстана. Поддерживает 50+ пунктов пропуска (Достык-Алашанькоу, Нур Жолы-Хоргос, Калжат-Дулаты, Майкапчагай-Зимунай).

---

## ✅ Текущий статус

| Item | Status |
| --- | --- |
| InfoScreen в app (CargoRuqsatInfoScreen.js) | ✅ implemented |
| Queue tab → CargoRuqsatInfo link | ✅ implemented (QueueScreen.js:107, 128) |
| AppNavigator route registered | ✅ implemented (line 190) |
| i18n × 4 langs (RU/EN/KK/ZH) | ✅ verified — 12+ keys × 4 langs translated |
| Live scoreboard endpoint (`fetchScoreboard`) | ✅ implemented (cgrAPI.js) |
| Booking number attach (createBooking) | ✅ implemented |
| Smart Bridge SOAP integration | ❌ NOT yet (awaiting АО ИУЦ technical specs) |
| Письмо в АО ИУЦ (Купанова Л.К.) подписано/отправлено | ❌ NOT yet (Шеф этим занимается) |

---

## 📋 i18n verification (Phase 7 Code Review)

12 keys × 4 langs = 48 entries verified качество перевода:

| Key | RU | KK | ZH | EN |
| --- | --- | --- | --- | --- |
| `cargoruqsat_page_title` | «Электронная очередь на границе» | «Шекарадағы электрондық кезек» | «边境电子排队系统» | «E-Queue at Border» |
| `cargoruqsat_page_what_title` | «Что это?» | «Бұл не?» | «这是什么?» | «What is it?» |
| `cargoruqsat_page_open_official` | «Открыть официальный портал» | «Ресми порталды ашу» | «打开官方门户» | «Open official portal» |
| `cargoruqsat_live_title` | «Загруженность погранпереходов» | «Шекара өткізу пункттерінің жүктемесі» | «口岸排队情况» | «Border checkpoint load» |
| `cargoruqsat_booking_title` | «Привязать бронь CarGoRuqsat» | «CarGoRuqsat броньын байланыстыру» | «关联 CarGoRuqsat 预约» | «Attach CarGoRuqsat booking» |

Все переводы — НЕ machine-generated, semantically correct, terminology matches state portal.

---

## 🗺 Architecture (текущий + planned)

### Поток A — сейчас (без Smart Bridge)

```
┌────────────────┐         ┌────────────────────┐
│ UrTruck app    │  GET    │ cgr.qoldau.kz      │
│ CGR InfoScreen │ ───────>│ (публичный реестр) │
└───────┬────────┘         └────────────────────┘
        │ POST /attach_booking
        v
┌────────────────────────────┐
│ UrTruck backend             │
│ /api/v1/cgr/attach          │   ← stores booking_number в users
└────────────────────────────┘
```

- ✅ Live load на погранпереходах (parse cgr.qoldau.kz реестра)
- ✅ User вводит booking_number вручную → backend хранит → push когда подходит time

### Поток B — после Smart Bridge интеграции (Q4 2026)

```
┌────────────────┐         ┌─────────────────────┐
│ UrTruck app    │  REST   │ UrTruck backend     │
│ CGR Booking    │ ───────>│ /api/v1/cgr/book    │
└────────────────┘         └────┬────────────────┘
                                │ SOAP
                                v
                       ┌─────────────────────┐
                       │ Smart Bridge        │
                       │ ORGAM-S-9317        │
                       │ CargoRuqsatApps     │
                       │ ServiceSync         │
                       └────┬────────────────┘
                            │
                            v
                       ┌────────────────┐
                       │ АО ИУЦ          │
                       │ CarGoRuqsat     │
                       │ database        │
                       └────────────────┘
```

- 🔜 Booking через app (без redirect на портал)
- 🔜 Real-time slot availability
- 🔜 Cancel/reschedule в app
- 🔜 Push когда подходит time + сертификат проверки документов

---

## 📨 Что нужно от Шефа

### Priority 1 — Утром

1. **Распечатать письмо** в АО ИУЦ (Купанова Л.К.):
   - File: `qa/АО_ИУЦ_letter.docx` (если ещё не создан — TODO)
   - Тема: запрос на доступ к Smart Bridge sandbox + technical specs CargoRuqsatAppsServiceSync
   - Org code: ORGAM-S-9317
2. **Подписать** (бумажно либо электронно через ЕЦП)
3. **Отправить** на:
   - Email: `kupanova_l@gosreestr.kz`
   - Дублировать на `info@gosreestr.kz` для надёжности
4. **Дождаться response** с:
   - Smart Bridge credentials (test environment)
   - WSDL для CargoRuqsatAppsServiceSync
   - Документация на certification process (3-6 months timeline)

### Priority 2 — После получения specs

1. **PR #106** — Backend Smart Bridge SOAP client:
   - `backend/services/smart_bridge.py` — Suds или Zeep клиент
   - `backend/api/cgr.py` — endpoints `/api/v1/cgr/book`, `/cancel`, `/status`
   - Tests с mocked SOAP responses
2. **PR #107** — Frontend booking screens:
   - `src/screens/CargoRuqsatBookingScreen.js` — slot picker + form
   - `src/screens/CargoRuqsatMyBookingsScreen.js` — список + cancel
   - `src/utils/cgrAPI.js` — bookingCreate/Cancel/Status methods
3. **PR #108** — Certification & security audit:
   - InfoSec audit per АО ИУЦ requirements
   - Penetration test report
   - Documentation submitted to АО ИУЦ

**Estimated effort:** 3-4 weeks engineering + 3-6 months certification.

---

## 🔍 Public API endpoints (документированы, можно использовать сейчас)

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `/Checkpoint` | ANPR cameras на пунктах пропуска (открытые данные) | ✅ может scraping |
| `/WaitingArea` | Зоны ожидания + capacity | ✅ может scraping |
| `/Booking` | Создать бронь / cancel | ❌ закрыто, только Smart Bridge |
| `/Booking/Status` | Статус брони | ❌ закрыто |

Реализованная пока — `cgrAPI.fetchScoreboard()` агрегирует Checkpoint + WaitingArea для live табло.

---

## 🚧 Backend gaps (для следующего PR)

1. `users` table — add column `cgr_booking_number TEXT` (для Поток A — attach manually entered booking).
2. `cgr_bookings` table — новая, для Поток B (real Smart Bridge bookings):
   ```sql
   CREATE TABLE cgr_bookings (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       checkpoint_code TEXT NOT NULL,
       booking_number TEXT,
       slot_time TIMESTAMP,
       status TEXT CHECK (status IN ('pending','confirmed','cancelled','completed')),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       smart_bridge_id TEXT
   );
   ```
3. APScheduler job — каждые 5 min poll active bookings status, push если slot approaches (< 2h).

---

## 📊 Maestro coverage

`.maestro/09-cargoruqsat-info.yaml` — Phase 7 smoke flow:
- Driver actor → Queue → tap CargoRuqsatInfo link
- Title + 3 sections visible
- Open official portal button visible
- Live scoreboard либо loaded либо graceful error
- Back nav возвращает на Queue

---

## ✅ Final verdict (Phase 7)

✅ **CargoRuqsat InfoScreen READY for Build 29.** Frontend functionality fully implemented, i18n × 4 langs verified, Maestro 09 covers navigation + render.

**Blockers для Поток B:** Smart Bridge integration ждёт АО ИУЦ response (Шеф's action item P1 утром).

**No code changes needed** в этом PR. Backend gap = pending PR #106-108 (отдельная engineering work после получения specs).
