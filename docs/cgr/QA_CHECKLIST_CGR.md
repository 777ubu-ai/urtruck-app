# QA_CHECKLIST_CGR.md v1.1 — Чек-лист приёмки ТЗ-CGR-001

**Изменения в v1.1:**
- Все SQL-запросы переписаны под SQLite (`security.db`)
- Убраны проверки Supabase RLS (backend не использует Supabase)
- Добавлены проверки seed-миграции `border_checkpoints`
- Добавлены проверки Sentry-интеграции

**Проект:** UrTruck — Интеграция с CarGoRuqsat (Поток А)
**Ответственные QA:** Перизат, Данияр
**Версия:** 1.1
**Дата:** 28 мая 2026

---

## ⚠️ ПРАВИЛА ПРИЁМКИ (по QA_PROTOCOL.md)

> Claude Code CLI и backend-разработчик могут заявить «исправлено». **Это недостаточно.**
> QA принимает задачу только при наличии конкретных доказательств.

**Категории доказательств:**
- 🔍 **CURL** — лог реального HTTP-запроса с ответом
- 🗄 **SQL** — результат запроса к SQLite (`sqlite3 security.db`), скриншот или текст
- 📱 **SCREEN** — скриншот мобильного приложения на реальном устройстве (не эмуляторе)
- 🔔 **PUSH** — скриншот реально пришедшего push-уведомления
- 📊 **METRIC** — скриншот `/metrics` или Grafana
- 📝 **LOG** — фрагмент логов (`journalctl -u urtruck-backend` или `pm2 logs`)
- 🐛 **SENTRY** — скриншот события в Sentry

Текстовое «всё работает» без доказательств — отбрасывать, требовать proof.

---

## РАЗДЕЛ 1. РАЗВЕДКА (FR-0)

### 1.1. Файл `docs/cgr/CGR_DISCOVERY.md` создан
- [ ] Файл существует в репозитории
- [ ] Описана структура scoreboard (SSR/AJAX, селекторы или endpoint)
- [ ] Описана структура public-list
- [ ] Описана структура wa-history
- [ ] Описана структура blocked-users (с явным указанием публикуемых полей)
- [ ] Приложен текст robots.txt
- [ ] Приложена цитата из Terms of Service
- [ ] Зафиксирован порог rate limit

**Доказательство:** ссылка на коммит с файлом в Git.

---

## РАЗДЕЛ 2. СХЕМА БД И SEED

### 2.1. Таблицы созданы в SQLite
- [ ] Таблица `border_checkpoints` существует
- [ ] Таблица `cgr_scoreboard` существует
- [ ] Таблица `cgr_booking_status` существует
- [ ] Таблица `cgr_blocklist` существует
- [ ] Таблица `cgr_blocklist_matches` существует

**Доказательство 🗄 SQL:**
```bash
sqlite3 /home/ubuntu/urtruck/backend/database/security.db ".schema"
# Все 5 таблиц должны быть в выводе
```

### 2.2. Seed `border_checkpoints` выполнен
- [ ] В таблице минимум 8 строк (захардкоженные ПП из `BORDERS`)
- [ ] У всех записей `is_active = 1`
- [ ] Хардкод `BORDERS = [...]` из `border_service.py` удалён

**Доказательство 🗄 SQL:**
```bash
sqlite3 security.db "SELECT code, name_ru, country_to FROM border_checkpoints WHERE is_active=1;"
# Должно быть минимум 8 строк
```

**Доказательство:** `grep "BORDERS = " backend/services/border_service.py` — пустой результат.

### 2.3. Индексы созданы
- [ ] Все индексы из `cgr_schema.sql` присутствуют

**Доказательство 🗄 SQL:**
```bash
sqlite3 security.db "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cgr%' OR name LIKE 'idx_border%';"
```

---

## РАЗДЕЛ 3. ОНЛАЙН-ТАБЛО (FR-1)

### 3.1. Cron-задача работает
- [ ] APScheduler запускает `fetch_scoreboard` каждые 5 минут
- **Доказательство 📝 LOG:** `pm2 logs urtruck-security-api | grep "scoreboard fetched"` — записи каждые 5 минут
- **Доказательство 🗄 SQL:**
  ```sql
  SELECT checkpoint_code, MAX(fetched_at) AS last_fetch
  FROM cgr_scoreboard GROUP BY checkpoint_code;
  -- Все ПП должны иметь fetched_at не старше 6 минут
  ```

