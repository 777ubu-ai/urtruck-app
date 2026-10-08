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
