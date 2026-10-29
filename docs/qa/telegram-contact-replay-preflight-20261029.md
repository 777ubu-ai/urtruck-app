# PRE-FLIGHT: повторный разбор уже опубликованных Telegram-постов

- Branch/SHA: `fix/telegram-reparse-after-contact-fix-20261029`, база `c59cc507ec886432b63dfc031355c0548dda53ef` (PR #645 уже в QA2 candidate).
- Production SHA: UNKNOWN; изменяется только QA2.
- Known-good: PR #645 (`c59cc507`) установлен на QA2 workflow `40812983731`, backup/deploy/validation SUCCESS. QA2 API `1.0.50`; collector, feed bridge и backend active после деплоя; у collector `NRestarts=0`.
- Scope: только revision constants `PARSER_REVISION`, `PublishedQueueBridge.parser_revision`, `OwnedTelegramQueueBridge.parser_revision` в `backend/services/external_freight_queue_bridge.py` и regression tests/evidence. Не меняются источник, ingest/Telegram publisher, API schema, DB data, production, UI и приложения.
- Причина: bridge учитывает `parser_revision` при дедупликации и не пересканирует уже разобранную запись, даже если код parser обновился. Поэтому PR #645 исправляет новые сообщения, а прежние карточки не пересчитываются без revision bump.
- Checks: тест повторного разбора уже опубликованного source record; очередь/outbox idempotency/edit/closure regressions; полный backend suite, CI; после deploy убедиться, что seen revision сменился на новую версию, bridge циклы успешны и существующая очередь/счётчики не уменьшились неожиданно.
- Риски: пересканирование исторических входов увеличит работу моста и может обновить данные карточек. Idempotency/outbox остаются включены; очередь не чистится, записи не удаляются.
- Rollback: PR revert/deploy к parent `c59cc507`; сохранённый QA2 code-only backup до последней установки остаётся доступен. БД-обновления обратным удалением не выполняются.

## Проверка

- Все три runtime path получили новую revision (`incoming`, published queue и owned feed), чтобы уже отмеченные записи стали кандидатами повторного разбора.
- Новый regression test фиксирует ревизии и защищает от незаметного пропуска повторной обработки в следующем релизе.
- Полный локальный backend suite после revision bump: 1 871 passed, 10 subtests passed. `compileall` и `git diff --check` PASS. Далее обязательный CI и повторная проверка QA2 bridge после deploy.