### 3.2. Эндпоинт `GET /api/v1/borders/scoreboard` отдаёт данные
- [ ] Возвращает 200
- [ ] В ответе все активные ПП из таблицы
- [ ] Имена в `name_ru`, `name_kz`, `name_cn` корректны
- **Доказательство 🔍 CURL:**
  ```bash
  curl -s https://urtruck.kz/security/api/v1/borders/scoreboard | jq '.checkpoints | length'
  # Минимум 8
  ```

### 3.3. Работа при недоступности CGR
- [ ] При блокировке CGR (firewall) эндпоинт возвращает 200 с `status: "stale"`
- **Доказательство 📝 LOG:** `WARNING cgr_client: connection failed, using cached data`
- **Доказательство 🐛 SENTRY:** скриншот события `CGR connection timeout` в Sentry

### 3.4. Виджет на фронте (реальное устройство)
- [ ] Виджет «Электронная очередь» на карточке международного рейса загружается за <2 сек
- [ ] Все активные ПП с цифрами загруженности
- [ ] При данных старше 30 мин — пометка «Обновлено X минут назад»
- **Доказательство 📱 SCREEN:** скриншоты на Android (реальный APK из CI #4)

### 3.5. Расширенный `CargoRuqsatInfoScreen.js`
- [ ] Существующие 4 секции «Что/Зачем/Когда/CTA» сохранены
- [ ] Добавлен блок live-табло загруженности
- [ ] CTA-кнопка содержит UTM: `?utm_source=urtruck&utm_medium=app&utm_campaign=booking_redirect`
- **Доказательство 📱 SCREEN:** скриншот экрана

---

## РАЗДЕЛ 4. ПРИВЯЗКА БРОНИ (FR-2)

### 4.1. Системный браузер, не WebView
- [ ] Кнопка «Забронировать на CarGoRuqsat» открывает Chrome (Android) или Safari (iOS)
- [ ] URL содержит UTM-метки
- **Доказательство 📱 SCREEN:** видео 10 сек с переходом из UrTruck в браузер
- **Проверка кода:** `grep -r "WebView\|InAppBrowser\|expo-web-browser" src/screens/CargoRuqsatInfoScreen.js` → пусто
- **Проверка кода:** `grep "Linking.openURL" src/screens/CargoRuqsatInfoScreen.js` → есть

### 4.2. Эндпоинт `POST /api/v1/borders/bookings`
- [ ] Валидация формата номера
- [ ] При неверном формате — 400 с переводом на язык пользователя
- [ ] При успехе — запись в `cgr_booking_status` создана
- **Доказательство 🔍 CURL:**
  ```bash
  curl -X POST https://urtruck.kz/security/api/v1/borders/bookings \
    -H "Authorization: Bearer <test-token>" \
    -H "Content-Type: application/json" \
    -d '{"trip_id": "test-trip-id", "booking_number": "555-XYZ"}'
  ```
- **Доказательство 🗄 SQL:**
  ```sql
  SELECT * FROM cgr_booking_status WHERE cgr_booking_number = '555-XYZ';
  ```

### 4.3. UNIQUE constraint работает
- [ ] Тот же номер брони от другого водителя → 409 Conflict
- **Доказательство 🔍 CURL:** два POST с разными `Authorization`, второй возвращает 409

### 4.4. Верификация номера в реестре
- [ ] Реальный номер → через 5-10 минут статус `verified`
- [ ] Несуществующий → через 24 часа `not_found` + push
- **Доказательство 🗄 SQL + 🔔 PUSH:** SQL до/после + скриншот push

---

## РАЗДЕЛ 5. МОНИТОРИНГ СТАТУСОВ (FR-3)

### 5.1. Опрос активных броней
- [ ] Cron каждые 15 минут
- [ ] Опрашиваются только активные брони
- **Доказательство 📝 LOG:** `INFO cgr_booking_poll: polled N active bookings in Xs`

### 5.2. Push при изменении позиции
- [ ] Push приходит на правильный язык водителя
- **Доказательство 🔔 PUSH:** 3 скриншота на разных языках (RU/KZ/CN минимум)

### 5.3. Throttling push
- [ ] Не более 1 push в час на одну бронь
- **Доказательство 📝 LOG:** `INFO push_throttler: skipped push for booking X, last sent N min ago`

### 5.4. История в админ-панели
- [ ] По каждой брони — история опросов с временем и статусом
- **Доказательство 📱 SCREEN:** скриншот админ-панели

---

## РАЗДЕЛ 6. ЧЁРНЫЙ СПИСОК (FR-4)

### 6.1. Ежедневная загрузка
- [ ] Каждый день в 03:00 список обновляется полностью
- **Доказательство 🗄 SQL:**
  ```sql
  SELECT COUNT(*), MAX(fetched_at) FROM cgr_blocklist;
  -- max(fetched_at) — сегодняшний 03:00-03:30
  ```

### 6.2. ИИН хранится только как хэш
- [ ] `iin_hash` — 64-символьная hex-строка
- [ ] Открытого ИИН (12 цифр) в БД нет нигде
- **Доказательство 🗄 SQL:**
  ```sql
  -- Проверка длины хэшей
  SELECT iin_hash, LENGTH(iin_hash) FROM cgr_blocklist WHERE iin_hash IS NOT NULL LIMIT 5;
  -- Все должны быть длиной 64

  -- Поиск ИИН в открытом виде (12 цифр) — должно быть 0
  SELECT COUNT(*) FROM cgr_blocklist WHERE raw_payload GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*';
  -- Если результат >0 — ИИН утекает в raw_payload, починить!
  ```

### 6.3. Автоматического бана НЕТ
- [ ] При совпадении создаётся `cgr_blocklist_matches.moderation_status = 'pending_review'`
- [ ] Статус водителя → `🟡 На модерации`, **НЕ** `🔴 Заблокирован`
- [ ] Водитель видит «временно ограничен, идёт проверка», **НЕ** «вы заблокированы»
- **Доказательство 📱 SCREEN:** экран водителя с сообщением

### 6.4. Задача в админ-панели модератора
- [ ] Перизат видит задачу проверки совпадения
- [ ] Кнопки «Подтвердить» / «Ложное срабатывание» / комментарий
- **Доказательство 📱 SCREEN:** скриншот админки

### 6.5. Данные третьих лиц не утекают
- [ ] Эндпоинт `GET /api/v1/users/{id}` НЕ возвращает данные о других из `cgr_blocklist`
- [ ] Эндпоинт списка водителей НЕ показывает других заблокированных
- **Доказательство 🔍 CURL:** ответ эндпоинтов, проверить отсутствие `iin_hash`, `cgr_block_reason` чужих пользователей

### 6.6. Доступ к таблице ограничен
- [ ] Только модули из `backend/cgr/` обращаются к `cgr_blocklist`
- **Доказательство:** `grep -r "cgr_blocklist" backend/ --include="*.py" | grep -v "backend/cgr/" | grep -v "tests/"` → пусто

---

## РАЗДЕЛ 7. БЕЗОПАСНОСТЬ И PRIVACY

### 7.1. User-Agent честный
- [ ] В запросах к CGR: `UrTruck/1.0 (+https://urtruck.kz; partner-integration)`
- **Доказательство 📝 LOG:** запрос в логах HTTP-клиента

### 7.2. Запросы с правильного IP
- [ ] Запросы идут с 185.22.65.11, не через прокси
- **Доказательство:** `curl https://api.ipify.org` с production VPS должен показать 185.22.65.11

### 7.3. Удаление аккаунта = удаление CGR-данных
- [ ] При удалении профиля все его записи в `cgr_booking_status` и `cgr_blocklist_matches` удаляются каскадно
- **Доказательство 🗄 SQL:** до удаления — есть записи, после — нет

### 7.4. Логи не содержат ПДн
- [ ] В логах backend нет ИИН, ФИО, ГРНЗ в открытом виде
- **Доказательство 📝 LOG:**
  ```bash
  journalctl -u urtruck-backend --since "1 hour ago" | grep -E '[0-9]{12}|[A-Z]{2}\s?[0-9]{3}\s?[A-Z]{3}' | head
  # Если есть совпадения — ИИН или ГРНЗ утекают, починить
  ```

### 7.5. Sentry получает события CGR
- [ ] При искусственной ошибке (например, 500 от CGR) в Sentry прилетает событие
- **Доказательство 🐛 SENTRY:** скриншот events в Sentry за последний час

---

## РАЗДЕЛ 8. ТЕХНИЧЕСКАЯ УСТОЙЧИВОСТЬ

### 8.1. Метрики `/metrics`
- [ ] `cgr_scoreboard_fetch_total` инкрементируется
- [ ] `cgr_booking_poll_total` инкрементируется
- [ ] `cgr_blocklist_matches_total` инкрементируется
- **Доказательство 📊 METRIC:**
  ```bash
  curl https://urtruck.kz/security/api/v1/metrics | grep cgr_
  ```

### 8.2. Алерты в Slack
- [ ] При блокировке CGR через 30 минут — алерт в `#ops`
- [ ] При совпадении в blocklist — алерт в `#cgr-moderation`
- **Доказательство:** скриншоты сообщений в Slack

### 8.3. Feature flag работает
- [ ] При `CGR_FEATURE_ENABLED=false` все cron-задачи отключаются graceful
- [ ] Эндпоинты CGR-функций возвращают 503 с понятным сообщением
- **Доказательство 🔍 CURL:** ответ эндпоинта при выключенном флаге

### 8.4. Coverage unit-тестов
- [ ] `pytest --cov=backend/cgr backend/tests/cgr/` показывает ≥80%
- **Доказательство:** вывод команды

### 8.5. Pydantic Settings работают
- [ ] При отсутствии `CGR_IIN_SALT` приложение падает на старте с понятной ошибкой
- **Доказательство 📝 LOG:** запуск без переменной → `pydantic.ValidationError: CGR_IIN_SALT field required`

---

## РАЗДЕЛ 9. UI/UX (мобильное приложение)

### 9.1. Виджет адаптивен
- [ ] Корректное отображение на экранах от 4.7" до 6.7"
- [ ] Тёмная тема (Dark Premium) применена
- **Доказательство 📱 SCREEN:** скриншоты на 3 устройствах

### 9.2. Локализация
- [ ] Все строки переведены на RU, KZ, EN, CN минимум
- [ ] Нет необработанных ключей i18n
- **Доказательство 📱 SCREEN:** скриншоты на 4 языках

### 9.3. Скорость
- [ ] Виджет рендерится за <300 мс после получения данных от API
- [ ] При отсутствии сети — кэш + значок «офлайн»

---

## РАЗДЕЛ 10. РЕЛИЗ

### 10.1. Документация обновлена
- [ ] `docs/cgr/CGR_DISCOVERY.md` — финальная версия
- [ ] `что_сделано_Ur_Truck.md` — добавлен раздел CGR
- [ ] `SECURITY_ARCHITECTURE.md` — обновлён раздел CarGoRuqsat
- [ ] `docs/cgr/TZ-CGR-001-v1.1.md` и `docs/cgr/QA_CHECKLIST_CGR.md` в master

### 10.2. Staging-тестирование
- [ ] Все 9 разделов чеклиста пройдены
- [ ] Минимум 1 бета-водитель из 10-20 закрытой беты реально использовал функцию
- [ ] Фидбек от бета-водителя зафиксирован

### 10.3. Production-релиз
- [ ] Перизат подписала финальную версию чеклиста
- [ ] Бахитжан дал устное «ОК»
- [ ] Жанна (DevOps) подтвердила готовность инфраструктуры
- [ ] `CGR_FEATURE_ENABLED=true` в production env
- [ ] В течение 24 часов после релиза — повышенное внимание к Sentry и Slack

---

## ПОДПИСИ

- [ ] Перизат, QA Lead: _______________________ (дата)
- [ ] Данияр, QA: _______________________ (дата)
- [ ] Сергей, Backend: _______________________ (дата)
- [ ] Настя, Frontend: _______________________ (дата)
- [ ] Жанна, DevOps: _______________________ (дата)
- [ ] Марат, Security: _______________________ (дата)
- [ ] Бахитжан, Product Owner: _______________________ (дата)

**Только при всех подписях задача считается закрытой.**
