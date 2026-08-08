# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Язык общения

Общаться с владельцем проекта — **по-русски** (см. глобальный `~/.claude/CLAUDE.md`). Комментарии в коде, git-сообщения, названия задач — тоже по-русски. Имена переменных/функций/файлов, shell-команды, URL, API-эндпоинты — остаются на английском.

## Что это за проект

**UrTruck** — FTL-маркетплейс грузоперевозок Китай ↔ СНГ (аналог InDrive для фур). Состоит из двух частей в одном репозитории:

1. **Frontend** (корень репо) — React Native + Expo SDK 52, собирается в статический web/PWA и в Expo Go. Две роли: `driver` (водитель) и `client` (грузовладелец).
2. **Backend** (`backend/`) — FastAPI + Python 3.12 + SQLite + Redis + APScheduler. Отвечает за регистрацию водителей, OCR-верификацию документов, скоринг 0-100, чёрный список, маркетплейс (грузы/рейсы/ставки), чат, push, отзывы, биометрию.

Сервер: `185.22.65.11` (фронт `:8080`, бэк `:8001`). Supabase используется **только** для OTP-авторизации клиентов и, опционально, для Storage; основные данные живут в SQLite на сервере.

## Ключевые команды

### Фронтенд
```bash
npm install                   # зависимости (первый раз)
npx expo start                # dev-сервер + QR для Expo Go
npm run web                   # Expo web dev
npm run build:web             # сборка в dist/ (продакшен-бандл)
npm run serve                 # локальный serve dist/
./deploy.sh                   # полный деплой: сборка + SCP + права + health-check
```

`./deploy.sh` автоматически инкрементит `.version`, постпроцессит `dist/index.html` (meta-теги, PWA-манифест, Service Worker с принудительной очисткой кешей `v5-market`), заливает на сервер и оставляет последние 10 версий в `/home/ubuntu/urtruck-versions/`.

