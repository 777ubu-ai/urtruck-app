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

1. Вход ассистента в OneSignal подтверждён через защищённое Google 2FA.
   Free app e6f77ac9-aac9-4e7d-be68-a5d805e95fbf существует; APNs/FCM/HMS INACTIVE.
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

- Полный frontend/unit прогон на исходниках e0d4251: 1145/1145 PASS, 0 skipped.
- Browser sign-in: PASS; защищённое Google 2FA завершено, кабинет доступен.
  Секреты аутентификации не выводились и не сохранялись в репозитории.

## Серверный транспорт — следующий изолированный этап

PRE-FLIGHT: база 55685ed; production SHA UNKNOWN; новые файлы
backend/services/onesignal_transport.py и backend/tests/test_onesignal_transport.py.
Registry, auth, database, outbox и действующий gateway не изменяются.
Rollback — revert этого отдельного коммита; runtime не переключается.

Транспорт требует URTRUCK_ENV=qa2, отдельный App ID, provider и серверный API key.
Отправка адресная, без broadcast; повтор одного event/subscription имеет постоянный
idempotency key. Badge задаётся абсолютным серверным числом, включая 0.
HTTP 200 без notification ID не считается успехом; accepted не равно delivered.
Секреты/полные ответы/exception не записываются в результат.
Существующий outbox ещё НЕ вызывает этот транспорт: нужна защищённая привязка
подписки и account-switch протокол до подключения к бизнес-событиям.

Транспорт: 7/7 unit tests PASS (mock HTTP; реальная отправка не выполнялась).


## Проверка кабинета и полномочий после успешного входа

- OneSignal Free: созданное владельцем приложение найдено; подписок пока 0.
- Формы FCM и APNs открыты и прочитаны. Ключи не передавались, Save не нажимался.
- FCM требует Service Account JSON; APNs — .p8, Key ID, Team ID, Bundle ID.
- QA2 использует Firebase project urtruck-e722b. Проект общий; разделение пакетов
  com.urtruck.app / com.urtruck.app.qa2 само по себе НЕ ограничивает права FCM ключа.
- Существующий QA2 credential относится к firebase-adminsdk-fbsvc. IAM read-only:
  firebase.sdkAdminServiceAgent, firebasecloudmessaging.admin, iam.serviceAccountTokenCreator.
  Этот ключ не передаётся OneSignal: права шире необходимого.
- Существующий urtruck-push-sender имеет firebasecloudmessaging.admin. Его рабочие
  credentials и права не менялись.

### Конкретный следующий шаг, ожидающий подтверждения владельца

Создать отдельный account onesignal-qa2 в urtruck-e722b и custom role
urtruckOneSignalPushSender с ровно двумя permissions:
cloudmessaging.messages.create, firebase.projects.get.
Создать отдельный JSON key и передать его только в FCM форму созданного приложения
OneSignal e6f77ac9-aac9-4e7d-be68-a5d805e95fbf. Это постоянный доступ до отзыва ключа;
он разрешает FCM отправку в общем Firebase проекте, а не только QA2 package.
Пилотная маршрутизация UrTruck остаётся ограничена QA2; production не переключается.
Для полной изоляции полномочий потребуется отдельный Firebase project.

Создание аккаунта, role binding, ключа и передача OneSignal ещё НЕ выполнены.
APNs key upload / QA2 provisioning ещё НЕ выполнены; production APNs key не копировался.
После разрешения: выполнить отдельный ключ, подтвердить FCM статус в кабинете;
затем завершить APNs и нативную интеграцию/identity/outbox, собрать QA2 и проверить
физические устройства. Доставка в кабинет не равна готовой приёмке приложения.

Источники требований: официальные OneSignal Android Firebase credentials
https://documentation.onesignal.com/docs/en/android-firebase-credentials
и формы конфигурации live dashboard (проверены 09.10.2026).


## FCM подключён после разрешения владельца

Владелец явно разрешил создать и передать отдельный FCM credential OneSignal.
Созданы service account onesignal-qa2 и custom role urtruckOneSignalPushSender
в Firebase project urtruck-e722b. IAM binding проверен: только эта custom role.
Permissions роли проверены на точное равенство:
cloudmessaging.messages.create, firebase.projects.get.
JSON key хранится на Mac вне git с mode 0600; содержимое не выводилось в чат.
Временная копия для загрузки удалена после завершения передачи файла.

