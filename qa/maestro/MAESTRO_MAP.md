# Maestro-набор: карта и триаж (актуализация 27.07.2026)

После перестройки навигации (клиент 3 вкладки, водитель 4; «Чаты» и
«Разместить» убраны как вкладки — чат внутри «Сделок», размещение кнопкой в
«Мои грузы/Рейсы») часть флоу перестала соответствовать UI. Ниже — что делать
с каждым. Запуск требует эмулятора + Expo Go (`appId: host.exp.Exponent`); из
облачной среды агента Maestro не гоняется — правится и прогоняется локально/в CI.

## Ключевая замена селектора

Почти все «сломанные» флоу чинятся одной заменой: **навигация в переписку
больше не через таб `bottom-nav-chats`** (его нет), а через
**`bottom-nav-deals` → сегмент «Чаты»** (`deals-seg-chats`). Список
переписок и комната сделки — те же (`deal-room-list-card`, `Chat`-экран).

## 🔴 УСТАРЕЛИ — перенесены в `_obsolete/` (проверяли удалённую структуру табов)

| Флоу | Почему |
|---|---|
| `.maestro/_obsolete/03-driver-tabs-preserved.yaml` | ждал 5 вкладок водителя вкл. Чаты+Профиль; теперь 4, профиль в ☰ |
| `qa/maestro/_obsolete/driver-tabs.yaml` | тот же 5-вкладочный бар |
| `qa/maestro/_obsolete/driver-canon-tabs.yaml` | «канон» табов с Chats |
| `qa/maestro/_obsolete/client-tabhunt.yaml` | сам помечен «канон устарел»: ждал 5 вкладок клиента вкл. Chats (теперь 3) |
| `qa/maestro/_obsolete/profile-queue-chats.yaml` | «Чаты как отдельная вкладка» + «Профиль»-вкладка — обоих больше нет |

Восстанавливать не нужно: их роль закрывают новые проверки навигации
(3 вкладки клиента / 4 водителя) — добавить свежими флоу `client-3tabs.yaml`
и `driver-4tabs.yaml` при следующем заходе на эмуляторе.

## 🟡 НУЖНА ПРАВКА СЕЛЕКТОРА (`bottom-nav-chats` → `bottom-nav-deals` + `deals-seg-chats`)

Ходят в переписку через удалённый таб; логика теста валидна, чинится заменой:

`.maestro/`: `02-back-from-dashboard`, `05-marketplace-preserved`,
`07-chat-shipper`, `08-chat-driver`, `10-foreground-push-suppress`,
`11-smoke-all-tabs`, `13-push-badge-sync`.

`qa/maestro/`: `audit-chat-persistence-restart`, `audit-lang-switch-during-chat`,
`badge-multiroom`, `badge-no-self`, `badge-persist-restart`,
`chat_bid_notifications_e2e`, `chat_counter_response_e2e`, `chat_driver_view`,
`chat_offer_e2e`, `client-deal-room`, `contact-phone`, `driver-auth`,
`lang-switch-flow`, `marketplace-driver-chat`, `reg_submit_tabs`,
`unread-badge-flow`, `voice-message-e2e`.

Дополнительно: `client-createcargo`, `createcargo-authenticated`, `client-auth`
завязаны на `bottom-nav-publish` (центральная «+»). Теперь размещение — кнопка
`mytrips-place-cargo` внутри «Мои грузы». Заменить шаг.

## 🟢 ЛИКЕЛИ-ОК (не зависят от убранных табов — прогнать как есть)

Регистрация/верификация, лента, очередь, гео и пр.:
`01-open-dashboard`, `04-driver-no-cta`, `06-push-permission`,
`09-cargoruqsat-info`, `11-push-foreground-other-screen`, `12-push-deeplink-bid`,
+ `qa/maestro/verification-*`, `audit-feed-*`, `audit-profile-after-registration`,
`bids-visibility`, `client-p2-verify`, `client-stress`, `verify-reentry-prefill`
и остальные вне списков выше. Проверить прогоном.

## Новые проверки, которых не хватает (добавить)

- `deals-offers-vs-chats.yaml` — сегменты «Предложения (N) / Чаты», ставка с
  перепиской уходит из «Предложений» в «Чаты».
- `deal-status-ladder.yaml` — accepted→in_progress→at_border→delivered у обеих
  сторон, карточка не теряется на at_border, статус синхронится (focus-refresh).
- `cargo-photo-upload.yaml` — фото груза грузится в storage и открывается у
  второй стороны + «Сохранить».

## Как гонять (локально / CI с эмулятором)

```
maestro test .maestro/                    # core smoke
maestro test qa/maestro/ --exclude-tags=obsolete
```
`_obsolete/` в прогон не включать.
