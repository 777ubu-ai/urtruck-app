# UrTruck — финальный аудит 10/10

- Дата: 2026-08-15
- Ветка: `codex/yandex-maps`
- Исходный commit: `3387029fb01c2e305ecbe083aacf086bf4327a4c`
- База: `510bdc394265b2520d989ca7ab566e8d0157df0a` (`origin/main` merge-base)
- Итоговый статус: **NOT READY**

## Исправленные дефекты

1. **Product bug / privacy:** приложение начинало GPS-трекинг уже в
   `accepted`. Теперь список активных GPS-сделок начинается строго с
   `in_progress`; серверный `POST /market/deals/{id}/location` также
   возвращает `409` до старта рейса. Добавлены регрессии на запрет до
   старта и разрешение после старта.
2. **Product bug / embedded navigation:** экран live-GPS выводил пользователя
   в Apple/Google Maps через `Linking.openURL`. Внешний переход удалён;
   координаты остаются на встроенной карте. Добавлена регрессия
   `tests/frontend/test_track_truck_embedded_map.mjs`.
3. **Test bug:** Maestro flow водителя ожидал удалённые вкладки `Chats` и
   `Profile`, поэтому не соответствовал текущему UI (`Feed`, `MyWork`,
   `Queue`, `Deals`). Flow обновлён и проверяет актуальные testID; в shared
   login-flow убрана устаревшая инструкция про logout через несуществующую
   вкладку.
4. **Native dependency drift:** `ios/Podfile.lock` не содержал фактически
   используемые Expo TaskManager/DocumentPicker и Sentry pods. Lockfile и
   privacy bundles синхронизированы командой `pod install`; после этого
   `pod install --deployment` проходит.

## Проверки и результаты

| Область | Команда/доказательство | Результат |
| --- | --- | --- |
| Backend compilation | `python3 -m compileall -q backend` | PASS |
| Backend/API | 22 top-level `backend/tests/test_*.py`, каждый в изолированной SQLite DB; логи `qa/artifacts/test_*.log` | PASS |
| CGR | `pytest backend/tests/cgr -q` | PASS, 26 passed |
| GPS FSM regression | `pytest backend/tests/test_deal_status_actor_fsm.py -q` | PASS, 20 passed |
| Frontend regressions | `node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/*.mjs` | PASS, 13 passed |
| RU/KK/ZH/EN | `npm run qa:i18n` | PASS, 0 missing keys at call sites |
| UX/static | `npm run qa:ux` | PASS |
| Production web build | `CI=true npm run build:web` | PASS; без локального JS-key ожидаемо использован fallback карты |
| Playwright mobile | `npm run qa:center:web` | PASS, 36 passed; HTML `qa/playwright-report/mobile/index.html` |
| Playwright desktop CI | GitHub Actions run `31867547753` | FAIL: 25 passed, 9 legacy scenarios failed |
| Maestro YAML/reference contract | Ruby `YAML.load_stream` всех flows | PASS |
| Maestro iOS execution | `maestro test --platform ios --device ... qa/maestro/driver-auth.yaml` | BLOCKED; JUnit `qa/artifacts/maestro-driver-auth-after-audit.xml` |
| Android debug build | `android/gradlew assembleDebug --no-daemon` | BLOCKED, environment Java 26 / Gradle 8.10 incompatibility |
| iOS simulator build | `xcodebuild ... iphonesimulator ... build` | BLOCKED, Xcode 26.6 incompatibility в transitive `fmt` pod |

Полный совместный `pytest backend/tests -q` намеренно не является критериев
готовности: 28 его падений воспроизводятся из-за module-level monkeypatch
auth-dependency и DB state между независимыми историческими test-модулями.
Поддерживаемый CI-режим запускает модули изолированно; он выше прошёл. Это
зафиксированная проблема тестового harness, не скрытый продуктовый PASS.

GitHub Actions для commit `58512b14d352ec2ac9f28efc2adda34a55742111`
завершился с одним failing job: `Playwright desktop visual audit`.
`API and backend regression`, `Design, FSM and UX gate`, `Maestro mobile
scenarios and release contract` и `Playwright mobile visual audit` прошли.
Desktop job выполнил 25 тестов, но 9 legacy tests ждут удалённый стартовый
`RoleScreen` и его `role-lang-switch`/`role-driver`; текущий первый экран —
`OnboardingV2`. Это подтверждённый **test bug**. Сценарии нельзя просто
исключить: их нужно перенести на testID Onboarding V2 и затем повторить CI.
Артефакт desktop job: `full-qa-playwright-desktop-58512b14…` в run
`31867547753`.

