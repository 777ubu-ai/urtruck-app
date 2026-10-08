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