Ключ загружен в OneSignal app e6f77ac9-aac9-4e7d-be68-a5d805e95fbf.
OneSignal вернул Settings saved и перешёл к выбору SDK; выбран Expo,
подтверждено SDK selection successfully saved; мастер завершён кнопкой Done.
Это PASS сохранения FCM credentials; НЕ доказательство доставки на устройство.
Реальная отправка через OneSignal, подписка телефона и native build ещё PENDING.
APNs/HMS и backend business routing пока не подключены.

Rollback FCM: отключить платформу OneSignal и отозвать созданный ключ отдельного
account onesignal-qa2. Рабочие Firebase accounts/credentials не менялись.
Production провайдер UrTruck и серверные runtime не переключались.


## Следующий этап — серверный API доступ и APNs

FCM Active подтверждён по списку платформ OneSignal. APNs/HMS остаются Inactive.
Keys & IDs: API keys отсутствуют. Открыта форма создания ключа без финального
Create; подготовлено имя UrTruck QA2 backend и IP allowlist 185.22.65.11/32.
Исходящий source IP проверен ip route get на сервере: 185.22.65.11.
Создание ключа ожидает отдельного подтверждения: это новый постоянный API доступ
к OneSignal app, включая отправку push; ключ будет храниться только в QA2 env.
Форма не предлагает отдельного ограничения API key только на отправку.
IP ограничивает источник, но не делит production/QA2 процессы на общем сервере.

Production APNs key присутствует, текущий bundle com.urtruck.app.
Права ключа на отдельный bundle com.urtruck.app.qa2 не подтверждены: p8 не содержит
такой информации. Production key не копировался и не передавался OneSignal.
QA2 Apple App ID/provisioning ещё не подтверждены.

Дополнительная native source проверка: react-native-onesignal 5.5.14 использует
Android notifications artifact 5.10.2. В опубликованном AAR найден
FCMBroadcastReceiver с com.google.android.c2dm.intent.RECEIVE и priority 999,
а не второй MESSAGING_EVENT service. Найден отдельный HMS message service.
Таким образом, конфликт двух FCM services пока НЕ доказан; требуется реальная
проверка merged manifest и обработки OneSignal payload через существующий Expo
service, включая отсутствие дублирования. Native build/physical PASS отсутствуют.


## Серверный API key создан и проверен

Продолжение подтверждено владельцем после конкретного запроса создания ключа.
Создан app-scoped API key UrTruck QA2 backend с IP allowlist 185.22.65.11/32.
Секрет сохранён только в /home/ubuntu/urtruck-qa2/backend/.env, mode 0600.
Backup: /home/ubuntu/urtruck-qa2/runtime/onesignal-backups/20261009T175105Z.
Временная копия секрета удалена; ключ в git/клиент/чат не выводился.
Provider остался direct default, runtime не перезапускался и не переключался.

Read-only GET /notifications: обычный dual-stack путь HTTP 401;
принудительный IPv4 curl -4 с тем же ключом HTTP 200, total_count=0.
Причина, соответствующая наблюдению: API IP allowlist содержит IPv4 сервера,
а DNS OneSignal также отдаёт IPv6. HTTP 200 подтверждает валидность ключа
при использовании разрешённого адреса. Точную внешнюю IPv6 идентичность не снимали.

В QA2 standalone transport добавлен HTTPTransport(local_address='0.0.0.0')
с TLS verification по умолчанию и trust_env=False. IP allowlist не расширялся.
8/8 transport unit tests PASS; новый тест проверяет default HTTP client path.
AST Graphify rerun выполнен до правки, без кластеризации.
Фактическая отправка push НЕ выполнялась. Backend outbox ещё не подключён.
APNs/HMS и защищённая привязка пользователя всё ещё PENDING.

OneSignal plugin теперь доступен: health ok, list_apps подтверждает два приложения
UrTruck (e71047aa-061b-4e38-8da5-6bf069f95b07) и существующий QA2 pilot app
(e6f77ac9-aac9-4e7d-be68-a5d805e95fbf). Пилот не переносился в другое приложение.


## Продолжение после разрешения владельца — Apple login blocker

PRE-FLIGHT: branch feat/qa2-onesignal-pilot-20261009, SHA 283f082;
изменение только этого отчёта. Known-good: transport mock tests 8/8 на 283f082;
физическая приёмка OneSignal отсутствует. Checks: исходники bootstrap,
register-native, gateway, main env loader; rollback: revert коммита отчёта.