## Безопасность, роли, FSM и документы

- Роль водителя для смены FSM, запрет пропускать статусные шаги,
  идемпотентность и конкурентные переходы покрыты
  `test_deal_status_actor_fsm.py`.
- Доступ к deal rooms, чужим сообщениям, notification dedupe, push-token
  ownership, attachment/storage path security, logout/push cleanup и
  migration-like schema проверены изолированными backend-модулями.
- Отслеживание координат проверено серверной границей: точку может послать
  только водитель своей сделки и только после `in_progress`; чтение доступно
  лишь двум участникам.
- Секреты Яндекс Карт в код не внесены. Web key берётся только из
  `EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY` в CI; source не содержит literal key.
  Проверка tracked env-файлов выполнена без вывода значений.

## MapKit, GPS и push — реальные блокеры

1. В текущем native-коде используется `react-native-maps`; нативные Yandex
   MapKit Android/iOS SDK, Gradle dependency, Pod и runtime key wiring ещё не
   реализованы. Поэтому нельзя заявлять, что MapKit отображается на Android
   или iPhone.
2. JavaScript Яндекс Карта на web реализована, но без активного ключа в
   локальной среде корректно показывает fallback. Фактическое отображение
   Яндекс Карты требует key, ограниченный доменом, и положительное решение
   Яндекса по заявке на режим live tracking. Платное подключение не делалось.
3. Android build требует JDK, поддерживаемый текущим Gradle/AGP (например,
   JDK 17); в доступной среде установлен только Java 26.
4. iOS build после синхронизации pods доходит до компиляции зависимостей, но
   падает на `fmt` с Xcode 26.6. Нужна совместимая версия Xcode/toolchain либо
   обновление React Native/Expo dependency chain в отдельной задаче.
5. Реальный push lifecycle (APNs/FCM, foreground/background/terminated) не
   может быть подтверждён без действующего подписанного native build,
   Firebase/APNs credentials и устройства. Тесты безопасности токенов и
   событий backend прошли, но не заменяют доставку на устройство.
6. Реальные OTP email/phone, Google/Apple login и production API не
   выполнялись: тестовые или чужие учётные данные не использовались.

## Maestro и артефакты

- Flow definitions: `qa/maestro/driver-auth.yaml`,
  `qa/maestro/_lib/qa-login.yaml`, `qa/maestro/smoke-suite.yaml`.
- Скриншоты: `01_onboarding.png`, `01_after_qa_login_driver.png`,
  `02_driver_feed.png`, `03_driver_mywork.png`, `04_driver_queue.png`,
  `05_driver_deals.png`, `qa/artifacts/maestro-preflight.png`.
- Maestro JUnit: `qa/artifacts/maestro-*.xml`.
- Playwright trace/video/screenshot при прогоне сохранялись в `test-results/`;
  итоговый HTML-отчёт — `qa/playwright-report/mobile/index.html`.
- Логи backend изолированных модулей: `qa/artifacts/test_*.log`.

Артефакты остаются локальными и не добавлены в commit, чтобы не раздувать
репозиторий бинарными файлами. CI workflow уже архивирует такие артефакты.

## Изменённые файлы

- `backend/api/marketplace.py`
- `backend/tests/test_deal_status_actor_fsm.py`
- `src/navigation/AppNavigator.js`
- `src/screens/TrackTruckScreen.js`
- `tests/frontend/test_track_truck_embedded_map.mjs`
- `qa/maestro/_lib/qa-login.yaml`
- `qa/maestro/driver-auth.yaml`
- `ios/Podfile.lock`
- `ios/UrTruck.xcodeproj/project.pbxproj`
- `docs/release/urtruck-10-10-final-audit.md`

## Что не проверено вручную

Не выполнены сценарии с реальным грузом/ставкой/сделкой, GPS permission,
background/terminated tracking, push-полный цикл, TTN/PDF с production data
и Android/iOS native MapKit: для них отсутствуют безопасные тестовые
учётные данные, активный MapKit режим и совместимый native toolchain.
