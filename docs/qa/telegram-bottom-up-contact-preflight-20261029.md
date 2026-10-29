# PRE-FLIGHT: телефоны в длинных постах Telegram

- Branch/SHA: `fix/telegram-bottom-up-contact-carry-20261029`, исходный рабочий HEAD `c2230e8467cd1576328a557946b3637da4a61f8b`; перед PR обновлён поверх актуальной QA2 candidate базы `6aa6badf3ddfd8d124268c8cecf7c5e202c0baca`.
- Production SHA: UNKNOWN; этот запрос ограничен внутренним QA2.
- Known-good: QA2 feed path работает на PR633 (`7ea87e572726ff0f5cb77a7965ae920fda01a1f7`); PR643 также находится в свежей QA2 candidate ветке `6aa6badf3ddfd8d124268c8cecf7c5e202c0baca`. QA2 API `1.0.50`; `urtruck-qa2.service`, Telegram collector и feed bridge active/success, collector `NRestarts=0`. Runtime module hashes до патча совпадают с deployed parser/classifier/adapter из release evidence; `owned_telegram_feed.py` hash `7dc1946dca3092706892b6caf05c89a6aae78988ccefc3f12aac281a40ee54e9`.
- Scope: ожидаемо только `backend/services/owned_telegram_feed.py`, `backend/services/external_freight_parser.py` при подтверждении причины, точечные parser/bridge tests и этот QA evidence. Защищены collector intake, Telegram publisher, API contracts, БД/очереди, UI, iOS/Android, production и сторонние источники.
- Graphify: не требуется — не меняются навигация, `FeedScreen`, i18n, backend registration, database logic, chat, attachments.
- Checks: regression tests для общего телефона из хвоста длинного поста, локального контакта внутри другого блока, сохранения полного source text и исключения welcome/rules; parser/owned bridge tests, syntax/diff checks, обязательные PR CI; после QA2 deploy проверить source marker, модульные хэши, API health, count/контакты и недавние импорты. Физические устройства не обязательны для server-side parser patch.
- Риск: неосторожный перенос контакта может приписать телефон соседнему объявлению; правило остаётся только для однозначного общего footer одного source post и никогда не переопределяет контакт, найденный внутри блока. Исключение промо/правил действует для собственного канала и должно пропускать реальные freight объявления с промо-хвостами.
- Rollback: штатный QA2 PR revert/deploy точного родителя, не очищая очередь и не удаляя карточки; резервировать текущие файлы/конфигурацию перед deploy. Данные не мигрируются.
- Предположение: длинный список грузов в скриншотах — это одно исходное Telegram-сообщение с контактами в footer; будем проверять по runtime source до изменения.

## Проверка источника и исправление

- Read-only снимок QA2 source `feed.sqlite3`: один недавний пост дал 2 сегмента, телефон был только во втором; другой длинный пост дал 4 сегмента без распознанного номера. Сырые номера/тексты в журнал не сохранялись.
- Исправление сначала собирает контактный контекст полного поста, затем распределяет один однозначный номер по маршрутным карточкам. Несколько разных номеров остаются привязаны к исходным блокам; отдельные нумерованные заявки сохраняют прежнее локальное поведение. Telegram entity metadata не превращается в пользовательский контакт.
- Welcome/rules группы теперь распознаются как административный пост (`group_administration`) и закрываются, а не проходят принудительно как активный груз.
- Локальные проверки: 270 parser/owned-feed/queue-bridge/regression тестов PASS; ручные smoke: 6/6 PASS; `compileall` и `git diff --check` PASS. Полный PR quality gate остаётся обязательным.
