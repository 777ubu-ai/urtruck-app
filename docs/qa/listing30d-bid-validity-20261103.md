# Исправление доступности предложений на 30 дней

PRE-FLIGHT: fix/listing-30d-bid-validity-20261103, база a27aabef7a0ee399dd63b98f85753b8f3b6f7e29. Installed production SHA UNKNOWN. Known-good physical scenario отсутствует; дефект подтверждён скриншотом владельца и старым guard. Scope: marketplace bid guard, bid expiry, связанные тесты; Auth/GPS/внешняя Telegram-лента/данные не меняются. Откат: revert patch, без отката БД. Graphify AST update: 13827 nodes/30990 edges, SQL extractor отсутствует; изучены create_bid -> _finalize_accept_inline -> bid_expiry.

Решение владельца: активный пользовательский груз/рейс доступен для предложений 30 дней от публикации без ручного обновления из-за старой даты маршрута. Не означает бесконечное продление или переписывание даты погрузки.

Причина: публичная выдача уже использовала 30 дней, но create/accept проверяли прошедшую дату маршрута, а expiry закрывал свежие ставки по этой дате.

Патч: create/accept проверяют published_at (fallback created_at) + 30 дней; очистка больше не истекает свежие ставки только по дате маршрута. 48h TTL ставок, статусы, ownership и атомарное принятие сохранены. Принятые сделки и прежние истёкшие ставки не воскрешаются.

Проверено: 116 passed в test_bid_route_date_guard, test_bid_expiry, test_bid_actions, test_p0_deal_bid_race, test_self_bid_and_webhook_guard, test_public_feed_search_filters; 148 предупреждений, преимущественно устаревший datetime.utcnow. Локальная отдельная SQLite /private/tmp/urtruck-listing30d-tests.db. git diff --check PASS.

NOT RUN: полный CI, deploy, реальное создание/принятие на QA2/iPhone/Android. До этого не считать сервер исправленным. После CI штатный QA2 deploy с backup/rollback и exact SHA, затем обе стороны проверяют старую дату погрузки с новой публикацией; отдельно >30d, закрытый/занятый, повторное принятие, TTL48h и недоступность чужих данных.

## Продолжение 04.11.2026

PRE-FLIGHT: исходный HEAD9c27700c; актуальная база4e03ad74 получена и объединена обычным merge в этой же ветке. Tracked-изменений до работы не было; graphify-out — прежний сгенерированный вывод. Production SHA UNKNOWN. Scope расширен в рамках прямого задания владельца: marketplace, bid_expiry, request-time expiry probe, точный срок UTC/история MyTrips и адресные тесты. Auth, FSM, GPS, документы, дизайн и внешняя лента10d защищены. Откат — revert кода, без восстановления старой БД поверх живой.

Graphify AST update:13830 nodes/30994 edges; SQL extractor отсутствует. Изучены create_bid, общий _finalize_accept_inline, counter/reject/update, get_conn expiry probe, MyTrips. Подтверждённые дефекты: календарный день public filter расходился с точным сроком; TTL можно было обойти до очередной очистки; cleanup автоматически возвращал expired в active; republish переписывал дату маршрута; обычный accept не сохранял уведомления обеим сторонам атомарно; сбои обязательного события/сообщения игнорировались; явный expired отсутствовал в истории UI.

Исправление: срок ровно30×24h UTC от parsed published_at с fallback parsed created_at; при now>=deadline запись скрыта/не принимает действия. Беззонные SQLite timestamps — UTC. TTL48h проверяется сервером при каждом действии, действия не обновляют published_at. Очистка только active→expired, строки/сделки сохранены. Только явная повторная публикация начинает новое окно, дата маршрута сохранена. Обычный accept сохраняет обе notifications/outbox в транзакции сделки; сбой события/маркера/уведомления откатывает резервирование и создание. Условные UPDATE и уникальные ограничения сохранены, создание ставки сериализовано с резервированием объявления.

Исторический CI41677865927: backend/E2E PASS, frontend FAIL на protected hash marketplace.py. Добавлено отдельное явно разрешённое владельцем scope-исключение с точными hash; прочие protected baseline сохранены. Поведенческие регрессии проверяют причину, hash-gate не отключён. Локально261 backend PASS,34 адресных frontend PASS, lint618файлов PASS; затем добавлены проверки публичной выдачи/TTL, итог CI фиксируется отдельно. Store-кандидат8106/125 сохранён; новые изменения не объявляются проверенными на старом IPA.
