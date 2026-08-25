# ПОЛНЫЙ АУДИТ UrTruck App

Дата: 2026-04-24  
Версия: v1.0.50

---

## СВОДКА

| Категория | Критич. | Важных | Средних | Мелких |
|-----------|---------|--------|---------|--------|
| Фронтенд — навигация/экраны | 2 | 3 | 2 | 1 |
| Фронтенд — i18n | 1 | 1 | — | — |
| Бэкенд и сервер | 2 | 5 | 6 | 1 |
| Конфиги и деплой | 4 | 3 | 2 | — |
| **ИТОГО** | **9** | **12** | **10** | **2** |

---

# 🔴 КРИТИЧЕСКИЕ (9 штук)

### K1. Бэкапы БД не работают с 19 апреля
- **Где:** Сервер, scheduler/backup_job.py
- **Суть:** Путь к БД указан как `/home/ubuntu/urtruck-security/database/security.db` (старый), а реальная БД в `/home/ubuntu/urtruck/backend/database/security.db`
- **Последствие:** Бэкапы не создаются 5 дней. При потере диска — потеря всех данных
- **Фикс:** Заменить путь в backup_job.py

### K2. Race condition при навигации из Onboarding
- **Где:** `OnboardingScreen.js:50-51`
- **Суть:** `ensureGuest()` + `replace('Main')` — если AuthContext не успел переключить стек навигации, произойдёт crash: «The action REPLACE with payload {"name":"Main"} was not handled»
- **Фикс:** Дождаться переключения стека перед navigate, или использовать `navigation.reset` с проверкой

### K3. AuthScreen — ни одна строка не через t()
- **Где:** `AuthScreen.js` — ~20 хардкоженных русских строк
- **Суть:** `useI18n` импортирован, но `t()` не вызывается ни разу. Экран авторизации полностью на русском для ВСЕХ языков
- **Фикс:** Обернуть все строки в t(), добавить ключи во все 11 языков

### K4. 8 экранов без i18n вообще
- **Где:** AboutScreen, ChatsListScreen, QueueScreen, NotificationsScreen, StatsScreen, SecurityScreen (t() не используется), HowItWorksScreen (весь контент хардкод), SplashScreen
- **Суть:** Эти экраны будут на русском для ВСЕХ пользователей, включая китайских, узбекских, немецких
- **Фикс:** Добавить useI18n + обернуть все строки

### K5. Разброс i18n ключей — от 111 до 244
- **Где:** `src/utils/i18n.js`
- **Суть:** RU=244, KG=111, FR=111, EN=160. Половина интерфейса пустая для KG/FR пользователей. Нет fallback на RU
- **Фикс:** Дополнить все языки до 244 + добавить fallback `return translations.RU[key]` в useI18n

### K6. Icon 400x400 JPG вместо 1024x1024 PNG
- **Где:** `assets/logo.jpg`, `app.json:9`
- **Суть:** App Store требует 1024x1024 PNG. Splash и adaptive-icon отсутствуют полностью
- **Фикс:** Создать icon.png 1024x1024, splash.png, adaptive-icon.png, favicon.png

### K7. EAS projectId пустой
- **Где:** `app.json:53` — `extra.eas.projectId: ""`
- **Суть:** EAS Build невозможен — нативные сборки для App Store / Play Store не соберутся
- **Фикс:** Зарегистрировать проект в Expo и прописать ID

### K8. IP 185.22.65.11 захардкожен в 17+ файлах
- **Где:** marketAPI.js, chatAPI.js, reviews.js, registration.js, ErrorBoundary.js и др.
- **Суть:** При смене сервера нужно менять 17+ файлов. Нет единой конфигурации
- **Фикс:** Вынести `API_BASE_URL` в одно место (env / config)

### K9. sshpass + пароль в CI
- **Где:** `.github/workflows/deploy.yml:62-63`
- **Суть:** Используется `sshpass` с `SERVER_PASS` вместо SSH-ключей. Антипаттерн безопасности
- **Фикс:** Перейти на SSH-ключи через GitHub Secrets

---

# 🟡 ВАЖНЫЕ (12 штук)

### В1. expo-av не установлен
- **Где:** package.json, ChatScreen.js
- **Суть:** Голосовые сообщения не работают на native (iOS/Android). Web-only workaround через getUserMedia
- **Фикс:** `npx expo install expo-av`, переписать запись/воспроизведение

### В2. Capacitor в зависимостях
- **Где:** package.json:14-16
- **Суть:** `@capacitor/android`, `@capacitor/cli`, `@capacitor/core` — несовместимы с Expo, мёртвый груз
- **Фикс:** Удалить `@capacitor/*`