- Apple Developer показал список ключей после безопасного 2FA.
  Team ID ABR4N7KYY5; существующий APNs key 2Y43J6CR86 имеет
  Team Scoped (All topics), Sandbox & Production. Production key не передавался.
- При открытии Add new key Apple сообщил Your session has expired и вернул login.
  Повторный безопасный вход после нового запроса владельца остановлен Apple:
  Check the account information you entered and try again.
  Новый APNs key не создан, credentials iOS в OneSignal не подключены.
- Подтверждено чтение backend/.env до import providers через setdefault;
  сохранённый QA2 API key находится в читаемом пути. Это не runtime activation.
- Backend /register-native принимает только fcm/apns; gateway допускает только
  native mode и фильтрует registry на fcm/apns. OneSignal transport standalone.
- Client bootstrap выполняет только SDK initialize; business identity,
  subscription registration, click/foreground/read lifecycle не подключены.
- Ни новые QA2 сборки, ни реальная отправка OneSignal не запускались.
  Не заявлять, что переход выполнен или проблемы badge уже решены.
- Владелец выбрал local-only onboarding telemetry. Выбор сохранён в локальном
  .onesignal/telemetry=0; run state исключён через git info/exclude, не коммитится.

Следующий порядок: восстановить доступ Apple; подтвердить QA2 App ID/provisioning;
подготовить отдельный scoped APNs key и разрешение передачи OneSignal;
подключить проверенную ownership-привязку подписки, gateway/outbox и client
read/click/logout lifecycle; native manifest audit; затем QA2 builds и телефоны.
Production runtime/provider остаются без изменений.


## APNs подключён через OneSignal plugin после точного разрешения

Владелец разрешил передать существующий team-scoped APNs key 2Y43J6CR86
в OneSignal для QA2. Team ID ABR4N7KYY5, Bundle ID com.urtruck.app.qa2.
Key разрешает все topics команды, включая production; ограничение пилота
обеспечивается app configuration, а не полномочиями этого Apple key.

Плагин list_apps подтвердил target e6f77ac9-aac9-4e7d-be68-a5d805e95fbf.
provision_app_credentials вернул конфигурацию APNs production с указанными
Key ID / Team ID / Bundle ID и непустым APNs credential. FCM также настроен.
Subscriptions=0: это успех настройки credentials, НЕ физическая доставка.
Private key хранится вне git на Mac, mode 0600; формат проверен openssl pkey.
Production сервер, key и маршрутизация не изменялись.

Инцидент обработки ответа: ответ provisioning содержал APNs private key и
FCM service-account JSON; недостаточная редакция вывела секретные поля
в результат инструмента. Содержимое НЕ копируется в этот отчёт.
Нужна согласованная замена обоих credentials. Старый APNs key нельзя отзывать
до обновления production и подтверждения доставки: это отключит рабочий push.
FCM replacement выполняется через dashboard; write-once provisioning
не заменяет существующие credentials.

Business identity/registry/outbox и read/click lifecycle всё ещё pending.
До физической приёмки не включать production OneSignal и не объявлять PASS.


## FCM credential заменён после инцидента

Создан новый JSON key 986121bd906e933b617ea4df4eb040fb87841713 для того же
onesignal-qa2 account; IAM permissions не расширялись. Новый файл сохранён
на Mac вне git с mode 0600. Через dashboard Google Android (FCM) старый
credential заменён новым; мастер Expo завершён.
Read-only GET /api/v1/apps/{pilot_id} через разрешённый IPv4: HTTP 200.
Внутренняя проверка private_key_id подтвердила новый key, секретные поля
в вывод не передавались. Старый key 71c1f6fd86cf385f4aaa54b5f3010d160dbfae97
отключён командой keys disable (обратимо), не удалён.
Временная upload-копия удалена; постоянная копия остаётся на Mac.

APNs rotation BLOCKED: Apple browser всё ещё показывает login после
повторяющегося session timeout. Нужен новый APNs .p8, после чего обновить
production API + OneSignal, подтвердить delivery и только затем отозвать
старый 2Y43J6CR86. Старый APNs key пока действующий; инцидент ещё не закрыт.
Новые SDK сборки и бизнес-маршрутизация не выполнены.


## PRE-FLIGHT foreground bridge

