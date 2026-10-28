# PRE-FLIGHT: завершение регистрации принадлежит исходной сессии

Разрешение владельца29.10: полностью проверить обе регистрации, исправить конкретные ошибки и затем отправить production-кандидаты в основные магазины. Повторное разрешение на этот узкий фикс не требуется. Исходник88e349531a3cc8777b95e09b65fb6ebfb8dc29cc; branchfix/registration-session-owner-20261029. Полный production backend SHA UNKNOWN;7 auth/registration-модулей runtime совпали с88.

Подтверждённое воспроизведение: отложенный complete-basic аккаунта A, unmount Success, вход B/client, возврат старогоOK → ur_sessionB получил driver при bearerB. Country также способен продолжить saveDriverDraft уже с новым token после старого vehicle save.

Файлы: src/screens/vehicle/VehicleSetupSuccessScreen.js, src/screens/vehicle/VehicleSetupCountryScreen.js, src/utils/registration.js (completeBasic), src/utils/vehicleAPI.js (optional owner guard); адресные behavioral tests. Существующие AuthContext.setRole(expectedToken,isCurrent) и ProfileV2 owner pattern — known-good, переиспользовать. Backend/БД/AuthContext/дизайн/локализацию/Chat/FSM/GPS не менять.

Риски: поздний401 не должен вызвать logout нового аккаунта; второй запрос не должен получить bearerB; повторное нажатие не должно дублировать save; обычная регистрация и retry того же владельца должны сохраниться. Graphify update запущен AST-only без LLM, затем output удалить. Проверки: воспроизведение до/после, обычное завершение, unmount/смена bearer между await, retry/двойное нажатие, существующие auth/onboarding/unit/lint/build CI. Усиленное независимое review обязательно.

Старые IPA122/AAB215090229 не объявлять исправленными. После фикса нужны новые уникальные номера, свежая сверка ASC/EAS/Play, штатные guards точного app SHA и CI. Новые бинарники проверяются отдельно. Rollback — вернуть только этот frontend-патч; production runtime и пользовательские данные не меняются.

Graphify AST-only завершён:13146 nodes/29428 edges/689 communities; generated output удалён. Whole AuthProvider+Success воспроизведение доfix — B.driver, послеfix — B.client.44 targeted frontend tests PASS; runtime registration88 tests PASS, frontend baseline67 PASS, isolated HTTP roundtrip обеихролей PASS. SMTP/SMS delivery не выдаётся за проверенную.

Полный frontend unit:1626/1627 PASS, единственный отказ — ожидаемый hash защитного manifest registration.js после разрешённого адресного исправления. Обновлён только этот hash (AuthContext и все другие protected hashes сохранены) и явно записано основаниеPR643; test_external_freight_scope не ослаблен. Канонический node scripts/lint-source.mjs PASS593files; отдельный eslint не используется проектом.
