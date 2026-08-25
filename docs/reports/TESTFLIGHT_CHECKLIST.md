# TestFlight release checklist — UrTruck

**Ветка:** `claude/youthful-cerf-barf3` · **дата:** 2026-06-11
**Объём:** 13 коммитов, 31 файл (+1059 / −226). Полный разбор — в `QA_REPORT.md`.
**Один проход сверху вниз.** Не пропускать §2 (сервер) и §5 (device) — это и есть условия GO.

---

## 0. GO / NO-GO (короткая версия)

| Шаг | Кто | Блокирует TestFlight? |
|---|---|---|
| §1 мерж ветки | владелец | ДА — без неё краш регистрации (P0-1) |
| §2 env сервера + рестарт | владелец/devops | ДА — без `URTRUCK_ENV=production` открыт OTP-байпас и дефолт-пароль |
| §3 EAS build (bump buildNumber) | владелец | ДА |
| §4 Maestro smoke (локальный backend) | QA | желательно |
| §5 ручной device-чеклист | QA на iPhone | ДА — пункты, не проверяемые статикой/вебом |
| §6 submit | владелец | — |

---

## 1. Мерж ветки (pre-merge)

```bash
git checkout claude/youthful-cerf-barf3
git pull --ff-only
bash scripts/release_static_gate.sh   # ожидаем ALL PASS
npm run qa:i18n && npm run qa:ux       # ожидаем OK
```

- Ревью диффа (13 коммитов; список — `git log --oneline origin/main..HEAD`).
- Слить в `main` (или integration-ветку) через PR. **Не `--force`, не `--amend` опубликованного.**
- ⚠️ Перед EAS-сборкой: **поднять `ios.buildNumber`** в `app.json` (сейчас `1`, для каждой загрузки в TestFlight номер должен расти). Это ручное действие владельца — менять `app.json`/`buildNumber` автоматикой запрещено правилами проекта.
- `expo.version` = `1.0.0`, `extra.eas.projectId` = `898bd902-…` присутствует (нужно для push-токена — см. §5).

---

## 2. Бэкенд: env + рестарт + verify (185.22.65.11)

В `backend/.env` на сервере:

```ini
URTRUCK_ENV=production          # выключает BETA_MODE (OTP «0000») и
                                # включает fail-closed на дефолт-пароле админки
URTRUCK_ADMIN_USER=<не "admin">
URTRUCK_ADMIN_PASS=<сильный пароль>   # иначе /admin → 503 (P0-4)
# Прод-провайдеры (если переводите с MOCK — см. backend/MVP_SETUP.md):
# WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID — реальный OTP
```

Рестарт и проверка:

```bash
pm2 restart urtruck-security-api
curl -s http://185.22.65.11:8001/api/v1/system/info | python3 -m json.tool
```

Ожидаемо в ответе (новое поле из P1-1):
- `"env": "production"`
- `"beta_mode": false`
- **`"beta_bypass_on_prod": false`** ← если `true` — **STOP**, OTP принимает любой код `0000`, чинить env.
- `otp` — не mock-режим (если переводили на WhatsApp).

Доп. проверка P0-4: `curl -u admin:urtruck-admin-2026 http://185.22.65.11:8001/admin` → ожидаем **503** (дефолт-пароль на проде закрыт).

---

## 3. Сборка приложения (EAS)

```bash
# профиль production уже есть в eas.json
eas build --platform ios --profile production
```

- Проверить, что в сборку попал коммит из §1 (HEAD ветки/мержа).
- APNS-ключ/Push capability должны быть настроены в Apple Developer / EAS credentials — **без этого §5/push не пройдёт** (P1-2).

---

## 4. Maestro smoke (на локальном backend, не на проде)

Полный гайд — `qa/maestro/README.md`. Кратко:

```bash
# 1) локальный backend (dev, mock-OTP)
cd backend && export URTRUCK_ENV=development
export QA_AGENT_TOKEN="$(openssl rand -hex 32)"
DB_PATH="$PWD/database/security.db" python -m uvicorn main:app --host 0.0.0.0 --port 8001 &
cd ..
export MAESTRO_QA_AGENT_TOKEN="$QA_AGENT_TOKEN"
export MAESTRO_BACKEND_BASE="http://127.0.0.1:8001/api/v1"
npx expo start --ios

# 2) новые аудит-сценарии (этой ветки)
cd qa/maestro/screenshots
for f in audit-profile-after-registration audit-chat-persistence-restart \
         audit-notification-deeplink audit-feed-filter-empty \
         audit-lang-switch-during-chat; do
  xcrun simctl terminate booted host.exp.Exponent && maestro test ../$f.yaml
done
# 3) регрессия табов/навигации
maestro test ../driver-tabs.yaml ../client-tabs.yaml ../profile-queue-chats.yaml
```