Base cc80ee2; scope src/utils/oneSignalForeground.js, oneSignalPilot.js,
tests/frontend/test_onesignal_foreground.mjs и этот журнал.
Known-good: существующий decideForegroundPresentation/pushRuntime;
физического PASS OneSignal нет. Protected: production provider, auth,
registry, outbox, translation/voice, GPS и страны.
AST Graphify update выполнен до правки, exit 0. Checks: реальные решения
foreground runtime через mock SDK event, isolation, существующий push runtime,
lint, diff check. Rollback: revert отдельного bridge-коммита.


## QA2 foreground policy bridge

SDK foregroundWillDisplay теперь синхронно вызывает preventDefault до
асинхронного решения существующего decideForegroundPresentation.
Открытая комната и повтор event_id подавляют баннер; другая комната и
события сделки показываются через SDK display. ACK остаётся диагностическим
и не блокирует presentation. Ошибки callback не выводят payload/token.
Bridge lazy-loaded только после QA2 guard, production bootstrap unchanged.
SDK event/property signatures проверены в установленном react-native-onesignal
5.5.14, включая требование synchronous preventDefault.
13/13 tests PASS (5 новых bridge, 5 isolation, 3 existing runtime).
Lint PASS 489 files; diff check PASS. Native/physical checks PENDING.
Click/cold-start, ownership/registry/outbox и APNs rotation ещё не закрыты.


## PRE-FLIGHT QA2 click bridge и Android candidate

Branch feat/qa2-onesignal-pilot-20261009, base 8570536.
Known-good: existing pushRuntime tap policy; OneSignal physical PASS absent.
Scope: bounded in-memory click bridge, bootstrap, App native tap adapter,
optional QA2 Android workflow input and associated tests. Production, auth
credentials, GPS, voice/translation/countries remain protected.
AST Graphify before edit exit 0 (9.86s). Checks: cold-start buffer, session
cleanup, canonical room target, event dedup and current native tap policy,
config isolation, lint, workflow contract. Rollback: revert candidate commit;
QA2 APK installation is separate from production. No production deployment.
Identity Verification requires native JWT bridge: current React Native SDK
does not expose login(externalId, token), per official docs checked 2026-10-09.
Do not enable app-wide identity toggle or trust client-supplied external_id.

First related test run found a source-contract parser defect: the regex
consumed every workflow input and mistook a boolean pilot default for a SHA
default. Narrowed it to the source_ref mapping; source SHA remains required.
Pilot flag step runs after baseline config tests so their intentionally
nonpilot endpoints do not inherit the pilot's strict QA2 host guard.


## QA2 click adapter and build readiness

OneSignal click listener installed before SDK initialize. Latest cold-start
tap is buffered in memory for at most 60 seconds. Native App adapter uses
existing authoritative room_id resolution, handlePushTap, receipt telemetry,
server badge refresh and navigation dedup. Session subscriber cleanup cancels
queued callbacks. Tap does not mark a chat read or delete other notifications.
34/34 related frontend tests PASS, lint PASS 491 active JS files, YAML parse
and mandatory SHA/optional disabled-by-default pilot input PASS, diff PASS.
Production does not initialize SDK. Business identity/registry/outbox remain
PENDING, so candidate is a targeted delivery pilot, not business acceptance.
Android build will use exact candidate SHA and explicit onesignal_pilot=true;
no Play submission or production rollout. iOS separate QA2 signing/provisioning
and APNs key rotation still require resolution of Apple session access.


## PRE-FLIGHT physical inventory / candidate version correction

Branch feat/qa2-onesignal-pilot-20261009 base 2973c81. Huawei
3DJ0224B04002582 connected, Google Play services package present, installed
QA2 versionCode 211040106, versionName 1.0.9-qa2 (read-only dumpsys).
iPhone 15 Pro Max CoreDevice reports unavailable; no current iOS test possible.
74/74 additional frontend regression tests PASS at 2973c81: room-only
notification cleanup, read confirmation, dedup, badge races, deeplink,
country registry and composer layout/runtime. This is source PASS, not physical.
Run 37978398152 cancellation requested before native compilation because the
installed QA2 code already equals metadata candidate 106. Scope: raise only
QA2 metadata baseline 106 -> candidate 107; production version unchanged.
Checks: QA2 build contract, diff check. Rollback: revert version-only commit;
no device downgrade/uninstall/data clearing. Replacement build exact new SHA.


## PRE-FLIGHT OneSignal presented-notification payload compatibility

