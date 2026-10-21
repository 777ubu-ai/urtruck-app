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

## Исправление фильтров направления по фото владельца, 21.10.2026

PRE-FLIGHT: feature branch HEAD a75be5be4dba955a0b9c76ba25ef7540364450b3. Существующие dirty checkpoint и qa-evidence сохранены. Scope только ExternalFreightFeedScreen, чистая externalFreightModel и связанные тесты; общий LocationPickerModal/география/GPS/backend не менялись. Rollback — revert отдельного UI-коммита.

Убран промежуточный нижний диалог «Откуда/Куда» с полем, не защищённым от перекрытия native-клавиатурой. Оба фильтра сразу открывают существующий полноэкранный LocationPickerModal с поиском вверху, подсказками и showGeo=false. Выбор countryOnly передаёт только ISO country, без ошибочного city='Китай'; чип показывает название страны. Для пользовательского города с неизвестной страной XX код страны не добавляется в query.

Проверки: model 7/7 PASS, lint 561 JS PASS, QA web export PASS, React loopback E2E 4/4 PASS (два сценария ролей, retry закладки, непосредственный поиск и запросы CN country-only / Ташкент UZ). Native-клавиатура Xiaomi/iOS на исправленном бинарнике пока не проверена.

Установленный APK 214494459 из 0759d4a6 этой UI-правки не содержит. Нужна новая сборка после объединения остальных согласованных UI-замечаний; старую не засчитывать. PR568 integration SHA 701354cdecb25721d5dc617084702d75804ebcff уже имеет 3/3 CI SUCCESS; туда нужно включить новый UI-коммит штатным переносом с сохранением classifier fix. Продвижение/deploy в этой правке не выполнялись.
