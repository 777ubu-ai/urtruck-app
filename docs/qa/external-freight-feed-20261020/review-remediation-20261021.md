# PRE-FLIGHT: исправления review PR568

Branch fix/external-feed-review-20261021, base a92e6f493fd535ac5cd995d94281693363fbeb02. Review 5604432553 прочитан через GitHub plugin: три воспроизведения, approval отсутствует.
Known-good: CI 39651116405 3/3 PASS именно a92e6f49; он не покрывал найденные три дефекта. Production SHA UNKNOWN в этой работе. Новый код не принят физически.
Scope: только external queue bridge, durable adapter, external DAL и их тесты. Защищены основной продукт, основной SQLite, Telegram publisher/source queue, frontend, GPS, auth, chat/deals, runtime и магазины. Владелец разрешил продолжить исправления. AST Graphify запускается до правок database logic.
Checks: сначала воспроизвести три FAIL, затем регрессии edits/close/restart/TTL, manual approval/replay/edit, mixed 422/valid/retry/quarantine/generation. Существующий целевой backend и 29 guards основной реализации. Frontend не меняется, APK не собираем.
Rollback: отдельный revert исходного патча до deploy. Применяемых изменений runtime/данных нет; новая схема только локальной adapter SQLite, миграция совместима со старой схемой. Review и QA2 deploy остаются отдельными этапами.

## Исправленные причины

- P1 / review comment 4340513105: seen хранит ревизию исходной строки. Хеш учитывает все исходные поля, включая text/phones/date. Изменения повторно проходят durable enqueue; seen обновляется только после enqueue либо записи диагностируемого rejection. Старая схема seen мигрирует с сохранением строк, пересверяя прежние seen однократно. Закрытие без маршрута сохраняет closed; при закрытии существующей машины DAL сохраняет её kind. Исходный ID, дата и expires_at сохраняются.
- P2 / 4340513117: DAL сравнивает содержательные нормализованные поля с текущей записью. Точный replay не сбрасывает active в review после ручного одобрения; изменение текста или структурированных условий требует повторной классификации. Проверка expiry остаётся обязательной. Изменение только цены теперь также даёт updated, а не ложный replay.
- P2 / 4340513130: batch API остаётся атомарным и совместимым. После 422 адаптер проверяет каждую запись отдельно. Только одиночный 422 помещает данную generation в durable quarantine, сохраняя payload и причину import_validation_422. Корректные записи доставляются; исправленный payload очищает quarantine и создаёт новую generation. 401/403/429/503 и сеть остаются retry. ACK/retry/quarantine защищены generation. Разбор ограничен бюджетом 25 секунд до начала последнего HTTP-запроса (timeout 8 секунд), укладываясь в oneshot 45 секунд при штатных локальных операциях; неисследованные строки сохраняются с backoff. Выбор менее часто повторявшихся записей снижает голодание свежих. Quarantine count виден в результате bridge, секреты и payload в stdout не выводятся.

## Доказательства

До исправлений: три новых теста воспроизведения — 3 FAILED на a92e6f49.
После исправлений:
- external backend/parser/bridge: 72 passed, 3 существующих deprecation warnings.
- frontend unit/contracts: 48 passed, включая 29 guards согласованной основной реализации.
- git diff --check PASS.
- Дополнительно покрыты: source edit/close/restart/contact-only edit; bridge -> настоящий изолированный importer -> closed/count с неизменным TTL; approval/replay/изменение цены; смесь 422/valid на настоящей валидации API; 50 invalid перед valid; 401/403/429/503; исправление во время stale 422; миграция legacy adapter и частично добавленной quarantine-схемы; исчерпание бюджета без потери строки.
- Graphify AST выполнен; предупреждения об отсутствии SQL extractor и частичном разборе Gradle не скрываются и не считаются runtime-проверкой.

Проверки используют временные синтетические БД, источник открывается read-only. Рабочая очередь, Telegram worker и runtime не менялись. Frontend, APK, магазины, production и QA2 deploy не затрагивались; web/mobile проверки старого SHA не переносятся на новый.
Review threads не закрывались автором. Требуется повторная проверка трёх воспроизведений на новом SHA и обязательное независимое review. Общая функция остаётся PARTIAL до QA2 живого импорта и физической приёмки.