### В3. Expo SDK 55 vs документация SDK 52
- **Где:** package.json vs CLAUDE.md
- **Суть:** Реальная версия Expo 55, но документация говорит SDK 52. react-native-web `0.19.13` устаревшая для Expo 55 (нужна ~0.20.x)
- **Фикс:** Обновить CLAUDE.md + обновить react-native-web

### В4. PM2 не в PATH + нет systemd
- **Где:** Сервер
- **Суть:** `pm2` бинарник доступен только через NVM. Нет `pm2 startup` / `pm2 save`. При перезагрузке сервера — бэкенд не поднимется
- **Фикс:** `pm2 startup` + `pm2 save`

### В5. seed_demo_blacklist() на каждом startup
- **Где:** main.py, startup event
- **Суть:** 5 demo-записей в blacklist пересоздаются при каждом перезапуске в production
- **Фикс:** Добавить проверку `if TEST_MODE`

### В6. deploy.sh и CI рассинхронизированы
- **Где:** deploy.sh vs .github/workflows/deploy.yml
- **Суть:** CI делает упрощённый пост-процесс (только manifest), deploy.sh — полный (meta, SW, OG-tags). Разные пути на сервере (`urtruck-app` vs `urtruck/frontend`)
- **Фикс:** Синхронизировать логику или использовать один механизм

### В7. deploy.sh в .gitignore
- **Где:** .gitignore:46
- **Суть:** deploy.sh не попадает в git. Новый разработчик не получит скрипт деплоя
- **Фикс:** Убрать из .gitignore

### В8. window.prompt() в мобильном коде
- **Где:** DriverDetail.js:140-141
- **Суть:** `window.prompt()` не существует на iOS/Android → crash или undefined. Нет Platform guard
- **Фикс:** Заменить на Alert.prompt или модальное окно

### В9. StrictHostKeyChecking=no в deploy
- **Где:** deploy.sh:115,118-120, deploy.yml:62-63
- **Суть:** Уязвимость MITM при SSH-подключении
- **Фикс:** Добавить known_hosts или accept-new

### В10. Swagger UI открыт в production
- **Где:** Сервер, main.py — `docs_url="/docs"`
- **Суть:** Любой может видеть API-документацию. Помогает атакующим
- **Фикс:** `docs_url=None` в production или закрыть Basic Auth

### В11. Нет очистки expired данных
- **Где:** Сервер, БД
- **Суть:** 12 просроченных verification_codes, expired сессии не чистятся. Таблицы будут расти
- **Фикс:** Добавить cron-задачу в scheduler

### В12. Storage = local, нет S3/Supabase
- **Где:** Сервер
- **Суть:** Документы водителей (селфи, права, техпаспорт) хранятся на одном диске. Нет резервного хранилища
- **Фикс:** Настроить S3 или Supabase Storage

---

# 🟢 СРЕДНИЕ (10 штук)

### С1. Хардкод фона вместо theme.bg (4 экрана)
- SplashScreen.js:28 — `#0a0f1a`
- OnboardingScreen.js:150 — `#0a0f1a`
- AuthScreen.js:196 — `#0a0f1a`
- RoleScreen.js:12 — `#0A1628`

### С2. RegScreen — ~40 хардкоженных русских строк
- STEPS: 'WhatsApp', 'Личность', 'Документы', 'Транспорт', 'Готово'
- VEHICLE_TYPES: 'Тент', 'Рефрижератор' и т.д.
- Все тосты, подсказки, заголовки шагов

### С3. FeedScreen — хардкод фильтров и категорий
- Чипы категорий: 'Одежда и текстиль', 'Электроника', 'Стройматериалы' и т.д.
- Сортировка: '💰 Цена ↑', '💰 Цена ↓', '★ Рейтинг'
- Пустые состояния: 'Пока пусто. Будь первым!'

### С4. Supabase ключи в исходном коде
- `src/config/supabase.js:6-7` — URL и anon key
- Anon key публичный по дизайну, но лучше через env

### С5. Нет rate limiting на nginx
- Сканеры пробивают `/api/graphql`, `/api/swagger.json`
- Нет `limit_req_zone` в nginx конфиге

### С6. PWA иконки — inline SVG
- manifest генерируется с data-URL SVG иконками
- Не все браузеры поддерживают установку PWA с SVG-иконками

### С7. SplashScreen без SafeAreaView
- Единственный экран без SafeAreaView — контент может залезть под notch

### С8. ErrorBoundary показывает error.message
- `ErrorBoundary.js:46` — может показать техническое сообщение пользователю
- Stack скрыт, но message видно

