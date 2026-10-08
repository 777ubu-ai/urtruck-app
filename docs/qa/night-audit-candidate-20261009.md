# UrTruck — внутренний кандидат ночного аудита

## PRE-FLIGHT
- Причина одной новой native-сборки: исправления iPhone composer, STT/document reconciliation и полного справочника стран отсутствуют в установленном iPhone 91.
- Frozen app source SHA: 4d93962171c9ff2caff5e9f4327ea68595625530.
- Источник включает предыдущие сохранённые исправления #506/#507/#508.
- Установленный known-good: iPhone 1.0.9 (91), доставка и badge 3 подтверждены владельцем; Huawei 213640023, OPPO 213645294. Полная приёмка этих версий открыта.
- Рабочая ветка аудита сохраняется; отдельная build-ветка предназначена только для workflow с exact-SHA checkout.
- Build-ветка: build/ios-production-4d939621-20261009.
- Использован ранее успешно применённый workflow TestFlight (Actions 37789276686); изменены только frozen source, branch/concurrency и minimum build guard >91.
- Remote iOS buildNumber перед запуском: 91. production ios.autoIncrement=true; новая сборка должна быть >91, ожидается 92. Фактический номер взять из проверенного IPA manifest.
- CI runners стандартные GitHub-hosted; EAS build --local на macos-15. Платный EAS cloud build не запускается.
- Перед submit: проверка codesign, com.urtruck.app, version 1.0.9, build >91, host https://urtruck.kz, flavor production, source SHA; сохранить SHA-256 IPA и manifest.
- Назначение: TestFlight для внутренней проверки. Публичный App Store rollout не запускается.
- Откат: вернуться к предыдущему TestFlight build 91 при регрессии, не удаляя приложение/данные; production API в этой операции не меняется.
- Изолированная облачная QA: full-qa-audit.yml на pushed SHA рабочей ветки. Без выкладки сайта/API и без live production-сценариев.
- Запуск, результат и номер новой сборки будут добавлены ниже после получения фактических run IDs.

## Приёмка после установки
Рост 1→4 строк, прокрутка после 4, вставка/Enter/удаление/черновики, 249 стран и сохранение маршрута, настоящий RU↔ZH текст/голос, push/banner/sound/unread/badge/reset и scoped cleanup. Автоматический PASS не заменяет native-проверку.

## Дополнительный PRE-FLIGHT: серверная ТТН
- Причина: endpoint /api/v1/docs/ttn/{trip_id} реально зарегистрирован; POST подставляет 1500 и профиль caller вместо перевозчика, PDF теряет данные перевозчика/объём; неэкранированный текст попадает в HTML.
- Граница: действующих вызовов ТТН в src не найдено. Это дефект доступного API, не доказанная текущая поломка chat-attachments.
- Перед исправлением обновлён Graphify AST-only на b9e301bc; 4/6 целевых тестов воспроизвели ошибки, 2/6 прошли.
- Только backend/api/documents.py и его regressions; схема БД, роли, API-пути и CSS не меняются. Проверка доступа остаётся первой.
- Проверки: точные price/driver/volume/transit, HTML escaping, совпадение PDF/HTML, чужой пользователь, canonical backend runner.
- Откат: revert отдельного docs commit. Production не выкладывается и не перезапускается в этой операции; исходный native source SHA 4d939621 остаётся frozen.

## Фактические запуски и Android PRE-FLIGHT
- Full QA Actions 37845188843 на b9e301bc: SUCCESS, все 5 jobs (backend, desktop, mobile, Maestro contract, design/FSM/UX). Это до отдельного ТТН исправления.
- iOS Actions 37845195639: frozen app source 4d939621, сборка выполняется; результат и номер ещё не объявлены.
- ТТН patch a4e05b2060812271b0110933e1b34eecacf338e4: 7/7 regressions PASS, повторный изолированный canonical backend runner (130 модулей) PASS.
- Причина одной новой Android-сборки: полный справочник и reconciliation пока не входят в установленные 213640023/213645294.
- Android frozen source a4e05b2060812271b0110933e1b34eecacf338e4 (native/client файлы совпадают с 4d939621).
- Build-ветка build/android-production-a4e05b20-20261009: прежний проверенный deploy-play workflow с exact-SHA checkout/guard, minimum versionCode >213645294; вместо отправки комментария в issue #247 — отчёт в Actions summary.
- Только Google Play Internal Testing, status completed на internal. Публичный track production не запускается. build_installable_apk=false: одна AAB-сборка, без лишней повторной сборки APK.
- Перед upload: release Kotlin tests, проверка единственного FCM handler, Firebase resources, com.urtruck.app, versionCode, checksum и upload certificate. На телефоны пока не установлено.
- Старые APK не скачиваются повторно; новый Google-signed APK скачивать однократно только при необходимости физической установки.
- Резервный путь: предыдущий внутренний кандидат 213645294; Android данные/аккаунты не удалять. API deployment не выполняется.

- Android workflow Actions 37846232177, workflow head e922dee4a73e1ae341d97575152d414292c1dd4f; exact source a4e05b20. Выполняется, номер и upload пока не объявлены.
- iOS workflow head c41dd52456ed8af911195ed6a499be999576d971; Actions 37845195639. Выполняется, source 4d939621. Никакой повторный запуск этих двух builds не выполнен.