Base f8687e3, same pilot branch. Full npm test:unit at f8687e3 PASS
1155/1155. Scope readChatNotifications payload extraction and regression tests.
Source finding: official OneSignal iOS OSNotification.m parseOneSignalPayload
reads rawPayload.custom.a, whereas parseOSDataPayload uses top-level data.
Current UrTruck dismissal only sees top-level room/type, so legacy wrapped
OneSignal room notifications would not match. This is not a proven explanation
of prior production badge complaints: production did not use OneSignal.
AST Graphify before change exit 0, 10.22s. Keep readBefore/focus/session/
room-only boundaries, direct FCM/APNs data and unrelated alerts protected.
Checks nested object/string, malformed/unmarked payload, other rooms/business
alerts, newer-than-read push and full frontend tests. Rollback versioned
revert. Run 37978618705 remains delivery-only candidate at f8687e3; subsequent
source fix is not in that artifact and requires its own build for acceptance.


## Wrapped OneSignal room cleanup source fix

Legacy custom.a object/string data is unwrapped only with a provider notification
UUID; direct native room/type takes priority. Read timestamp, current-session
callback, other-room and business notification protections are unchanged.
New regression tests verify same-room old payload cleanup, preservation of
other rooms/deal/new pushes, malformed/unmarked custom data and direct priority.
Full npm test:unit PASS 1158/1158; lint PASS 491 active JS files, diff PASS.
These checks do not prove OS enumeration/dismissal on a physical iPhone.
This fix is source-only and is not in currently running candidate 211040107
at f8687e3. Business registry/outbox/identity and APNs rotation remain pending.


## PRE-FLIGHT Android OneSignal targeted dismissal

Base 82833da, pilot branch. Pinned Android SDK 5.10.2 source confirms
NotificationsManager.removeNotification marks record dismissed, while
NotificationRestoreProcessor restores outstanding records not currently visible.
Expo OS cancellation alone may leave a restorable SDK record. This is a
migration risk, not a demonstrated cause of old production/iOS badge defects.
Scope: guarded SDK dismissal for recognized wrapped OneSignal notifications
with exact signed 32-bit Android foreign-notification id; no guessed ids or
group/all clearing. Protected: production/web/iOS SDK paths, direct FCM/APNs,
other rooms/events, readBefore/session boundaries. Graphify exit 0, 9.91s.
Checks targeted id and guards, SDK failure fallback, complete unit suite/lint.
Rollback: revert source-only commit. Running 211040107 does not include this.


## Targeted Android SDK bookkeeping source fix

Recognized wrapped OneSignal notifications in QA2 now request
OneSignal.Notifications.removeNotification using only the exact signed
32-bit native id in Expo's foreign-notification identifier, after all
room/readBefore/current-session checks. Production/incorrect host/nonpilot
config never loads OneSignal for cleanup; direct native data keeps Expo path.
Unknown/duplicate/out-of-range ids are not guessed. SDK failure still allows
OS room-only dismissal. No group or all-notification removal is called.
Native API is asynchronous: unit invocation is not proof the device database
updated; restore-after-read needs physical verification.
Complete npm test:unit PASS 1162/1162, lint PASS 491 files, diff PASS.
Pinned Android SDK 5.10.2 BadgeCountUpdater: API26+ relies on OS channels;
SDK SQLite fallback applies only to older API, so the badge risk must be
diagnosed by device/version rather than universal SQLite claims.
Source references:
https://github.com/OneSignal/OneSignal-Android-SDK/blob/5.10.2/OneSignalSDK/onesignal/notifications/src/main/java/com/onesignal/notifications/internal/NotificationsManager.kt
https://github.com/OneSignal/OneSignal-Android-SDK/blob/5.10.2/OneSignalSDK/onesignal/notifications/src/main/java/com/onesignal/notifications/internal/restoration/impl/NotificationRestoreProcessor.kt
https://github.com/OneSignal/OneSignal-Android-SDK/blob/5.10.2/OneSignalSDK/onesignal/notifications/src/main/java/com/onesignal/notifications/internal/badges/impl/BadgeCountUpdater.kt
Running 211040107 delivery pilot at f8687e3 excludes both subsequent cleanup
fixes; no false attribution of its physical outcome to the latest source.


## PRE-FLIGHT QA2 packaging OOM repair

