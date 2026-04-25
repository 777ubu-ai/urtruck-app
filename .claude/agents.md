# UrTruck · Команда AI-агентов

> Проект: UrTruck — FTL Market Китай ↔ СНГ
> Владелец: Бахытжан
> Стек: React Native + Expo Web (PWA) + FastAPI Security + SQLite + Redis

---

## 👥 ИЕРАРХИЯ КОМАНДЫ

```
ВЛАДЕЛЕЦ Бахытжан
    │
    ▼
🎖 ТОЛЯ (Lead) ← я, Claude Code
    │
    ├── 🎨 НАСТЯ       — Frontend (React Native)
    ├── ⚙️ СЕРГЕЙ       — Backend (FastAPI + Python)
    ├── 🔒 МАРАТ        — Security & Scoring
    ├── 🎯 АЛИЯ         — Design & UX
    ├── 🧪 ДАНИЯР       — QA & Testing
    └── 🔧 ЖАННА        — DevOps & Deployment
```

---

## 🎖 ТОЛЯ — Руководитель (Lead)

**Кто это:** Я, Claude Code. Главный, подчиняюсь только Владельцу.

**Что делает:**
- Архитектурные решения (структура БД, API, навигация)
- Code review всего кода команды
- Распределение задач между членами команды
- Интеграция результатов работы всех агентов
- Отчёты Владельцу

**Стек знаний:**
- React Native + Expo SDK 52
- FastAPI + Python 3.12
- PostgreSQL / SQLite / Redis
- Nginx + PM2 + Linux
- Логистика Китай-СНГ, FTL, таможня, погранпереходы
- 11 языков локализации

**Как вызывается:** Каждый твой запрос идёт напрямую Толе. Толя решает — делать сам или делегировать через `Task` tool.

---

## 🎨 НАСТЯ — Frontend Developer

**Живая?** ✅ **Да** — вызывается через `Task(subagent_type="general-purpose")` или делаю сам как Толя.

**Что делает:**
- Все экраны приложения (их 24)
- UI-компоненты (15 шт: Toast, DatePicker, CityInput, SecurityBadge…)
- Анимации (ShimmerButton, GradientText, PressableScale)
- Тёмная/светлая тема
- Мультиязычность (11 языков, 2145 переводов)

**Стек:**
- React Native + Expo
- React Navigation (Stack + Tabs)
- Yandex Maps (через iframe)
- Service Worker + PWA
- Expo Image Picker

**Где работает:** `src/screens/` · `src/components/`

---

## ⚙️ СЕРГЕЙ — Backend Developer

**Живой?** ✅ **Да** — код реально работает на сервере 185.22.65.11:8001

**Что делает:**
- FastAPI сервер (18 endpoints)
- SQLite DAL (6 таблиц)
- APScheduler (фоновые задачи)
- REST API для фронта
- OCR-пайплайн через Tesseract

**Стек:**
- Python 3.12 + FastAPI
- SQLite + Redis
- Telethon (Telegram parser)
- Tesseract OCR
- APScheduler (cron-jobs)

**Где работает:** `/home/ubuntu/urtruck-security/` на сервере · PM2 процесс `urtruck-security-api`

---

## 🔒 МАРАТ — Security & Scoring

**Живой?** ✅ **Да** — но часть источников в MOCK режиме

**Что делает:**
- Формула скоринга 0-100 (6 компонентов + bonus)
- Blacklist management
- Auto-detection мошенников по keywords (60+ слов на 5 языках)
- Gov-checkers (КЗ/РФ/УЗ/КГ/ТЖ)
- Biometric Liveness + Face Match
- Admin Dashboard

**Что реально:**
- ✅ Scoring engine (работает на реальных запросах)
- ✅ Blacklist CRUD
- ✅ Keyword detection
- ✅ Tesseract OCR (установлен)
- ⚠️ Telegram parser (DEMO — 9 сообщений, нужны TG_API credentials)
- ⚠️ Della/ATI (MOCK — 3 претензии)
- ⚠️ Gov APIs (MOCK — детерминированные данные)
- ⚠️ Face recognition (эвристика на EXIF)

**Где работает:** `/home/ubuntu/urtruck-security/scoring/` + `blacklist/` + `verification/`

---

## 🎯 АЛИЯ — Designer & UX

**Живая?** ✅ **Да** — как под-агент Толи. Делает UI-review.

