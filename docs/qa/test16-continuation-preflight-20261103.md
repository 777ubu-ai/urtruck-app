# URTRUCK-TEST-16 — продолжение существующего кандидата

- Branch/SHA: fix/feed16-preserve-input-whitespace, исходный d2b11077a0dd87a2d143cdf5ef848a08b3cd85d5; release-база a9353ef9490b5e95d6e92c75bbff0738aff29f36.
- Known-good: существующие CI 41582821631 и APK 41583513810 относятся только к d2b11077. Xiaomi 214494481, Huawei 214494479. Новый код требует собственной проверки; production SHA UNKNOWN.
- Scope: CargoTypeInput, LocationPickerModal, places/geography/worldCities/pickerSearchScheduler, регрессии и QA2 build metadata 214494482. Сервер, основная БД, очередь, GPS policy, auth, FSM, навигация и дизайн защищены.
- Graphify: AST-only update выполнен; 32 узла и 177 связей пяти целевых модулей. CargoTypeInput используется созданием груза; LocationPickerModal — созданием грузов/рейсов, редактированием рейса, фильтрами обеих ролей. Cargo editing использует собственную форму; переписывать её без доказанного дефекта нельзя.
- Риски: повторное применение справочной подписи и обрезка ввода; блокировка JS при обходе всего справочника; публикация устаревшего поиска. Справочные значения сохраняют canonical name при явном выборе; произвольный текст не локализуется, смена языка его не заменяет.
- Checks: новые behavioral UI/E2E на пробелы/композицию/черновики/отмену; полный frontend/backend, lint, web build, обязательные E2E/Quality Gate нового SHA; далее один новый QA2 APK и два телефона.
- Rollback: адресный revert новых коммитов feature-ветки через PR, повторная сборка с большим versionCode; данные телефонов и серверные БД не очищать/не откатывать.