Что подтверждают аудит-сценарии: профиль не пустой после логина · сообщение чата переживает рестарт и шапка не «Собеседник» · тап по уведомлению не крашит · empty-state фильтров без «— → —» · смена языка при открытом чате.

---

## 5. Ручной device-чеклист (реальный iPhone из TestFlight)

Статика/веб это **не** покрывают — только живое устройство. Отмечать пройдено/нет:

| # | Проверка | Связь с фиксом | ☐ |
|---|---|---|---|
| a | Регистрация водителя с **фото грузовика** доходит до конца (раньше краш) | P0-1 | ☐ |
| b | Личное фото открывает **камеру** сразу (front), галерея — вторичная | #1 | ☐ |
| c | Битая загрузка фото → понятная ошибка (нет сети/файл большой), нет «мусор»-превью | #1 / j | ☐ |
| d | Driver: ставка → у грузовладельца приходит **push** (foreground) | #5 / P1-2 | ☐ |
| e | Push в **background** и **killed**: тап открывает нужный экран (deep-link) | P1-2 | ☐ |
| f | Push на **lock screen** виден, бейдж на иконке растёт | P1-2 | ☐ |
| g | Грузовладелец принимает ставку → сделка у водителя в «**В работе**», есть «Начать перевозку» + «Чат по заказу» | #2/#3 | ☐ |
| h | Чат: написать сообщение → закрыть приложение → открыть → **сообщение на месте**, шапка = реальное имя | P0-2 / #4 | ☐ |
| i | Двойной быстрый тап «Принять ставку» → создаётся **одна** сделка (второй → «уже обработана») | P0-3 | ☐ |
| j | Logout → повторный вход требует нового OTP; старый токен **отозван** на сервере | P1-7 | ☐ |
| k | Истёкший/отозванный токен в сессии → приложение выводит на login-гейт (не «вечная ошибка»), без цикла разлогина | P1-6 | ☐ |
| l | Смена языка RU↔EN↔KK↔ZH на лету: тексты, статусы (Ожидает/Принят/В работе/Завершён), без перезапуска | #8 / matrix | ☐ |

Для push (d–f) удобно использовать `POST /api/v1/push/test` на себя после регистрации токена; в dev-сборке в логах `[push]` видно projectId / expo token / статус register-native (P1-5 фронт).

---

## 6. Submit в TestFlight

```bash
eas submit --platform ios --profile production --latest
```

- Заполнить «What to test» (RU): регистрация водителя с фото, маркетплейс ставка→accept→сделка→чат, push, смена языка.
- Раздать тестерам только после прохождения §5 (особенно a, d–f, h, i).

---

## 7. Открытые пункты (не блокируют TestFlight, для широкого релиза)

| ID | Что | План |
|---|---|---|
| P1-2 | Реальная доставка APNS | проверяется в §5; если не идёт — credentials/EAS push setup |
| P1-3 | Офлайн-очередь чата (ретрай при сети) | отдельная фича: очередь в storage + reconnect-флаш |
| P2-2 | Foreground-push поверх открытой комнаты | добавить `addNotificationReceivedListener`, гасить по `data.room_id` |
| P2-4 | Supabase anon-key в репо | публичный по дизайну — убедиться, что RLS включён |
| P2-5 | Усечённые лейблы вкладок RU/KK | косметика |
| P2-7 | Нет rate-limit на `/cargos` | для пилота некритично |
| P2-8 | Бот-ответы поддержки только на RU | локализовать шаблоны |

---

## 8. Rollback

- Откат приложения: предыдущая сборка остаётся в TestFlight — переключить тестеров на неё.
- Откат бэкенда: `git revert <commit>` нужного фикса + `pm2 restart urtruck-security-api`. Все backend-правки этой ветки изолированы (marketplace/chat/push/admin/registration), миграций схемы нет — откат безопасен.
- БД: правок схемы не вносилось (только `ON CONFLICT`/новые запросы) — даунгрейд кода не требует миграции данных.
