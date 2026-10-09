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
