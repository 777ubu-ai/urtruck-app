# Production Android 1.0.12 — PRE-FLIGHT

- Branch: `fix/play-production-1.0.12-20261026`; base `4a2000526e5b89c4fa93fd053ac0d4f21ece05c7` (PR607); application source PR605 `dc982a291c5f0190612710b20da2be925bd5aa91`.
- Known-good: владелец подтвердил тестовый 1.0.12; опубликованный Android 1.0.9 / 215024884, Internal 1.0.12 / 215090227 наблюдались в Play Console 26.10.2026. Собственный физический PASS production-кандидата отсутствует. Production runtime SHA UNKNOWN.
- Scope: только deploy-play.yml, тест счётчика и этот журнал. Production API https://urtruck.kz, feed=true, beta=false, package com.urtruck.app, versionName 1.0.12. versionCode = свежий проверенный максимум Play + 1.
- Protected: чаты, голос, перевод, push, авторизация, FSM, карта/GPS, документы, серверы и постоянная база 1324 контактов не изменяются.
- Checks: исполнение извлечённого shell-кода счётчика для Internal и production, некорректные/граничные значения; существующие release guards. На точном итоговом SHA обязательны backend, frontend/lint/build и web E2E. Перед отправкой проверяются встроенные API/source/feed/version, Firebase runtime, подпись, 16 KB alignment и отсутствие background-location permissions.
- Rollback: до публикации отменить draft/кандидата, оставить текущую 1.0.9. После публичного выпуска исправление требует нового versionCode; downgrade бинарника пользователям не обещается. Сервер и данные не меняются.
- Authorization: владелец явно разрешил публичный выпуск App Store и Google Play в текущем диалоге. Независимый второй GitHub-аккаунт повторно не требуется по явному указанию владельца.
- Локально: 41/41 адресных release-проверок PASS до коммита. Полный CI и магазинная загрузка на момент подготовки не выполнены; не выдаются за PASS.
