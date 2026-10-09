# OneSignal QA2 — начальное подключение, 09.10.2026

Статус: PARTIAL; подключение платформ, бизнес-отправка и физическая приёмка НЕ завершены.

## PRE-FLIGHT

- Branch: feat/qa2-onesignal-pilot-20261009.
- Base: b6df64bc0cc751c2d99db9922f5f8e93876b71e2; production SHA UNKNOWN.
- Known-good: прежние push исправления сохранены в базе; общий физический PASS отсутствует.
- Scope: фиксированные SDK dependencies, QA2 конфигурация, минимальный SDK bootstrap.
- Protected: production provider/configuration, перевод, голос, флаги, FSM, GPS.
- Checks: AST-only Graphify (10728 nodes, 24315 edges; SQL/Gradle extraction incomplete),
  isolation tests, push regression tests, lint, production/QA2 resolved Expo configuration.
- Rollback: возврат к исходной ветке b6df64b; сервер/данные не изменены.

## Что подготовлено

- react-native-onesignal 5.5.14, onesignal-expo-plugin 2.7.2, точные lockfile versions.
- Пилот требует QA2, HTTPS qa2.urtruck.kz и явную отметку проверенных платформ.
- Отдельный iOS bundle com.urtruck.app.qa2 и scheme urtruckqa2 только для пилота.
- OneSignal plugin первым в списке; APNs production mode для device/TestFlight builds.
- OneSignal location отключён; существующая геолокация UrTruck сохранена.
- Production SDK autolinking отключён через react-native.config.js; это требует
  дополнительной проверки реального native dependency graph перед любой сборкой.
- Bootstrap не импортирует native SDK в web/обычной production конфигурации.
- В SDK НЕ передаются email, телефон, секретный API key или бизнес-идентификатор.

## Блокеры до первого кандидата

1. Владелец вошёл в OneSignal на локальном Mac. У ассистента нет этого browser session.
2. Проверить Android FCM credentials именно для com.urtruck.app.qa2.
3. Настроить отдельный QA2 iOS App ID, push capability/provisioning и APNs в OneSignal.
4. Проверить конфликт OneSignal с собственным UrTruckFirebaseMessagingService и Expo
   на собранном manifest: единственная доставка, без потери badge handler.
5. Backend adapter/outbox selection, проверенная привязка аккаунта, logout,
   dedup, foreground presentation, cold-start click, room-specific read cleanup
   ещё НЕ подключены. Текущий bootstrap — только база для теста SDK из кабинета.
6. До выполнения пунктов 2–5 не ставить URTRUCK_ONESIGNAL_PLATFORMS_READY=1,
   не собирать/устанавливать пилот и не объявлять миграцию завершённой.

## Приёмка

Оба направления между iPhone/Huawei/OPPO: foreground, background, lock,
process termination; banner/sound, unread/badge, точная комната, прочтение,
чужие уведомления сохранены, account switch, token rotation, offline retry.
Числа badge берутся с сервера UrTruck. Получение push не доказывает read.
Production остаётся на прежнем провайдере до отдельной приёмки и разрешения.

## Фактическая проверка исходников

- 5/5 isolation tests PASS.
- 13/13 целевых push regression tests PASS.
- Lint: 487 active JavaScript files PASS; git diff --check PASS.
- Production bundle/plugin/autolink configuration PASS на уровне JS config.
- Pilot bundle/plugin order/location exclusion PASS на уровне JS config.
- Native build/manifest, APNs/FCM console, backend integration и телефоны: PENDING.
- Секреты в код не добавлялись; production и QA2 серверы не изменены.
