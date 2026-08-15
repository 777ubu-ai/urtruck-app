# UrTruck — финальный аудит 10/10

- Дата: 2026-08-15
- Ветка: `codex/yandex-maps`
- Проверенный commit исправления desktop CI: `7367e5a49bfb75fc1747b96ac37a00ff83d50ca8`
- База: `510bdc394265b2520d989ca7ab566e8d0157df0a` (`origin/main` merge-base)
- PR: [#188](https://github.com/777ubu-ai/urtruck-app/pull/188)
- Итоговый статус: **READY WITH BLOCKERS**

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
5. **Test bug / desktop CI:** девять legacy desktop кейсов (включая три
   viewport-варианта visual suite) ожидали стартовый `RoleScreen` и экраны
   `Premium*`, хотя живой путь давно `OnboardingV2 → PhoneV2 → OtpV2 →
   RoleV2 → Main`. Все сценарии перенесены на актуальные testID и реальные
   accessibility semantics. Новый shared helper
   `qa/utils/onboardingV2.js` изолирует mock API, поэтому тесты не отправляют
   SMS и не зависят от production backend.
6. **Product bug / mobile keyboard:** `PhoneV2` теперь явно задаёт
   `inputMode="tel"`; на web react-native-web корректно преобразует его в
   проверяемый native `input[type="tel"]`.

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
| Playwright desktop (новый local run) | `QA_BASE_URL=http://127.0.0.1:4173 QA_CAPTURE_ALL=1 npx playwright test --config qa/playwright.config.js` | PASS, 41 passed, 1.7m |
| Playwright desktop CI (исторический) | GitHub Actions run `31867547753` | FAIL на старом `58512b1`: 25 passed, 9 legacy scenarios failed; исправлено в `7367e5a` |
| Maestro YAML/reference contract | Ruby `YAML.load_stream` всех flows | PASS |
| Maestro iOS execution | `maestro test --platform ios --device ... qa/maestro/driver-auth.yaml` | BLOCKED; JUnit `qa/artifacts/maestro-driver-auth-after-audit.xml` |
| Android debug build | `android/gradlew assembleDebug --no-daemon` | BLOCKED, environment Java 26 / Gradle 8.10 incompatibility |
| iOS simulator build | `xcodebuild ... iphonesimulator ... build` | BLOCKED, Xcode 26.6 incompatibility в transitive `fmt` pod |

Полный совместный `pytest backend/tests -q` намеренно не является критериев
готовности: 28 его падений воспроизводятся из-за module-level monkeypatch
auth-dependency и DB state между независимыми историческими test-модулями.
Поддерживаемый CI-режим запускает модули изолированно; он выше прошёл. Это
зафиксированная проблема тестового harness, не скрытый продуктовый PASS.

GitHub Actions для старого commit `58512b14d352ec2ac9f28efc2adda34a55742111`
завершился с одним failing job: `Playwright desktop visual audit`.
`API and backend regression`, `Design, FSM and UX gate`, `Maestro mobile
scenarios and release contract` и `Playwright mobile visual audit` прошли.
Desktop job выполнил 25 тестов, но 9 legacy tests ждут удалённый стартовый
`RoleScreen` и его `role-lang-switch`/`role-driver`; текущий первый экран —
`OnboardingV2`. Это подтверждённый **test bug**. Сценарии нельзя просто
исключить: их нужно перенести на testID Onboarding V2 и затем повторить CI.
Артефакт старого desktop job: `full-qa-playwright-desktop-58512b14…` в run
`31867547753`. Для `7367e5a` локальный полный прогон зелёный; CI нового HEAD
должен быть проверен отдельно после push.

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
- `qa/utils/onboardingV2.js`
- `qa/agents/{premium.login,full.auth.regression,auth.logic.lock,visual.screenshots,guest.mode,phone.input.keyboard,role.i18n}.spec.js`
- `src/screens/onboarding/PhoneV2Screen.js`

## Что не проверено вручную

Не выполнены сценарии с реальным грузом/ставкой/сделкой, GPS permission,
background/terminated tracking, push-полный цикл, TTN/PDF с production data
и Android/iOS native MapKit: для них отсутствуют безопасные тестовые
учётные данные, активный MapKit режим и совместимый native toolchain.

## iOS runtime-проверка 2026-08-15

- Ветка: `codex/yandex-maps`, исходный commit проверки: `6d43262b65e1bdf3ee9eb4e7eb230f153e38d922`.
- Устройство: iOS Simulator `iPhone 17`, UDID
  `3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F`.
- `npm ci --no-audit --no-fund`: exit 0; `pod install --deployment`: exit 0.
- `xcodebuild -workspace ios/UrTruck.xcworkspace -scheme UrTruck -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F' -derivedDataPath /tmp/urtruck-ios-derived build`: exit 65. Компиляция останавливается на `fmt` (consteval errors) с Xcode 26.6; лог: `qa/artifacts/ios-real/xcodebuild.log`.
- Попытка Expo Go: установлен Expo Go SDK 57, проект использует Expo SDK 52; приложение отклонено как несовместимое до загрузки UrTruck.
- Реальный Maestro smoke на том же симуляторе: `maestro test qa/maestro/smoke-suite.yaml --format junit --output qa/artifacts/maestro-real/ios-smoke.xml`: exit 1 (`"UrTruck" is visible` не выполнено), JUnit и лог сохранены в `qa/artifacts/maestro-real/`.
- Итог: **BLOCKED**. Нативный iOS runtime и native Yandex MapKit не подтверждены; текущий `TruckMap.native.js` по-прежнему использует `react-native-maps`.

## Повторная iOS-проверка после минимального fmt workaround 2026-08-15

- Toolchain: Expo `~52.0.46`, React Native `0.76.9`, CocoaPods `1.16.2`, Xcode `26.6` (Xcode 26.2 на рабочем Mac отсутствует; он задан только как EAS CI image в `eas.json`).
- Точная причина исходного exit 65: `ios/Pods/fmt/include/fmt/format-inl.h` (`FMT_STRING` на строках 59, 60, 1387, 1391, 1394) — `call to consteval function ... is not a constant expression` при C++20.
- Исправление: `ios/Podfile` ограничивает только target `fmt` стандартом `c++17`; Expo/RN и остальные pods не обновлялись. `pod install --deployment`: exit 0; лог: `qa/artifacts/ios-real/pod-install-deployment.log`.
- Сборка: `xcodebuild -workspace ios/UrTruck.xcworkspace -scheme UrTruck -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F' -derivedDataPath /tmp/urtruck-ios-derived-fmt17 -skipMacroValidation -collect-test-diagnostics never`: exit 0 (`** BUILD SUCCEEDED **`); полный лог: `qa/artifacts/ios-real/xcodebuild-fmt17.log`.
- Установка/запуск: `xcrun simctl install 3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F /tmp/urtruck-ios-derived-fmt17/Build/Products/Debug-iphonesimulator/UrTruck.app` и `xcrun simctl launch ... com.urtruck.app`: exit 0. Screenshots: `qa/artifacts/ios-real/urtruck-ios-launched.png`, `qa/artifacts/ios-real/urtruck-ios-onboarding.png`.
- Реальный native Maestro: `maestro test qa/maestro/smoke-suite.yaml --format junit --output qa/artifacts/maestro-real/ios-smoke.xml`: exit 0, 1/1 flow passed на `iPhone 17` (iOS 26.4), 18 секунд. Лог и JUnit: `qa/artifacts/maestro-real/ios-smoke.log`, `qa/artifacts/maestro-real/ios-smoke.xml`; итоговый экран: `qa/artifacts/maestro-real/ios-after-maestro.png`.
- Для реального native execution `appId` в `qa/maestro/smoke-suite.yaml`, `qa/maestro/client-tabs.yaml`, `qa/maestro/driver-auth.yaml` и `qa/maestro/_lib/qa-login.yaml` исправлен с Expo Go (`host.exp.Exponent`) на `com.urtruck.app`.
- Native Yandex MapKit всё ещё **BLOCKED**: `src/components/TruckMap.native.js` импортирует `react-native-maps`; Yandex официально не поддерживает React Native без собственного bridge. Android/iOS MapKit SDK, native key wiring и карта Yandex в runtime не заявляются готовыми.

## Итог для HEAD `0257736`

- Финальный commit этой проверки: `02577368cd739025896d666ea908464cc47d0e60` в ветке `codex/yandex-maps`; `main` и production не изменялись.
- GitHub Actions run `31874373269` для этого HEAD: API/backend `94987781227` PASS; Design/FSM/UX `94987781317` PASS; Maestro contract `94987781233` PASS; Playwright desktop `94987781256` PASS; Playwright mobile `94987781208` PASS.
- Несмотря на зелёный web/backend/contract CI и реальный локальный iOS smoke PASS, общий статус остаётся **BLOCKED** до native Yandex MapKit (Android/iOS) и полноценного authenticated driver/client Maestro с безопасными QA fixtures.

## Native Yandex MapKit bridge — проверка текущего HEAD (2026-08-15)

Этот раздел supersedes устаревшие утверждения выше о `react-native-maps`. В
текущей рабочей ветке добавлен отдельный Expo Modules bridge
`modules/urtruck-yandex-map`:

Кодовый commit реализации: `2d9a53f`; текущий HEAD с этим отчётом нужно
сверять командой `git rev-parse HEAD` в ветке `codex/yandex-maps`. Изменения не
вливались в `main` и не публиковались в production.

- iOS: `UrTruckYandexMapModule.swift` + pod `YandexMapsMobile 4.42.0-lite`;
- Android: `UrTruckYandexMapModule.kt` + dependency
  `com.yandex.android:maps.mobile:4.42.0-lite`;
- JS wrapper: `modules/urtruck-yandex-map/src/UrTruckYandexMapView.tsx`;
- `src/components/TruckMap.native.js` использует только этот bridge и честный
  fallback при отсутствии ключа/ошибке SDK; внешние карты не открываются;
- API key читается только из `YANDEX_MAPKIT_API_KEY` в `app.config.js`, его
  значение в логи, исходники и отчёт не выводилось.

| Область | Точная команда | Runtime | Результат | Артефакт |
|---|---|---|---|---|
| CocoaPods | `cd ios && pod install --deployment` | macOS, CocoaPods 1.16.2 | PASS | `qa/artifacts/ios-real/pod-install-yandex-deployment.log` |
| iOS build | `xcodebuild -workspace ios/UrTruck.xcworkspace -scheme UrTruck -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F' -derivedDataPath /tmp/urtruck-ios-derived-yandex -skipMacroValidation -collect-test-diagnostics never` | iPhone 17 Simulator, iOS 26.4 | PASS (`** BUILD SUCCEEDED **`) | `qa/artifacts/ios-real/xcodebuild-yandex-rerun.log` |
| iOS install/launch | `xcrun simctl install ...` + `xcrun simctl launch ... com.urtruck.app` | iPhone 17 Simulator | PASS; onboarding открыт | `qa/artifacts/ios-real/urtruck-runtime.png` |
| Android build | `JAVA_HOME=...openjdk@17... cd android && ./gradlew assembleDebug --no-daemon` | Android SDK, JDK 17 | PASS (`BUILD SUCCESSFUL`) | `qa/artifacts/android-yandex/gradle-assemble-debug-global-kotlin-pin.log` |
| Android install/launch | `adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk` + `am start .../.MainActivity` | AVD `urwork_test`, `emulator-5554` | PASS; onboarding открыт | `qa/artifacts/android-yandex/urtruck-runtime.png` |
| Maestro smoke iOS | `maestro test --udid 3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F --test-output-dir qa/artifacts/maestro-real/ios-rerun qa/maestro/smoke-suite.yaml --format junit --output qa/artifacts/maestro-real/ios/smoke-suite-rerun.xml` | iPhone 17 Simulator | PASS, 1/1 | `qa/artifacts/maestro-real/ios/smoke-suite-rerun.xml`, `qa/artifacts/maestro-real/ios-rerun/screenshots/` |
| Maestro client iOS | `maestro test --udid 3D4F6F4A-86D7-4125-BC8D-B74D9C88C35F --test-output-dir qa/artifacts/maestro-real/ios/client-tabs qa/maestro/client-tabs.yaml --format junit --output qa/artifacts/maestro-real/ios/client-tabs.xml` | iPhone 17 Simulator | PASS, 1/1 | `qa/artifacts/maestro-real/ios/client-tabs.xml`, `qa/artifacts/maestro-real/ios/client-tabs/screenshots/` |
| Maestro smoke Android | `maestro test --udid emulator-5554 --test-output-dir qa/artifacts/maestro-real/android/smoke-suite qa/maestro/smoke-suite.yaml --format junit --output qa/artifacts/maestro-real/android/smoke-suite-rerun.xml` | AVD `urwork_test` | PASS, 1/1 | `qa/artifacts/maestro-real/android/smoke-suite-rerun.xml` |
| Maestro client Android | `maestro test --udid emulator-5554 --test-output-dir qa/artifacts/maestro-real/android/client-tabs qa/maestro/client-tabs.yaml --format junit --output qa/artifacts/maestro-real/android/client-tabs.xml` | AVD `urwork_test` | PASS, 1/1 | `qa/artifacts/maestro-real/android/client-tabs.xml` |
| Maestro driver iOS/Android | `maestro test ... qa/maestro/driver-auth.yaml --format junit ...` | iPhone 17 / AVD | BLOCKED before app flow: `MAESTRO_QA_AGENT_TOKEN` отсутствует | `qa/artifacts/maestro-real/ios/driver-auth.xml`, `qa/artifacts/maestro-real/android/driver-auth-rerun.xml` |
| Web build | `npm run build:web` | local static export | PASS; без ключа сохранён fallback | `qa/artifacts/web-build-yandex.log` |

Дополнительные проверки: `python3 -m compileall -q backend` — PASS; `node
--check app.config.js` — PASS. Backend pytest не запускается в текущем окружении:
`ModuleNotFoundError: No module named 'fastapi'` (лог
`qa/artifacts/backend-deal-fsm-yandex.log`).

Фактические блокеры остаются:

1. В локальной среде отсутствует `YANDEX_MAPKIT_API_KEY` (проверено только
   наличием/отсутствием, значение не раскрывалось). Поэтому нативный bridge
   собран, но фактическое отображение Yandex MapKit, marker, zoom и GPS на
   устройстве не доказано; приложение показывает честный fallback.
2. Для driver-auth нужен безопасный тестовый `MAESTRO_QA_AGENT_TOKEN` и
   локальный QA backend. Токен не создавался и не вводился.
3. Реальный GPS/push lifecycle, background tracking и iOS/Android MapKit с
   валидным ключом не проверены на устройстве.

Итоговый статус текущей проверки: **BLOCKED**. `main` и production не
изменялись; платное подключение и внешняя публикация не выполнялись.

### GitHub Actions для кодового commit

Для кодового commit `0b00f8006d3a4fedac7ee98dbe53a149e1f1d6c4` вручную
запущен workflow [31878273265](https://github.com/777ubu-ai/urtruck-app/actions/runs/31878273265).
Все jobs завершились `success`: API/backend, Design/FSM/UX, Maestro contract,
Playwright desktop и Playwright mobile. Этот workflow не выполняет native
Maestro на устройстве и не проверяет Yandex MapKit runtime; соответствующие
блокеры выше остаются.