### С9. 3 пустые таблицы push
- push_subscriptions, notifications, push_tokens_native — 0 строк
- VAPID ключи настроены, но фронтенд не подписывает клиентов

### С10. Self-signed SSL на :8443
- Мобильные клиенты получат предупреждение о небезопасном сертификате

---

# 📋 ПОЛНАЯ КАРТА i18n ПРОБЛЕМ ПО ЭКРАНАМ

| Экран | useI18n | t() | Хардкод строк |
|-------|---------|-----|---------------|
| SplashScreen | ❌ нет | ❌ | 2 |
| OnboardingScreen | ✅ | ⚠️ частично | ~8 fallback |
| AuthScreen | ✅ | ❌ не используется | **~20** |
| RoleScreen | ✅ | ✅ | 0 |
| RegScreen | ✅ | ⚠️ частично | **~40** |
| FeedScreen | ✅ | ⚠️ частично | ~15 |
| CargoDetail | ✅ | ⚠️ частично | 5 |
| DriverDetail | ✅ | ⚠️ частично | ~10 |
| TripDetail | ✅ | ⚠️ частично | ~15 |
| ChatScreen | ✅ | ⚠️ частично | 2 |
| ChatsListScreen | ❌ нет | ❌ | 5 |
| TrackScreen | ✅ | ⚠️ частично | ~15 |
| WalletScreen | ✅ | ⚠️ частично | 3 |
| ProfileScreen | ✅ | ⚠️ частично | 2 |
| MyTripsScreen | ✅ | ⚠️ частично | ~12 |
| ReviewsScreen | ✅ | ⚠️ частично | 5 |
| ArchiveScreen | ✅ | ✅ | 0 |
| BlacklistScreen | ✅ | ✅ | 0 |
| EducationScreen | ✅ | ✅ | 0 |
| PushFilterScreen | ✅ | ⚠️ частично | ~10 |
| QueueScreen | ❌ нет | ❌ | ~10 |
| NotificationsScreen | ❌ нет | ❌ | 3 |
| StatsScreen | ❌ нет | ❌ | 4 |
| SecurityScreen | ✅ | ❌ не используется | ~12 |
| HowItWorksScreen | ✅ | ❌ не используется | **~30** |
| AboutScreen | ❌ нет | ❌ | **~20** |
| EditProfileScreen | ✅ | ⚠️ частично | 6 |

**Итого хардкоженных строк: ~250+**

---

# 🗄 БЭКЕНД — СОСТОЯНИЕ БД

| Таблица | Строк | Статус |
|---------|-------|--------|
| telegram_mentions | 234 | OK |
| reg_sessions | 137 | OK (есть expired) |
| drivers_registration | 91 | OK |
| chat_messages | 51 | OK |
| verification_logs | 41 | OK |
| driver_scores | 26 | OK |
| bids | 21 | OK |
| verification_codes | 15 | 12 expired |
| cargos | 12 | OK, чистые |
| chat_rooms | 12 | OK |
| reviews | 10 | OK |
| trips | 10 | OK |
| blacklist | 5 | Все demo/seed |
| push_subscriptions | **0** | Пусто |
| notifications | **0** | Пусто |
| push_tokens_native | **0** | Пусто |

---

# 🏗 ПЛАН ИСПРАВЛЕНИЙ (приоритет)

## Фаза 1 — Срочно (сегодня)
1. ✅ Починить путь к БД в backup_job.py → бэкапы заработают
2. ✅ `pm2 startup` + `pm2 save` → автозапуск при ребуте

## Фаза 2 — i18n (1-2 дня)
3. Добавить fallback на RU в useI18n.js (1 строка кода)
4. Добавить useI18n в 6 экранов без него
5. Обернуть ~250 хардкоженных строк в t()
6. Дополнить все 11 языков до 244 ключей

## Фаза 3 — Конфиги и безопасность (1 день)
7. Создать icon.png 1024x1024 + splash.png + adaptive-icon.png
8. Вынести API_BASE_URL в единый конфиг
9. Удалить @capacitor/* из package.json
10. Закрыть Swagger UI в production
11. Убрать seed_demo_blacklist() из production startup

## Фаза 4 — Инфраструктура (2-3 дня)
12. SSH-ключи вместо sshpass в CI
13. Синхронизировать deploy.sh и CI
14. Установить expo-av для голосовых
15. Настроить rate limiting в nginx
16. Заменить window.prompt() на модалку в DriverDetail
17. Починить race condition в OnboardingScreen

## Фаза 5 — Nice to have
18. Обновить react-native-web до ~0.20.x
19. Настроить S3/Supabase Storage
20. Добавить cron очистку expired данных
21. Унифицировать тёмный фон через theme.bg
