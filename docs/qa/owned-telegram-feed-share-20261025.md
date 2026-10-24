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

## PRE-FLIGHT review fixes — 25.10.2026

Branch `fix/owned-telegram-feed-share-20261025`, starting SHA `99bb4973a8b3afcf648fd14778c64c721d522a44`. Exact-SHA CI3/3 PASS; this is not runtime/device proof. Independent review found common closure prefix loss, contact-blind owned dedup, stale dedup after edits, offline edit recovery gap, ambiguous multiple unload labels. Scope: own parser/bridge/collector and their tests only; legacy intake and all unrelated modules protected. Graphify refreshed:14664nodes30612edges. Checks: failing regressions then targeted suites and independent re-review/exact-head CI. Rollback: revert new narrow commit, preserve all state/data and flags. No production/store writes.

Live Telegram: verified own group `@UrTruck_obyavleniya` ID -1004325478296, linked channel `@UrTruck_UT` ID -1003711161303. Bot `@UrTruck_UT_bot` ID8756237748 is channel administrator but group membership is left. Existing pinned channelpost47 now has Android/iPhone URL buttons (Telegram edit success, message/chat/markup verified); no group replies enabled.

### Focused read-only QA2 audit PRE-FLIGHT

Starting99bb, same branch. Add `.github/workflows/qa2-owned-feed-readonly-audit.yml` and `scripts/qa/audit_owned_feed_runtime.py` to inspect actual collector/bridge flags, code hashes and aggregate counts through existing QA2 SSH credentials. Dispatch-only, exact source SHA and SSH host-key guards; no remote files, business data, configuration or service writes. Never output secrets/text/phones. Rollback: remove this unused manual workflow/script. Checks: Python compile, YAML parse, independent review; remote execution requires authenticated Actions dispatch. Existing full backend deploy is deliberately not used for this scope.

### Review fixes validation

Five primary regressions reproduced FAIL before fixes; owned tests now21PASS. Full external suite275PASS before final concurrency guard, then owned/bridge/collector56PASS including seed/query interleaving and malformed duplicate owner. Missing get_messages entries do not delete cards; bad response IDs do not advance reconciliation cursor. A current owner fingerprint is rechecked before duplicate ACK. Legacy parser revision/fingerprint behavior preserved. Independent re-review pending final commit.

Parallel PR603 (`5990c00b`) is draft/CI failure and removes the Telegram action; not merged into this candidate. Read current Play workflow evidence: run40112977456 successfully uploaded production AAB code215024884 on24.10; it uses different older sourceb7c5bcc2, not this candidate, and is not a live Play API maximum query. No counter is reserved/reset.

### QA2 APK identity PRE-FLIGHT

Verified latest successful QA2 APK run40099399525/job120888255255, source54cbecad: packagecom.urtruck.app.qa2, versionName1.0.9-qa2, code214494471, certfac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, apk7a1afb6c9554f0478e1e70601f8caf237bf41cae53d7ea66e867b3a01514b000. Scope: QA2-only build metadata/workflow/contract test; prepare next code214494472 and owner-requested marketing1.0.12-qa2, preserving production/iOS configs. Check runtime-generated config and workflow contract. Rollback revert QA2-only metadata; do not reuse code if an artifact is actually distributed. No build dispatched or store publish performed yet.

Audit execution adjustment: GitHub requires a registered/default-branch workflow path for workflow_dispatch. Instead of adding an unusable new path, the existing registered `qa2-server-readonly-audit.yml` gains a separate branch-gated owned-feed read-only job. Original capacity audit job remains intact, restricted to its original voice branch; no general deploy is used. Owned job accepts only current owned-feed branch onmanualdispatch and exactmatching sourceSHA. New standalone audit workflow removed before commit.

Registration check correction: read of main confirmed `qa2-server-readonly-audit.yml` is absent (404); no action dispatch attempted. Read of main confirmed `build-android-apk.yml` exists. Audit is therefore prepared as an explicit `operation=read_only_audit` in that existing QA2 build workflow, with APK job skipped. Default `apk` mode preserves prior build behavior; invalid operation runs neither job. Owned audit retains exact branch/SHA/host-key gates. Original readonly audit workflow restored byte-for-byte. This adds no automatic deploy/credentials workaround: authenticated Actions dispatch remains required.

### Final reviewed candidate

Independent business review APPROVE:21ownedPASS; additional owner edit→closed/contact-change/review interleaves retain the valid new post. Audit privacy review on synthetic databases: aggregate values correct, both database hashes unchanged, marker secrets/PII absent. Final workflow path is `build-android-apk.yml`, operationread_only_audit, source_refexactSHA; mainGET200 verified. Original separate server-audit file unchanged. Local18build/auditcontractsPASS;56owned/bridge/collectorPASS; Pythoncompile/diffcheckPASS. Exact final GitHub CI still required after commit. Production/native/iOS metadata unchanged; only QA2 identity prepared. Runtime flags remain disabled until server evidence and controlled activation.
