# Исправление доступности предложений на 30 дней

PRE-FLIGHT: fix/listing-30d-bid-validity-20261103, база a27aabef7a0ee399dd63b98f85753b8f3b6f7e29. Installed production SHA UNKNOWN. Known-good physical scenario отсутствует; дефект подтверждён скриншотом владельца и старым guard. Scope: marketplace bid guard, bid expiry, связанные тесты; Auth/GPS/внешняя Telegram-лента/данные не меняются. Откат: revert patch, без отката БД. Graphify AST update: 13827 nodes/30990 edges, SQL extractor отсутствует; изучены create_bid -> _finalize_accept_inline -> bid_expiry.

Решение владельца: активный пользовательский груз/рейс доступен для предложений 30 дней от публикации без ручного обновления из-за старой даты маршрута. Не означает бесконечное продление или переписывание даты погрузки.

Причина: публичная выдача уже использовала 30 дней, но create/accept проверяли прошедшую дату маршрута, а expiry закрывал свежие ставки по этой дате.

Патч: create/accept проверяют published_at (fallback created_at) + 30 дней; очистка больше не истекает свежие ставки только по дате маршрута. 48h TTL ставок, статусы, ownership и атомарное принятие сохранены. Принятые сделки и прежние истёкшие ставки не воскрешаются.

Проверено: 116 passed в test_bid_route_date_guard, test_bid_expiry, test_bid_actions, test_p0_deal_bid_race, test_self_bid_and_webhook_guard, test_public_feed_search_filters; 148 предупреждений, преимущественно устаревший datetime.utcnow. Локальная отдельная SQLite /private/tmp/urtruck-listing30d-tests.db. git diff --check PASS.

NOT RUN: полный CI, deploy, реальное создание/принятие на QA2/iPhone/Android. До этого не считать сервер исправленным. После CI штатный QA2 deploy с backup/rollback и exact SHA, затем обе стороны проверяют старую дату погрузки с новой публикацией; отдельно >30d, закрытый/занятый, повторное принятие, TTL48h и недоступность чужих данных.