## PRE-FLIGHT: найден отсутствующий AX
- На 12b2d4bc exhaustive проверка без Intl.DisplayNames дала 248 вместо 249. Ранее tests принимали >=248 или сравнивали два одинаково неполных набора; прежние отчёты с числом 249 были неточны.
- Отсутствует AX (Åland Islands), код подтверждён ISO: https://www.iso.org/iso/newsletter_v-9_aland_islands.pdf. SVG AX уже входит в country-flag-icons.
- Graphify AST-only обновлён до изменения countries.js. Scope: один ISO-код, четыре bundled names, строгий count и all-language search/fallback regressions. Дизайн и размеры CountryFlag не меняются.
- Прежние iOS 37845195639 / Android 37846232177 остановлены до завершения, поскольку frozen source содержит только 248 кодов. Проверить окончательный cancelled и skipped submit перед следующими запусками.
- EAS remote buildNumber теперь 92 (зарезервирован отменяемой сборкой). Следующий свободный номер ожидается 93; guard должен быть >92. Не переиспользовать 91/92.
- Rollback: revert отдельного AX commit. Backend и production runtime в этой правке не меняются.

## PRE-FLIGHT: чтение и новое сообщение
- Baseline: 159cae9a, мобильный frozen source f241f855. Graphify AST-only обновлён перед изменением chat/notifications.
- Изолированная БД воспроизвела 3 FAIL при 25 PASS: сообщение между SELECT/UPDATE потеряло unread; поздний Bell event прочитан до показа; пагинация старой страницы читала более новые строки.
- Scope: ограничить read-marking границей возвращённых message IDs и снимком notification IDs, сохранив room/user guards и прежний API-путь. Современные chat event keys также ограничить по message ID; legacy events ограничить снимком notification IDs.
- Никаких миграций, новых credentials или production writes. Обновление API в этой операции не выполняется.
- Мобильный код не меняется; текущие iOS/Android f241f855 builds не пересобирать из-за отдельного backend исправления.
- Проверки: реальные SQLite гонки, страница истории, notification URL/user isolation, canonical backend suite. Откат: revert отдельного race commit.

## Промежуточные frozen кандидаты f241f855
- Общий app source: f241f8557c6e695208758d809718f949b163be65 (включает #506/#507/#508, composer, STT/document readiness, настоящий полный 249-каталог).
- iOS build-ветка build/ios-production-f241f855-20261009; workflow SHA 5cc2f36eb35a5b6b279388d36dc873f8308da419; Actions 37847554527, guard >92, ожидается 93.
- Android build-ветка build/android-production-f241f855-20261009; workflow SHA 7ada9d933d61cfb933b348741d8509a6d860711e; Actions 37847561121, только internal, один AAB.
- Первые 37845195639 / 37846232177 — окончательно cancelled; Submit IPA / Upload to Google Play — skipped. Ничего из неполного каталога не загружено в магазины.
- Повторные frontend 1108/1108, target страны 11/11, QA Center/lint/i18n PASS; E2E 23/23 и locale 8/8 после AX; Full QA 37847548191 SUCCESS.
- Backend 08f1d467 не меняет mobile файлы f241f855. Повторный canonical backend 130 модулей PASS. Read-only production patch plan 08c9dbb3: 4/4 safety; две кандидатные API-копии compile-only проверены production Python 3.12.3, runtime не изменялся.
- Следующее изменение production возможно только с отдельным разрешением по разделам 2/14 ночного ТЗ. Старые AI/APNs backups/source/env не тронуты.


### Preflight: stale badge результата BottomNav
Подтверждённый кодовый путь: appBadge возвращает {badge: OLD, reason: superseded}, а оба callback BottomNav проверяют только Number.isFinite и принимают OLD. Scope: только effects счётчика BottomNav и meaningful tests настоящих callback bodies. Защищены appBadge canonical/OEM contract, Android native handler, дизайн/tab labels, страны, composer, SDK/lockfiles и production. До patch: Graphify AST и воспроизведение stale response; после: runtime cases для poll/read, native rejection, notification callback и cleanup, frontend/lint/QA gates и final CI. Rollback — адресный revert нового коммита; промежуточные f241 native кандидаты не считаются покрытием этого fix. Публичный выпуск запрещён.


## Frozen 0449116f после BottomNav race
- Source 0449116f88f59538310db46829957f96bd26e09d: ancestry #506/#507/84eb4eba PASS, frontend 1114/1114, lint/QA Center/web build/i18n/APNs safety PASS, 23/23 local E2E (69.61 с), locale 8/8, static release gate PASS. Full QA 37851244139 SUCCESS, пять jobs.
- До fix 4/6 callback regressions FAIL; после — 14/14 с appBadge runtime. Дизайн и canonical/OEM contract не менялись. Причина следующего build — воспроизведённый N-19, который не входит в промежуточные 93/213658419.
- iOS branch build/ios-production-0449116f-20261009, workflow 5433e7e7227adade694ef00ccca1aa7ef08485fa, Actions 37851771645, guard build >93, ожидается 94. Новый guard aps-environment=production / application-identifier проверяется перед TestFlight submit.
- Android branch build/android-production-0449116f-20261009, workflow cbce14aeed2b31d703a31bcfc10bb6cc0474df0e, Actions 37851776201, min version >213658419. Только internal/completed, один AAB, download job skipped в build-режиме; issue-comment заменён summary, issues:write убрано.
- Промежуточные source f241f855 builds SUCCESS: iOS 93, Android 213658419; не устанавливать их как финальный coverage N-19. Все native runs остаются internal, production API не менялся.
