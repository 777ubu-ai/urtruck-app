# Своя Telegram-лента и восстановление Share — PRE-FLIGHT

Дата: 25.10.2026, Алматы.

- Branch: `fix/owned-telegram-feed-share-20261025`.
- Base/HEAD до изменений: `f00dc56251f4ae1049b89894baea7a09c184751c`, PR600. Совместимые native/Auth/GPS/PDF конфигурации release110 сохранены.
- Интеграция сборщика: PR573 `f0b87f54bf514af950ad9d0f9d3cfa36db48e4f5`; конфликтующие более старые parser/classifier и зависимости не заменяют защиту release-базы. Проверки parser expansion выполняются явно.
- Known-good: CI3/3 f00 и f0 подтверждены в GitHub; iOS Simulator f00 исторически PASS. Физический Share на снимке владельца отсутствует; версия устройства UNKNOWN. Полный production SHA UNKNOWN; overlay a17168e2 исторический.
- Scope: внешняя лента/Share/public-origin, обработка собственного Telegram-чата, соответствующие parser/bridge/collector tests; без изменения Auth/навигации/Chat/Deals/GPS/PDF/store metadata.
- Разрешение: пользователь явно поручил реализовать импорт постов участников своего чата, свой Telegram-переход, Share и действие скачивания приложения; актуальная ссылка `@UrTruck_obyavleniya`. Изменение публикации/импорта в QA2 допустимо; production/store/new spend отдельно не разрешены.
- Риск: смешение исходной группы и своего получателя, дубли/петля, общие контакты/цена составных постов, зависимость видимости Share от EAS metadata, неправильно растущий build counter. Сохранить текущие API/роли/закладки/каталог.
- Checks: Graphify AST-only; runtime env/React callback tests; parser/collector/bridge isolation/replay/restart tests; backend regression, frontend full unit/lint/web; exact-HEAD CI; физическая приёмка отдельно.
- Rollback: revert узких изменений в новой ветке; без отката баз/очередей, без изменения существующих веток. Никаких production writers и автоматической публикации сборок.
- Environment blocker: Desktop Commander сообщил месячный лимит и запрет повторных вызовов; Telegram live entity/session, сервер и физические телефоны через Mac пока недоступны. Код/тесты выполняются локально, runtime-доказательства не имитируются.

## Результаты

- Graphify AST-only: 14610 узлов/30477 связей; для env/model/bridge найдены58 связанных узлов/258 граничных связей. SQL grammar отсутствует; SQL выводы проверены исходниками/тестами. Generated graph не коммитится.
- Root cause Share воспроизведён: native config содержит `urtruckApiUrl`, но нет EAS profile/EXPO_PUBLIC_WEB_URL; PUBLIC_WEB_ORIGIN пуст и helper скрывает кнопку. Новый тест FAIL до исправления, PASS после. Resolver использует только существующий allow-list публичных доменов, API endpoint не меняется.
- Полный frontend/unit:1532 PASS; lint585 JS PASS; web export/finalize PASS.
- Полный адресный набор внешней ленты, собственного потока, parser/collector/bridge/API:270 PASS на окончательном прикладном коде. После защиты переключения режимов отдельно47 PASS. Python compile и diff-check PASS.
- Общая backend-регрессия пока НЕ PASS: первый canonical run остановился на тестовом повреждении SQLite schema в `test_bid_actions`. Тот же модуль отдельно:40 PASS на basef00 и40 PASS на кандидате. Повтор выполняется последовательно на отдельных тестовых базах; ошибка не объявлена регрессией приложения или исправленной без доказательства.
- Chromium install BLOCKED: скачанный архив повреждён (`End of central directory record signature not found`); браузерные геометрия/визуальный прогон и обновлённый E2E не выполнены. React callbacks обеих ролей проверены unit-runtime тестами; это не замена браузеру/телефону.
- Native конфигурация/SDK/зависимости/app metadata/Auth/Chat/Deals/GPS/PDF не изменены относительно f00. Номер новой сборки не выбирался без сверки ASC/Play/EAS; новый APK/IPA не создавался.

## Реализованное поведение

Существующая единственная Telethon-сессия может принимать события/правки и ограниченный catch-up `@UrTruck_obyavleniya`, в том числе от участников. Собственные посты никогда не добавляются в Telegram publisher queue; свои получатели исключены из сторонних источников. Долгий collect работает одной отдельной asyncio task; shutdown отменяет/дожидается её до закрытия SQLite.

Режим bridge `owned` выбирает только свой источник, разделяет подготовленные составные посты, сохраняет общий телефон и локальный приоритет, не переносит цену между блоками. Неполные/неоднозначные заявки остаются review. Старые режимы не переключаются автоматически. Incoming не читает staged own-посты до переключения.

UI открывает только подтверждённую по данным карточки ссылку на пост в своих `@UrTruck_obyavleniya`/`@UrTruck_UT`; сторонние source-ссылки скрыты, provenance не удалён. Это действие отдельно от Share.

В своём чате бот отвечает на новые подходящие посты сообщением «Скачать UrTruck» и двумя URL-кнопками магазинов. Чужое сообщение не редактируется. Без bot token/двух явных enable flags отправки нет. Ответы durable/dedup; неизвестный исход не пересылается повторно,429 сохраняет pending и общий retry_after. Неопределённые sending/uncertain после сбоя требуют сверки, автоматическая слепая повторная отправка запрещена.

## Установка в QA2 — ещё не выполнена

1. Через существующую сессию подтвердить exact entity `@UrTruck_obyavleniya`, marked ID, тип чата и право чтения; не подменять каналомUT. Подтвердить bot membership/право ответов и факт, что показанный владельцем поток относится к этой группе.
2. Снять backup кода/env/collector/adapter и хеши; не откатывать/не удалять текущие базы. Установить проверенный collector и backend service-файлы через действующий процесс.
3. Для collector включить `OWNED_FEED_ENABLED=true`. По умолчанию оба новых флага false. Убедиться, что новые собственные сообщения появляются вapp_messages и не вpublisherqueue. Старыйincoming пока исключает этот stagedпоток.
4. Для того же единственного bridge выбрать `EXTERNAL_FREIGHT_SOURCE_MODE=owned` и отдельный новый `EXTERNAL_FREIGHT_ADAPTER_DB` в прежнем допустимом QA2 state root. Старыйoutbox сохранить; worker запрещает переиспользовать state с чужими payload, не удаляя их. Не запускать одновременно старый/новый bridge. Старые активные карточки сами не удаляются; отдельно оценить cutover/TTL и дубли по реальным данным перед включением.
5. После проверки бота включить `OWNED_TELEGRAM_CTA_ENABLED=true` вcollector secret env, используя существующийTELEGRAM_BOT_TOKEN. Проверить один новый пост и один ответ с обеими кнопками; затем свежий груз/машину и изменение поста через API/телефон. Не публиковать тестовые фикстуры как реальные заявки.
6. Собрать один согласованный кандидат после CI/review. Физически проверить обе роли, Share/open/cancel, свойTelegram, копирование/звонок, сохранённые/фильтры/фон. Production/store отдельно.

## Открыто

Live Telegram/QA2/server/бот права, физический iPhone/Android, финальный CI и независимое review пока не подтверждены. Отправка/звонки с пользовательских телефонов не выполнялись. Статус PARTIAL, не release-ready.
