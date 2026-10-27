# PRE-FLIGHT: пропускать все текстовые посты собственной Telegram-группы — 2026-10-27

- Branch/SHA: `fix/my-listings-retention-30d-20261027` / `04b88d40b3ece24fc139a62184c3ab9896879939`.
- Known-good: локальные owned collector/bridge contracts в `backend/tests/test_owned_telegram_feed.py`; последний доступный runtime-аудит указывает `incoming`, который исключает `UrTruck_obyavleniya`.
- Scope: `backend/services/owned_telegram_feed.py`, `backend/api/external_freight.py` и их backend-тесты. Не отправлять текстовые owned-посты в ручную проверку из-за неполного маршрута/контакта/типа; сохранять исходный текст и существующее сегментирование явно размеченных блоков. Неизвестный тип временно относить к `cargo`, так как API поддерживает только `cargo`/`vehicle`. API применяет это исключение только для точного source `UrTruck_obyavleniya` с проверенным Telegram source ID `4325478296`.
- PROTECTED: обычный внешний source allowlist, incoming/published bridges, пользовательская кнопка копирования контакта, Telegram-сообщения, QA2/Production конфигурация и базы.
- Риск: non-freight/неопределённые сообщения появятся в ленте грузов; для неизвестного направления фильтры `откуда/куда` не совпадут, однако оригинал останется доступен в описании. Закрывающие сообщения должны сохранить статус closed.
- Checks: owned parser/bridge tests, API importer contracts, локальный пример из открытой группы, Python compile и `git diff --check`.
- Rollback: вернуть только изменённый parser и его тест к этому исходному SHA; серверные данные/настройки не меняются.

## Результаты

Локально: 176 backend-тестов прошли (3 предупреждения сторонних библиотек/устаревшего datetime); пример поста с четырьмя направлениями дал 4 активные карточки, исходный текст сохранён; `py_compile` и `git diff --check` прошли. Копирование телефона в интерфейсе не менялось.

Серверные флаги/режим не включены: Desktop Commander quota = 0; доступный SSH отклоняет ключ. Поэтому публикации из Telegram в серверную ленту ещё не запущены.
