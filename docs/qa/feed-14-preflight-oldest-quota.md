# PRE-FLIGHT — FEED-14: резерв старых записей outbox

- Зафиксировано: 2026-11-02 UTC.
- Ветка: `fix/feed14-oldest-outbox-quota`.
- Исходный HEAD и base `qa2/integration-candidate`: `3e77c21357a98c80eed764c9a7ca52b2a038e14d`.
- Известная хорошая реализация: PR #667, bounded drain до 2 пакетов по 50 записей за цикл, уже установленная на QA2; workflow https://github.com/777ubu-ai/urtruck-app/actions/runs/41487679927.
- Установленный candidate SHA до этого патча: `3e77c21357a98c80eed764c9a7ca52b2a038e14d`. Подтверждённый Production SHA: UNKNOWN; Production не затрагивается.
- Scope: только выборка приоритетной когорты в `backend/services/external_freight_import_adapter.py`, метрики полного/flush-цикла в `backend/services/external_freight_queue_bridge.py`, адресные тесты `backend/tests/test_external_freight_queue_bridge.py` и этот журнал.
- Диагноз до изменения: на установленной версии за первые 16 минут 25 записей терминально истекли; при этом выборка принимала активные сегменты, но ни одной записи с возрастом источника ≥9 дней. Базовый порядок `attempts, source_id, source_message_id, segment_id` не гарантирует продвижение старейших записей. Это согласуется с наблюдением, но измерение короткое и не доказывает долгосрочную скорость.
- Риски: дополнительная ограниченная SQL-выборка может увеличить время цикла; резерв не должен вытеснять свежие записи, машины, закрытия и due retries. Изменение не добавляет писателей, таблиц, индексов, миграций или сетевых операций внутри транзакции.
- Защищаемые области: Telegram collector/publisher, API-контракт, схема/данные SQLite, клиент и APK, Xiaomi-данные, owned bridge, Production.
- Проверки: адресные тесты outbox/priority/backoff/partial ACK/expired/empty-source; затем полный обязательный Quality Gate и защищённый QA2 deploy. После установки — новая baseline и два последовательных часовых баланса. Физический Retry Xiaomi требует синхронной ручной попытки владельца; повторный запрос уже отправлен и не дублируется.
- Откат: revert только коммита/PR этого изменения через защищённый PR; БД и очередь не откатывать и не очищать. До deploy сохранённые SQLite backup/rollback-процедуры QA2 остаются обязанностью штатного workflow.
- Связи Graphify: `ExternalFreightFeedAdapter` связан с `PublishedQueueBridge`, `IncomingQueueBridge`, `OwnedTelegramQueueBridge` и тестами adapter/bridge; этот патч ограничен выбором `selected_outbox` и выдаваемыми метриками цикла. Граф построен локально (`graphify update .`); SQL parser отсутствовал, поэтому SQL AST-граф не использовался.