Base 02c035e. Run 37978618705 FAILED at :app:packageRelease after 19m17s
Gradle, 1024 executed tasks. Exact cause java.lang.OutOfMemoryError: Java heap
space; no APK uploaded/installed. Source sets Gradle heap 2048m and four ABIs.
Huawei read-only inventory confirms arm64-v8a,armeabi-v7a,armeabi.
Scope: only explicitly enabled OneSignal QA2 workflow Gradle args: 4096m heap,
768m metaspace, max-workers=2 and arm64-v8a physical-pilot target. No global
Gradle/dependency/production setting changed; nonpilot workflow keeps old args.
Checks YAML parse, QA2 source/isolation contract, actual replacement build
packaging and manifest/DEX audit. Rollback: revert workflow-only repair commit.
Retry is required due diagnosed packaging OOM, not a duplicate speculative build.
Candidate remains 211040107 because failed predecessor was never distributed;
it is greater than currently installed Huawei 211040106. New exact SHA
includes both room cleanup fixes. x86/32-bit devices are out of this APK scope.


## PRE-FLIGHT generated QA2 native identity before retry

Base f660635. Static Expo Package.setPackageInBuildGradle probe yields base
com.urtruck.app.qa2 with two remaining applicationIdSuffix .qa2 definitions;
Version setter likewise preserves -qa2 suffix definitions. Native package
refactor rewrites Kotlin package contents but the FCM plugin hardcodes
com.urtruck.app.UrTruckFirebaseMessagingService. Potential invalid artifact/
service target requires generated-project proof before further CI expense.
Cancellation requested for 37981488823; no artifact installed. Read-only/source
prebuild runs in detached temporary worktree
/private/tmp/urtruck-qa2-native-config-check-20261009 at exact f660635 with shared
node_modules, no native compile or production API. Scope: generated Gradle
identity and manifest-class correspondence; protect primary worktree/native
production signing/GPS flags. Checks actual Expo prebuild, package/version/
service/class/autolink; rollback discard only generated changes in temporary
worktree after retaining audit evidence. No phone changes.

## PRE-FLIGHT restore canonical native bridges after QA2 prebuild

Base f660635, Graphify update exit 0. Actual detached Expo prebuild clears
android automatically even without --clean. Generated applicationId/namespace
are correctly com.urtruck.app.qa2 and versionName 1.0.9-qa2: duplicate suffix
hypothesis was NOT reproduced. Real defect: seven canonical UrTruck Kotlin
classes and both MainApplication package registrations are deleted, while
manifest references the missing base-package FCM handler. Scope QA2-only CI
post-prebuild restoration from exact checked-out Git SHA, preserving canonical
class package and FCM delegation policy; no production native edits. Validate
all guards before writes, idempotence, production rejection, generated project
manifest/class correspondence, then compile frozen source. Rollback revert
restoration script/workflow insertion; no device or API changes yet.

Native restoration verification: 7/7 Python tests PASS (exact Git bytes,
idempotence, production guard, SHA guard, package guard, manifest guard,
duplicate registration and suffix guard). Actual Expo-generated QA2 tree
restoration and second-run equality PASS. Full JS unit suite 1162/1162 PASS;
lint 491 active JS files PASS; git diff checks PASS. Python system environment
lacks PyYAML; workflow YAML validation uses installed Node YAML parser.
Cancelled run 37981488823 produced no distributed candidate. Source restoration
also preserves SystemBarsPackage; flags, translation/voice, GPS and production
files are not edited. Native compile and physical acceptance remain pending.

## PRE-FLIGHT restore canonical bridge dependencies

Base 4e00fca. Run 37982967065 failed compileReleaseKotlin: unresolved
ShortcutBadger and ShortcutBadgeException in canonical badge store. Expo reset
also removes explicit app Gradle bridge dependencies. No APK distributed.
Graphify update exit 0. Scope QA2-only restoration includes canonical explicit
Firebase Messaging 25.0.1 and ShortcutBadger 1.1.22@aar dependencies from exact
Git SHA. Validate before writes; reject conflicting or duplicated coordinates;
check actual generated Gradle and add regression coverage before retry.
Rollback revert QA2 restoration change. Production native files untouched.
Prior exact 4e00fca PR backend, frontend and mandatory web E2E all passed.
iOS pod install completed; OneSignalXCFramework 5.8.0 resolved. Unsigned
simulator compilation is diagnostic only, not physical APNs acceptance.

Bridge-dependency repair: 8/8 restoration regression tests PASS; actual
generated project dependencies/restoration/idempotence PASS; full JS suite
1162/1162 PASS. Source fixed only after diagnosed Kotlin compilation failure.
Version remains 211040107 because no failed candidate was distributed.
