# ЗАДАЧА для Терминал-Клода (Mac): полный прогон Maestro → потом build 39

Ты на Маке с доступом к репозиторию, эмулятору/устройству, Maestro, EAS.
**Порядок строгий: СНАЧАЛА полный прогон Maestro и фиксы. Собирать build 39 —
ТОЛЬКО когда Maestro зелёный.** Не собирай раньше.

---

## 0. Синхронизация
1. `git fetch origin && git checkout claude/youthful-cerf-barf3 && git pull` (ветка = актуальный код; она влита в `main`).
2. `npm install` — подтянет новый `expo-document-picker` (он уже в package.json).
3. `npx expo prebuild -p ios --clean` — чтобы натив подхватил разрешения из app.json
   (микрофон, фоновая геолокация) и новый нативный модуль document-picker.

## 1. Контекст: что изменилось (это надо покрыть тестами)
За сессию влито много (см. `docs/BUILD39_CHANGELOG.md`). Ключевое для QA:
- **Иконки:** весь app переведён на Feather (46 экранов). Проверить, что нигде не
  крашит из-за иконок, тексты кнопок на месте, флаги стран остались.
- **Верификация водителя — новый порядок (4 шага):** Гражданство → Удостоверение
  (2 стороны) → Документы авто → Параметры. Селфи и Фото-фуры УБРАНЫ из цепочки.
- **Повторный вход** в верификацию подтягивает сохранённые данные.
- **Статусы водителя:** Новичок → Проверенный → Профи (шкала 50/80/100).
- **Профиль грузоотправителя:** мессенджер (WeChat/WA/TG/Viber)+ID, БИН/ИНН.
- **Создание груза:** цена и дата обязательны, валюта USD по умолчанию, «по
  договорённости» убрана; предел скидки −90%.
- **Чат:** голос/фото в правильную комнату, «печатает…»/«онлайн», контакт
  WhatsApp/Viber/звонок, геолокация; PDF-вложения в сделке (document-picker).
- **Лента:** ❤️ избранное с карточки, перевод городов/грузов на китайский.
- **Очередь:** честный «Нет данных».

## 2. ЖЁСТКИЕ ОГРАНИЧЕНИЯ (не нарушать)
- Тестировать ТОЛЬКО актёрами `agent-boris` (client) и `agent-serik` (driver) —
  инфраструктура: `qa/maestro/_lib/qa-login.yaml`, `ensure-actor.js/.sh`,
  `clean-state.sh`. **Реальных пользователей НЕ трогать.**
- **НЕ собирать build и НЕ сабмитить в App Store**, пока Maestro не зелёный.
- **НЕ менять app.json version** (остаётся 1.0.2, buildNumber инкрементит EAS).
- **НЕ форсить пуш, не амендить чужие коммиты, не пропускать хуки** (`--no-verify`).
- Прод-данные напрямую не менять.

## 3. Прогон Maestro — существующие флоу (сначала это)
Прогони весь набор как smoke+regression. Основные группы:

