# Повторная доставка counter accept

QA-ветка, база db4493d6. F06: accept_counter теперь сохраняет push_outbox и in-app notification обеих сторон в транзакции сделки. Стабильный event_key, уникальность recipient/event. Inline send после commit использует тот же ключ. Worker повторяет сохранённый payload. Сбой provider не отменяет сделку; сбой записи второй outbox строки откатывает целую транзакцию. Сумма по-прежнему active counter_amount.

12/12 tests/test_durable_event_delivery.py PASS в изолированной БД: новый сценарий process/inline failure, worker retry обеих сторон, дубликат accept 409, rollback при storage failure. Existing native default не менялся. Provider в этом harness — явно Expo fake; настоящий FCM этим прогоном не доказан. Протокол at-least-once: crash между фактической отправкой FCM и записью delivery log по-прежнему может дать транспортный дубль. Exactly-once на телефоне не заявляется.

Evidence: /private/tmp/urtruck-security-20260916-i3Bkql/push-final.log. Production не изменён.
