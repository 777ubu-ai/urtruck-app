# URTRUCK-TEST-16 — продолжение существующего кандидата

- Branch/SHA: fix/feed16-preserve-input-whitespace, исходный d2b11077a0dd87a2d143cdf5ef848a08b3cd85d5; release-база a9353ef9490b5e95d6e92c75bbff0738aff29f36.
- Known-good: существующие CI 41582821631 и APK 41583513810 относятся только к d2b11077. Xiaomi 214494481, Huawei 214494479. Новый код требует собственной проверки; production SHA UNKNOWN.
- Scope: CargoTypeInput, LocationPickerModal, places/geography/worldCities/pickerSearchScheduler, регрессии и QA2 build metadata 214494482. Сервер, основная БД, очередь, GPS policy, auth, FSM, навигация и дизайн защищены.
- Graphify: AST-only update выполнен; 32 узла и 177 связей пяти целевых модулей. CargoTypeInput используется созданием груза; LocationPickerModal — созданием грузов/рейсов, редактированием рейса, фильтрами обеих ролей. Cargo editing использует собственную форму; переписывать её без доказанного дефекта нельзя.
- Риски: повторное применение справочной подписи и обрезка ввода; блокировка JS при обходе всего справочника; публикация устаревшего поиска. Справочные значения сохраняют canonical name при явном выборе; произвольный текст не локализуется, смена языка его не заменяет.
- Checks: новые behavioral UI/E2E на пробелы/композицию/черновики/отмену; полный frontend/backend, lint, web build, обязательные E2E/Quality Gate нового SHA; далее один новый QA2 APK и два телефона.
- Rollback: адресный revert новых коммитов feature-ветки через PR, повторная сборка с большим versionCode; данные телефонов и серверные БД не очищать/не откатывать.


## Телефонный отказ 482 и финальный кандидат 483

Branch/SHA перед правкой: fix/feed16-preserve-input-whitespace / a7415a9d. APK 482 физически установлен на Xiaomi без очистки; вставка многострочного текста показала перекрытие нижних строк подсказкой. Причина — абсолютный top:52, оставшийся от однострочного поля. Скриншот xiaomi-482-multiline-overlap-FAIL.png находится в общем qa-evidence/URTRUCK-TEST-16-20261103.

Scope: только CargoTypeInput dropdown top:100% и testID, регрессия геометрии в обязательном browser E2E, metadata следующего 483. Данные, форма отправки, поисковый алгоритм и лента не меняются. Checks: новый финальный Quality Gate; после него APK483 и повторная физическая приёмка. Старые PASS482 на новый SHA не переносятся. Rollback: адресный revert UI-правки; данные устройств не удалять.
