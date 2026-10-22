# Внешняя лента: продолжение 21.10.2026

PRE-FLIGHT: feat/external-freight-feed-20261020, base eed2199c7931bdc58ce902c6fa44b055c77d7243. Production SHA UNKNOWN. Предыдущий CI относится только к base; физического PASS новой функции нет. Существующий dirty implementation-checkpoint.md сохранён.

Scope: external_freight API/DAL/adapter/classifier/tests, ExternalFreightFeedScreen/API, RootHeader и два opt-in вызова существующих экранов. Защищены Auth, GPS, Push, FSM, Chat, Documents, Expenses, production и рабочий Telegram publisher.

Graphify AST-only 21.10: 11989 nodes, 26952 edges; вывод вынесен в /private/tmp. Риски: shared get_conn, owner isolation, устаревшие async ответы, TTL/скрытые контакты, outbox ACK гонка. Проверки: целевые backend, модель/навигация, lint/build; затем QA runtime/телефоны при доступности. Rollback: отдельные коммиты откатить обычным revert после проверки зависимостей; флаг выключить. Новые bookmark-таблицы не удалять и старую БД поверх пользовательских данных не восстанавливать.

Статус: IN PROGRESS. Это журнал выполнения, не приёмка и не разрешение production.

## Реализовано

- Серверные личные закладки: явные PUT/DELETE, unique(owner,item), роли cargo/vehicle, saved_only и saved в ответе страницы. Выборка отметок ограничена текущей страницей, не всем архивом пользователя.
- Повторное сохранение/снятие идемпотентно. Просроченное и закрытое сохраняется в личном списке без продления исходного TTL. Hidden/review выдаёт только обезличенную tombstone; get/translate скрытого недоступны.
- В карточке переиспользован существующий BookmarkButton. В шапке «Сохранённые», пять фильтров сохранены. Отмена запросов при уходе и fencing аккаунта, включая смену токена во время его асинхронного чтения.
- Outbox: generation fence для ACK и backoff, single-flight межпроцессный flock. enqueue не блокируется. Классификатор «нужен груз» исправлен. RootHeader opt-in включён только CargoFeedScreen/FeedScreen.
- QA2 build identity: 214494459 > 214494458; production metadata не менялась.

## Проверки и границы доказательств

- Первоначальный полный pytest: 1467 PASS / 2 FAIL в test_publish_time. Эти же два FAIL воспроизвелись в архиве исходного eed2199c. Тест искал только первую страницу; общая synthetic БД содержала сотни записей. Исправлен только тест: обход next_offset без show_demo/обхода публичных фильтров.
- После исправления теста полный backend pytest: 1469 PASS, 4 subtests PASS. Финальная оптимизация выборки bookmarks затем проверена целевым набором external_freight + publish_time: 28 PASS. Последний полный запуск CI ещё требуется.
- Frontend полный suite: 1427 PASS до добавления четырёх новых API/entry unit tests. Новые четыре и пять model tests: 9/9 PASS. Не складывать пересекающиеся запуски как уникальное покрытие.
- QA2 build contract после нового versionCode: 12/12 PASS.
- Lint: 561 JS parsed PASS. i18n общий smoke: 2048 ключей на язык, missing 0. Локальный SAVED_COPY содержит RU/KK/ZH/EN, это не физическая языковая приёмка.
- Web export QA2 с флагом true PASS. Первый вызов без URTRUCK_BUILD_FLAVOR=qa2 корректно был отклонён production guard; конфигурация защиты не ослаблялась.
- Playwright React UI на loopback, только synthetic API: 3/3 PASS (driver/client save → reopen → saved-only → unsave; отказ сохранения и повтор). Первые падения были неверным ожиданием aria-selected для button и неоднозначным toast locator; исправлены проверки, не общий BookmarkButton/Toast.
- Скриншоты test-results/external-feed-driver-saved.png и external-feed-client-saved.png — WEB SYNTHETIC, не телефон. Просмотрено: bookmark виден, заголовок помещается при 390 px, фильтры горизонтально прокручиваются. Физический large-font/dark QA не выполнен.

## Очередь и окружения

Read-only SQLite backup работающего агента выполнен штатным backup API, quick_check=ok. Копия с правами 0600 находится ВНЕ git: /private/tmp/urtruck-feed-private-20261021/feed.sqlite3. Рабочий urtruck-telegram-feed.service active; его файлы/статусы не менялись. В копии: published 876, queued 27, expired 70, rejected 8. Классификатор на последних 50 selected: cargo active 27, vehicle active 2, review 21. Это оценка классификации, НЕ доказательство правильного структурирования/контактов/импорта. Сырые тексты/телефоны/БД в GitHub не передавать.