**Смоук/навигация:** `.maestro/01-open-dashboard.yaml`, `.maestro/11-smoke-all-tabs.yaml`,
`.maestro/03-driver-tabs-preserved.yaml`, `.maestro/05-marketplace-preserved.yaml`.
**Авторизация/актёры:** `qa/maestro/client-auth.yaml`, `qa/maestro/driver-auth.yaml`.
**Клиент:** `qa/maestro/client-createcargo.yaml`, `client-cargodetail.yaml`,
`client-offers-actions.yaml`, `client-deal-chat.yaml`, `client-deal-room.yaml`,
`client-tripdetail.yaml`, `client-tabs.yaml`, `client-profilehunt.yaml`.
**Водитель:** `qa/maestro/driver-bid-actions.yaml`, `driver-canon-tabs.yaml`,
`driver-queue-cgr.yaml`, `marketplace-driver-chat.yaml`, `chat_driver_view.yaml`.
**Чат/пуш:** `qa/maestro/chat_bid_notifications_e2e.yaml`, `deal_bell_price_e2e.yaml`,
`.maestro/07-chat-shipper.yaml`, `.maestro/08-chat-driver.yaml`,
`.maestro/10-foreground-push-suppress.yaml`, `.maestro/12-push-deeplink-bid.yaml`,
`.maestro/13-push-badge-sync.yaml`, `qa/maestro/unread-badge-flow.yaml`,
`badge-multiroom.yaml`, `badge-persist-restart.yaml`.
**Верификация/регистрация:** `qa/maestro/verification-authenticated.yaml`,
`reg_submit_tabs.yaml`, `registration-guides-first.yaml`,
`audit-profile-after-registration.yaml`.
**Аудиты:** `qa/maestro/audit-chat-persistence-restart.yaml`,
`audit-feed-filter-empty.yaml`, `audit-lang-switch-during-chat.yaml`,
`audit-notification-deeplink.yaml`, `lang-switch-flow.yaml`.

Запуск: `maestro test <файл>` (или папкой). Фиксируй каждый упавший шаг со
скриншотом/логом.

## 4. НОВЫЕ флоу — написать и прогнать (покрытие сегодняшних правок)
Готовых нет, напиши по образцу существующих (актёры через `qa-login.yaml`):
1. `verify-4step-order.yaml` — новый порядок: Гражданство → Удостоверение (2 фото:
   лицевая+оборотная) → Документы авто → Параметры → submit. Проверить, что
   селфи/фото-фуры НЕТ, «Шаг N из 4».
2. `verify-reentry-prefill.yaml` — закрыть/зайти заново: ФИО/ИИН/дата/фото
   подтянулись, верификацию заново не просит.
3. `driver-tier-badge.yaml` — после верификации статус 🔵 «Проверенный · 80/100»
   в профиле и «Мой статус».
4. `shipper-profile-messenger.yaml` — профиль клиента: выбор мессенджера
   (WeChat/WA/TG/Viber) + ID + БИН/ИНН, сохранение и повторное открытие.
5. `feed-favorite-heart.yaml` — ❤️ на карточке ленты → перевозчик в Избранном (Профиль).
6. `deal-pdf-attach.yaml` — в сделке кнопка «Документ» открывает файловый пикер;
   при невозможности мокнуть файл на симуляторе — API-проверка `GET /chat/.../attachments`.
7. `contact-messengers.yaml` — кнопка контакта даёт выбор WhatsApp/Viber/звонок.
8. `createcargo-guards.yaml` — пустая цена/дата не публикуются; валюта по умолчанию USD.

## 5. Ручные пункты (только реальное устройство — не Maestro)
Отметить отдельно (см. `qa/BUILD39_QA_CHECKLIST.md`, раздел 1):
голосовые e2e на 2 устройствах, камера/галерея, PDF-пикер, фоновый GPS при
свёрнутом приложении, пуш на локскрине, звонок/Viber, иконка/версия на iPhone.

## 6. Фиксы
Всё, что упало по логике/коду — чини в тот же день (P0→P1→P2). Если фикс трогает
зону вне сегодняшних правок или это архитектура — сперва спроси владельца.
После фиксов — перепрогнать ТОЛЬКО упавшие флоу.

## 7. Отчёт
Верни владельцу: сколько флоу прогнано, что зелёное, что красное (шаги+скрин),
что починил, что осталось. **Пока не зелёно — не собирай build.**

## 8. Только ПОСЛЕ зелёного Maestro — сборка build 39
```
npm install
eas build --platform ios --profile production
```
→ TestFlight → пройти ручной чек-лист (раздел 5) на реальном iPhone.
**Submit в App Store делает владелец сам** — ты только докладываешь «Готово к Submit».

Часовые пояса и нативный PDF-viewer — build 40, сейчас НЕ трогать.