### Бэкенд
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
# продакшен: PM2 процесс urtruck-security-api
curl http://185.22.65.11:8001/api/v1/system/info   # статус OTP/face/storage
```

### CI
`.github/workflows/deploy.yml` — на push в `main` собирает web, заливает `dist/*` в `$REMOTE_DIR` и `backend/*` в `$BACKEND_DIR`, рестартит PM2. Секреты: `SERVER_HOST`, `SERVER_USER`, `SERVER_PASS`, `REMOTE_DIR`, `BACKEND_DIR`.

## Архитектура фронтенда

### Навигация — реактивная на основе auth state
`src/navigation/AppNavigator.js` выбирает один из **четырёх** стеков по состоянию из `AuthContext`:

| Условие | Доступ |
|---|---|
| `!hasToken` | Splash → Onboarding → Auth → Role → Reg (новичок) |
| `hasToken && !session` | Гостевой режим: лента + просмотр карточек + чат, но без роли |
| `session && !hasRole` | Только Role → Reg (выбор роли после OTP) |
| `session && hasRole` | Полный стек: MainTabs + все детали/настройки |

`MainTabs` = Feed · Track · Wallet · Profile. Цвет акцента таббара зависит от роли: driver — `#2563EB` (синий), client — `#F59E0B` (жёлтый). Бейдж непрочитанных на Feed тянется из `getUnreadNotifications()` в `store.js`.

### Слой данных
- `src/config/supabase.js` — клиент Supabase. **`IS_BETA = true`** делает всё платное бесплатным (проверять этот флаг перед любой монетизацией).
- `src/utils/store.js` — in-memory стор для демо-данных (trips, chats, notifications) + pub/sub через `subscribe()`. Используется параллельно с серверным API.
- `src/utils/marketAPI.js` — REST-клиент к `/api/v1/market` (грузы, рейсы, ставки). BASE автоматически переключается: `http://185.22.65.11:8001/api/v1/market` для localhost dev, `/security/api/v1/market` в продакшене (nginx проксирует `/security/*` → `:8001`).
- Регистрационный токен хранится в `storage` под ключом `ur_reg_token` и автоматически добавляется в `Authorization: Bearer`.
- Другие API-модули: `chatAPI.js`, `notificationsAPI.js`, `reviews.js`, `registration.js`, `push.js`, `pushNotifications.js`, `security.js`.

### UI-слои
- `src/utils/ThemeContext.js` — редизайн 08.08.2026 (приказ владельца): приложение работает в ЕДИНОЙ светлой B2B-теме, `isDark` зафиксирован в `false`. Тёмная палитра сохранена в коде только для возможного отката.
- `src/utils/AuthContext.js` — источник истины для `session`, `hasToken`, `hasRole`, `loading`.
- `src/utils/i18n.js` + `useI18n.js` — 4 языка (RU/KK/ZH/EN), ~1575 ключей (симметрично по всем языкам). Все пользовательские тексты обязаны идти через `t(...)`.
- `src/components/` — переиспользуемые компоненты (Toast, ShimmerButton, PressableScale, BidModal, RatingModal, ShareModal, VerificationGate, SecurityBadge, RouteMap и т.д.).

### Правила UI (из CURSOR_INSTRUCTIONS.md — соблюдать строго)
- Только React Native, **никаких web-only API** (`document`, `window`, `localStorage`). Для веба используется `react-native-web`.
- Стили — через `StyleSheet.create()`, не inline.
- Каждый экран оборачивается в `SafeAreaView`.
- Цвета (редизайн 08.08.2026, единая светлая зелёная B2B-тема): bg `#F6F8F7`, card `#FFFFFF`, border `#E5ECE8`, text `#14221C`, muted `#617067`; бренд-зелёный ОБЕИХ ролей `#168759` (WCAG: 4.52:1 с белым текстом), deep `#0F6B47`, тинт `#E8F6EF`; оранжевый `#FF8400`/`#F59E0B` — ТОЛЬКО фоны/плашки цены-ожидания-предупреждений, как ТЕКСТ на белом — `#E06D00`; error `#D64545`/`#EF4444`; info `#3478D4`; рейтинг `#D97706` (янтарь, 3.19:1); placeholder `#6B7A71`.
- Текст поверх зелёных кнопок (`#168759`) — белый `#FFFFFF` (4.52:1, AA). Крупные CTA — на deep `#0F6B47` (6.5:1). Источник истины: `v1AccentFor(role)` в `theme/designV1.js` (в LIGHT обе роли дают один зелёный).
- Типы кузовов: `tent`, `ref`, `platform`, `auto`, `izoterm` + свободное поле «другое».
- Emoji вместо SVG-иконок (быстрее, меньше бандл).

## Архитектура бэкенда

`backend/main.py` — точка входа FastAPI, грузит `.env` вручную, монтирует 18 роутеров под префиксами `/api/v1/...`:

```
/api/v1/...              routes (скоринг, отметки, базовое)
/api/v1/register/...     registration (OTP, документы, селфи)
/api/v1/market/...       marketplace (cargos, trips, bids)
/api/v1/chat/...         chat + переводы
/api/v1/reviews/...      двусторонние отзывы
/api/v1/notifications    пуши/ленту
/api/v1/push             регистрация токенов
/api/v1/borders          очереди на границах
/api/v1/docs, /qr, /favorites, /leaderboard, /users, /searches
/api/v1/telegram         webhook TG-бота
/admin                   Basic Auth дашборд (ADMIN_USER/ADMIN_PASSWORD из .env)
/storage                 StaticFiles — только если STORAGE_PROVIDER=local
```

- БД: **SQLite** по пути из `config.DB_PATH` (`/home/ubuntu/urtruck-security/database/security.db`). На старте вызываются `db.init_db()` + отдельные `init_*_schema()` DAL-ы + `seed_demo_blacklist()` + применяется `database/optimize_indexes.sql`.
- Модули: `scoring/` (формула 0-100, 6 компонентов + bonus, веса в `config.SCORING_WEIGHTS`), `blacklist/`, `verification/` (биометрия, face match), `ocr/` (Tesseract — `rus+eng+kaz+uzb+chi_sim`), `parsers/` (Della/ATI/Telegram), `scheduler/` (APScheduler cron-задачи).
- **Storage-абстракция** (`services/storage_service.py`): три провайдера через `STORAGE_PROVIDER` — `local` / `supabase` / `s3`. См. `backend/MVP_SETUP.md` для переключения.
- **OTP**: `services/otp_service.py` + `whatsapp_service.py`. В MOCK-режиме, пока не заданы `WHATSAPP_ACCESS_TOKEN` и `WHATSAPP_PHONE_NUMBER_ID` — коды логируются. См. `MVP_SETUP.md`.
- **Face recognition**: пока `dlib` + `face_recognition` не установлены — работает эвристика на EXIF. Проверить режим можно через `GET /api/v1/system/info`.
- **Telegram bot** — `services/telegram_bot.py` стартует из `@app.on_event("startup")`, требует `TELEGRAM_BOT_TOKEN` в `.env`.

Все секреты — в `backend/.env` (шаблон в `.env.example`). Не коммитить.

## Режимы «MOCK vs REAL» — где что

Проверять текущие режимы: `GET /api/v1/system/info` → `{ otp, face, storage }`.

| Подсистема | MOCK (сейчас) | REAL (цель) |
|---|---|---|
| OTP | коды в логе | WhatsApp Meta Cloud API |
| Face | EXIF-эвристика | dlib + face_recognition (liveness + match) |
| Storage | local FS | Supabase Storage или S3 |
| Telegram parser | 9 демо-сообщений | Telethon с `TG_API_ID/HASH` |
| Della/ATI | 3 претензии mock | реальный парсинг |
| Gov-checkers (КЗ/РФ/УЗ/КГ/ТЖ) | детерминированные данные | реальные API |

При правках следить, чтобы fallback на mock работал, когда credentials пустые.

## Сопутствующие документы (читать при крупных задачах)
- `SECURITY_ARCHITECTURE.md` — детальная архитектура скоринга, blacklist, верификации (24 KB).
- `ROADMAP.md` — план фич по фазам (12 KB).
- `AGENTS_PLAN.md` — план 7 AI-агентов (модератор, переводчик, ценовой аналитик, push-диспетчер, антифрод, FAQ-бот, контент-генератор).
- `DEPLOY.md` — ручная настройка сервера (Nginx, PM2, Certbot, firewall).
- `backend/MVP_SETUP.md` — пошаговое подключение WhatsApp API, face_recognition, Supabase Storage.
- `CURSOR_INSTRUCTIONS.md` — UI-конвенции и фичи продукта.
- `.claude/agents.md` — игровая «команда агентов» (роли внутри Claude Code): Толя/Настя/Сергей/Марат/Алия/Данияр/Жанна. Это один и тот же Claude в разных ролях — реальное разделение работы идёт через `Task` с подагентами `Explore` / `Plan` / `general-purpose`.

## Чего делать не стоит
- Не править `src/config/supabase.js` ключи без согласования (один проект на всю команду).
- Не заливать `backend/.env` и `backend/certs/*` в git.
- Не использовать `--amend` для опубликованных коммитов и `--force` в `main`.
- Не включать `IS_BETA = false` без согласования — ломает UX для ранних пользователей.
- Перед любым `./deploy.sh` убедиться, что `dist/` соберётся (`npm run build:web` не упадёт).

## Graphify-gated changes (рабочее правило)

Перед **любым** изменением в: навигации, таб-барах, `FeedScreen`, `MyTripsScreen`, i18n/localization, backend registration, chat/deal room, attachments, database logic — действовать строго по процессу:

1. **Сначала анализ** связей проекта через структуру + Graphify (`graphify update .` локально, AST-only, без LLM). Не менять бизнес-код на основе догадок.
2. **Перечислить файлы**, которые планируется трогать.
3. **Объяснить риск** — что может сломаться (god-nodes по связности: `get_conn()`, `useI18n()`/`t()`, `useV1Colors()`/`useTheme()`, `useAuth()`, `AppNavigator.js`).
4. **Только после подтверждения владельца** — вносить изменения.
5. `graphify-out/` **не коммитить** и не добавлять в git (это сгенерированный артефакт; в `.gitignore` тоже не добавлять без согласования).
6. Граф пересобирать локально (`graphify update .`); появившийся untracked `graphify-out/` после анализа удалять.

Инструмент: пакет `graphifyy` (PyPI, MIT), команда `graphify`, ставится изолированно (`uv tool install graphifyy`, без extras → без LLM/egress).

### Канон UrTruck (нерушимо — проверять перед каждым касанием навигации)
Обе роли живут по ОДНОЙ логике (приказ владельца 2026-07-26, обе волны):
«Сделки» = единый инбокс, чат внутри сделки, размещение внутри «моего меню».
- **Driver tab-bar = 4 вкладки**: `Feed` («Грузы») / `MyWork` («Рейсы») /
  `Queue` («Очередь» — инструмент границы, не дубль) / `Deals` («Сделки»).
- **Client tab-bar = 3 вкладки**: `MyWork` («Грузы») / `Feed` («Машины») /
  `Deals` («Сделки»).
- **Вкладок «Чаты» и «Разместить» НЕТ ни у одной роли.** Переписка живёт
  внутри «Сделок»; размещение — кнопка ВНУТРИ `MyWork` («Опубликовать
  маршрут» у driver с verification-gate, «Разместить груз» у client).
- `Deals` (обе роли) = `ChatsListScreen` в dealsMode (route.name==='Deals'):
  сверху «Предложения (N)» — живые ставки (client: входящие incoming_bids;
  driver: мои my_bids, pending/countered), тап → комната сделки; ниже — все
  переписки (поиск + фильтры). Торг (BargainCard) и чат живут ВНУТРИ комнаты
  (`ChatScreen`). Иконка — **рукопожатие** (`handshake-outline` из
  MaterialCommunityIcons — в Feather рукопожатия нет). Бейдж на `Deals` =
  notifUnread + chatUnread (вкладки Chats нет → чат-сигнал не теряется).
  Открытие вкладки гасит notifUnread (readAll) — в MyWork ничего не гасить.
- В `MyWork` НЕТ под-вкладки «Предложения» ни у одной роли: driver —
  Мои рейсы / В работе / Завершённые (+Архив); client — Мои грузы / Везут /
  Доставлено (+Архив). Плашка «N предложений» на карточке груза клиента
  ведёт во вкладку «Сделки».
- **Профиль — НЕ вкладка.** Открывается из ☰ (Feather `menu`, top-right)
  как pushed-экран стека. Паттерн inDrive/Yandex Go. Не возвращать во вкладки.
- Колокольчик в шапке НЕ возвращать (пушей достаточно — прямое указание).
  `NotificationsScreen` остаётся только stack-маршрутом `Notifications`.
- Не возвращать seed/demo/test data в production UI.