QA2 Environment допускает только перечисленные ветки, в частности qa2/integration-candidate; feat/external-freight-feed-20261020 отсутствует. Правила не менялись, обход через SSH deploy не выполнялся. Нужен штатный reviewed promotion кандидата в разрешённую QA-ветку, затем workflow/backup/deploy и QA-only feature enable.

Xiaomi BUA6JB99T465Q49X доступен ADB; iPhone Bah (2) Offline. Нового APK с закладками пока нет и на телефоне он не проверен. Предыдущий build 39548388379 завершился SUCCESS на eed2199c, но закладок в нём нет.

## Итог

PARTIAL: код и локальная приёмка закладок готовы, полный QA-пилот нет. Не выполнены review additive schema, финальный CI/SHA APK, штатный QA2 deploy, реальная интеграция адаптера с агентом, живой перевод и физическая приёмка Android/iPhone. Production, публичные каналы и действующий Telegram publisher не затронуты. Исходный dirty implementation-checkpoint.md не включать в commit автоматически.

## Дополнение: физическая и импортная проверка, 21.10.2026

- Последний код ветки реализации: `a75be5be4dba955a0b9c76ba25ef7540364450b3`. Добавлено консервативное распознавание фраз «требуются машины», «нужны машины», «груз:»; регрессия покрыта тестом.
- Локальный target backend suite после правки: **25 passed**, 2 deprecation warnings, временная тестовая SQLite. Полный PR Quality Gate для SHA `a75be5be` выполняется в run `39565311820`; promotion PR #568 — draft, quality gate run `39565822499` pending. Это ещё не PASS CI.
- На read-only копии очереди агента сгенерированы 18 свежих выбранных записей (текст и контакты не выводились). В отдельной SQLite поднимался настоящий API/importer и отдельный durable outbox; повторная постановка дала 0 новых задач, первая отправка доставила 18, replay изменённого исходника не создал вторую строку. Все 18 остались `review`, активных карточек 0: адаптер не извлекает надёжно маршруты и цены, поэтому публикация не разрешалась. Живой Telegram service и оригинальная копия не изменялись.
- Xiaomi `25078RA3EY`, ADB serial `BUA6JB99T465Q49X`: установлен `com.urtruck.app.qa2`, `1.0.9-qa2`, versionCode `214494459`; пакет обновлён поверх ранее установленного с сохранением данных. Это APK из run `39554220190`, исходный SHA `0759d4a6`; последующий commit `a75be5be` содержит только backend classifier/test изменения, мобильный код не менялся. iPhone всё ещё недоступен.
- Текущая сессия Xiaomi — грузоотправитель (экран «Мои грузы»), выход/переключение роли не выполнялись. Физически открыта кнопка «Лента машин», экран фильтров и фильтры «Откуда»/«Дата». Карточки, закладки, детали, контакты, перевод и фильтрация по данным заблокированы: QA2 `GET /api/v1/external-freight` возвращает **404**, `/api/version` сообщает только `1.0.50` без SHA.
- Реальные снимки: `qa-evidence/external-freight-feed-20261020/physical/android/03-machines.png`, `04-feed.png`, `05-origin-filter.png`, `06-date-filter.png`. Скрин `04-feed.png` показывает штатное состояние «Сервис ленты временно недоступен», а не успешную выдачу.
- Для проверенного продвижения создан draft PR [#568](https://github.com/777ubu-ai/urtruck-app/pull/568) в `qa2/integration-candidate`, head `99f4060c7d27b9c7954b1590d4ff88c59740698b`, base `64cdf1c25f1fec723c7db242da630d2270f05940`. Ветка содержит только код/API/экраны/тесты/QA build opt-in внешней ленты и classifier fix; несвязанный `backend/tests/test_publish_time.py` исключён. PR пока не прошёл обязательный review; QA2 deploy не выполнялся.

**Итог остаётся PARTIAL/BLOCKED.** Следующий gate: завершить CI и обязательный review PR #568; после merge — штатный QA2 deploy с `DEPLOY_QA2`, проверка новых endpoint и отдельное включение QA feature flag. Затем можно проверять выдачу/закладки/перевод на Xiaomi; физическая роль водителя и iPhone требуют отдельной доступной сессии/устройства. Production и store release не выполнялись.
