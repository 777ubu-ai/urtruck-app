# PRE-FLIGHT: источник `@UrTruck_obyavleniya` — 2026-10-27

- Branch/SHA: `fix/my-listings-retention-30d-20261027` / `04b88d40b3ece24fc139a62184c3ab9896879939`.
- Рабочее дерево до этой проверки содержало локальную, ещё не развёрнутую правку parser-контактов и документацию предыдущей проверки.
- Known-good: исторические локальные проверки collector/owned bridge в `docs/qa/owned-telegram-feed-share-20261025.md`; последний доступный runtime-аудит в `qa-evidence/feed-volume-diagnostic-20261027.md` указывает `EXTERNAL_FREIGHT_SOURCE_MODE=incoming`.
- Scope: только чтение открытого пользовательского чата, конфигурации Telegram source allowlist, кода owned collector/bridge и локальный синтетический вызов парсера на обезличенных структурах двух видимых постов.
- PROTECTED: Telegram отправка/редактирование/удаление, QA2/Production API/БД/очереди/службы, importer credentials и сообщение источника.
- Checks: чтение интерфейса Telegram; проверка mode/source в исходниках и последнем runtime-отчёте; локальный `map_owned_messages` для одиночного и многомаршрутного постов. Live write запрещён рамками этой проверки; доступа к QA2 сейчас нет.
- Rollback: удаление этого аудиторского документа; тест не меняет код или данные.

## Результаты

- Открытый чат — `UrTruck — Грузы и машины | Объявления`, 8 участников в интерфейсе Telegram. Видны пересланные пользователями объявления из разных источников.
- В коде перечислено 10 базовых Telegram источников и 7 дополнительных в `ops/telegram-feed/app-sources.json`. Это кодовая конфигурация, не доказательство, что каждый источник доступен/активен в текущем runtime.
- В актуальном доступном runtime evidence мост был в режиме `incoming`; он исключает собственный `UrTruck_obyavleniya`. Для своего чата есть отдельная staged-цепочка collector + `OwnedTelegramQueueBridge`, требующая включённых флагов и отдельного adapter state. Последнее зафиксированное состояние: flags/runtime rollout не подтверждены.
- Локальный parser smoke: одиночный пост `Ташкент — Москва` распознан как active cargo; видимый многомаршрутный пост из четырёх объявлений распознан как одна review карточка без направления, то есть обещание «всё подряд как есть» текущий parser не выполняет.
- В Telegram и на сервер ничего не отправлялось; QA2/Production данные не читались и не менялись. SSH ранее отвечал `Permission denied (publickey)`; Desktop Commander quota в доступном runtime отчёте исчерпана.