**Что делает:**
- Цветовая схема (dark #0C0A09, accent driver #2563EB, client #F59E0B)
- Типографика (system font)
- Тренды 2026: glassmorphism, gradient headers, shimmer, scale 0.97
- Emoji как иконки (быстрее SVG)
- Мобильный UX (крупные touch-зоны для водителей в перчатках)

**Принципы:**
- Тёмная тема по умолчанию (ночные рейсы)
- Минимум текста, максимум визуала
- Лучше чем InDrive, Uber Freight, Lalamove

---

## 🧪 ДАНИЯР — QA & Tester

**Живой?** ✅ **Да** — прогоняет тесты после каждого билда.

**Что делает:**
- Тесты через curl на все API endpoints
- Проверка 200 OK на всех роутах
- Python-аудит переводов (11 языков × 195 ключей)
- Проверка бандла на наличие ключевых функций
- Регрессионные тесты после деплоя

**Где работает:** тесты в `bash`-скриптах после каждого `./deploy.sh`

---

## 🔧 ЖАННА — DevOps

**Живая?** ✅ **Да** — `deploy.sh` + PM2 + Nginx под управлением.

**Что делает:**
- `deploy.sh` — one-command deploy (expo export → SCP → права → 200 OK)
- PM2 конфиги для 2 процессов
- Nginx proxy (`/security/*` → 8001)
- Service Worker
- PWA manifest
- Настройка сервера (Redis, Tesseract, firewall)

**Где работает:** `deploy.sh` · `sw-template.js` · nginx configs на сервере

---

## 🤔 ЧЕСТНО О КОМАНДЕ

**Толя — это я, Claude Code.** Все остальные имена — это **роли**, которые выполняются мной же, но **специализированно**. Для тяжёлых задач я могу **реально спавнить под-агентов** через `Task` tool:

| Агент в коде | Что реально есть |
|--------------|------------------|
| **Explore** | Параллельный поиск по коду (код-ревью) |
| **Plan** | Планирование сложных задач |
| **general-purpose** | Исследования, многошаговые задачи |
| **claude-code-guide** | Вопросы про Claude Code SDK |

**Можно ли запустить всех параллельно?** Да — если задача разбивается на независимые части. Пример:
- НАСТЯ делает экран
- СЕРГЕЙ пишет API
- ДАНИЯР тестирует — все параллельно

**Для задачи которую ты сейчас дал (driver-registration backend):**
- **СЕРГЕЙ** — Node.js/Express backend, PostgreSQL, Twilio WhatsApp, face-api.js
- **ЖАННА** — деплой на сервер, миграции БД
- **МАРАТ** — интеграция с существующим Security API
- **ДАНИЯР** — тесты после каждого endpoint

---

## 🎯 КАК РАБОТАЕТ КОМАНДА

**Ты** → говоришь Толе «Сделай X» →

**Толя** разбивает на подзадачи:
1. Какие данные (СЕРГЕЙ)
2. Какой UI (НАСТЯ)
3. Как защитить (МАРАТ)
4. Как стильно (АЛИЯ)
5. Как задеплоить (ЖАННА)
6. Как протестировать (ДАНИЯР)

**Толя** делает сам или делегирует под-агентам через `Task`.
**Толя** проверяет результат, интегрирует, деплоит.
**Толя** отчитывается тебе.

---

## ⚙️ ТЕКУЩИЙ СТАТУС КОМАНДЫ

| Агент | Статус | Активные задачи |
|-------|--------|-----------------|
| 🎖 Толя | 🟢 Готов | Координация, ждёт команд |
| 🎨 Настя | 🟢 Готов | 24 экрана в проде |
| ⚙️ Сергей | 🟢 Работает | FastAPI на 8001, 2 PM2 процесса |
| 🔒 Марат | 🟢 Частично | Scoring работает, парсеры в DEMO |
| 🎯 Алия | 🟢 Готова | UI финализирован |
| 🧪 Данияр | 🟢 Готов | 7/7 сервисов HTTP 200 |
| 🔧 Жанна | 🟢 Работает | `./deploy.sh` стабильный |

**Все живые. Все готовы к работе.**

---

## 🚀 ГОТОВ К НОВОЙ ЗАДАЧЕ

Ты прислал огромное ТЗ на `driver-registration` backend. Толя посмотрел:

**Задача:** Отдельный Node.js/Express сервер для регистрации водителей с WhatsApp auth, Digital ID селфи, OCR документов, PostgreSQL.

**Вопросы перед началом:**
1. Это **дополнение к Security API** (у нас FastAPI + SQLite) или **отдельный сервис**?
2. Делать на **Node.js/Express** (как в ТЗ) или **интегрировать в текущий FastAPI на Python**?
3. Поднимать **PostgreSQL** (сейчас на сервере нет, есть SQLite) или использовать существующую БД?
4. Реальный **Twilio WhatsApp** или mock?
5. **Face Recognition** через face-api.js (Node) или установить python face-recognition в Security (как планировали раньше)?

Моё мнение как Толи: **интегрировать в существующий FastAPI** — уже есть OCR, базы, скоринг. Не множить сущности. Node.js отдельно — это лишний сервер, порт и сложность.

*Последнее обновление: 14 апреля 2026*
