# PR551 — единый release-readiness checkpoint

**Снимок:** 2026-10-16 18:56 Asia/Almaty (12:56 UTC)  
**Кандидат:** PR551, `fix/full-candidate-audit-20261016`  
**Исходный base:** `fb23ebd0572c34a889eddc9eea7bdc048db2eef7` (PR550 head)  
**Проверенный backend source commit:** `3935bce5d80bc4c9bdae7c0b82aecbdf2342d38f`, tree `d5ce02dd25b8b3de9ea2327318aa67ce673e272c`  
**Checkpoint/PR head до этого checkpoint-документа:** `f3e9c936e5f353f7c2b161cded1982596527846d`, tree `c85b44d08ce63a018cde7a6524af8ad4fda4e9a5`  
**GitHub:** [PR551](https://github.com/777ubu-ai/urtruck-app/pull/551), OPEN/DRAFT; merge не выполнялся. В текущем PR head `f3e9c936` после тестируемого source commit менялась только документация.

Этот файл — текущий авторитетный снимок. Более ранние секции в [полном audit log](full-candidate-audit-20261016.md) описывают состояние на свои даты; в частности, запись о незакрытом cold-start P1 была верна до commit `3935bce5` и теперь superseded.

## Подтверждённое исправление и проверки

Холодный запуск полного `main:app` на новой SQLite оставлял `chat_messages` без `event_id`: `marketplace` инициализировался раньше `chat`, прежняя миграция пропускала отсутствующую таблицу и подавляла исключение. Теперь новая таблица объявляет поле, а chat startup добавляет его старой схеме идемпотентно после создания таблицы; неэффективная ранняя миграция удалена.

- Новый тест до исправления завершался RED на пустой схеме, импортированной штатным `main:app` без setup схемы в harness.
- После исправления набор `test_cold_start_deal_status_migration.py`, `test_fresh_db_chat_startup.py`, `test_deal_status_actor_fsm.py`, `test_two_role_acceptance_journey.py`: **36/36 PASS**.
- Проверены empty DB, старая схема без `event_id` с заранее записанным сообщением и схема, где поле уже есть. Два запуска migration не меняют ID/owner/text/read state/room relation/indexes и не добавляют дубликаты.
- На полном API пройдены регистрация shipper/driver/outsider, cargo → bid → accept, разрешённая последовательность `in_progress → at_border → delivered → received → completed`, status events/messages, повторные запросы и запрет постороннему. Второй отдельный Python backend process открыл ту же DB и подтвердил сохранённые session/roles/statuses/events/messages.
- Тестовые OTP/push adapters используются только в изолированных тестах. Email/push внешняя доставка этим не подтверждена.
- Independent Security Review точного backend diff `e4443280dd369690373a7c4963709a50b88793a4` → `3935bce5d80bc4c9bdae7c0b82aecbdf2342d38f`: **NO FINDINGS**.
- Required CI `38901196298` на source `3935bce5…`: **SUCCESS 3/3**. После checkpoint-only head `f3e9c936…` CI `38901946437`: **SUCCESS 3/3** (backend, frontend/lint/build, mandatory web E2E).
- Доказательства описаны также в `docs/qa/full-candidate-audit-20261016.md`; restart evidence — `docs/qa/pr551-process-restart-evidence-20261016.json`.

Это подтверждает исправление кода и синтетическую SQLite persistence, но не является upgrade rehearsal на старой реальной пользовательской схеме.

## Обновление на старой базе — `UPGRADE_PENDING`

Защищённый forensic snapshot ранее обнаружен по метаданным на сервере, но не прочитан и не скопирован: не подтверждены разрешение использовать его для QA, его репрезентативность и наличие связанной цепочки с вложениями и самими файлами. В доступных локальных QA-копиях нет подходящей полной цепочки.

Чтобы закрыть проверку, требуется один из вариантов:

1. Передать обезличенную QA-копию старой SQLite **и точное соответствующее дерево private storage/files**; в ней должны быть непустые сделки, обе стороны/participants, сообщения, attachment metadata, действующие ownership links и реальные байты файлов; либо
2. Отдельно разрешить использование конкретного защищённого backup (идентификатор/путь и владелец данных) в изолированном ACL-ограниченном зашифрованном lab. Сам backup остаётся read-only; исследование и upgrade выполняются только на отдельной защищённой копии. Сначала подтвердить, что snapshot содержит требуемые строки и storage-файлы.

Для rehearsal до/после сверить только внутри защищённого окружения: ID, owners, связи и statuses; число и content hashes сообщений; attachment metadata/owners; hashes фактических файлов; доступ участника/контрагента и отказ outsider; integrity и отсутствие дублей после второго startup. В Git/логи выносить только redacted counts/statuses и контрольные hashes, не содержимое/PII. Не восстанавливать старую DB поверх live данных.

## Отдельная QA-проверка внешних интеграций

Текущая read-only инвентаризация GitHub показывает environment `qa2` и имена QA2 FCM secrets `QA2_FCM_PROJECT_ID`, `QA2_FCM_SERVICE_ACCOUNT_JSON`, `QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64`; значения не читались. В repo GitHub QA2 secret-name inventory не содержит QA SMTP, APNs или отдельного private-storage credential. `eas.json` preview/production по-прежнему задаёт `EXPO_PUBLIC_API_URL=https://urtruck.kz`; для QA нельзя использовать эти EAS profiles как изолированную среду. Это вывод по GitHub/EAS metadata и committed config, а не проверка runtime `.env` на QA2. QA2 workflow предусматривает точный `QA2_API_URL` и изолированную FCM конфигурацию.

| Интеграция | План проверки | Что считается подтверждением | Текущий статус / недостающее |
|---|---|---|---|
| Email, включая QQ | Использовать отдельный адрес контролируемого QA-пользователя и доступ к его inbox; выполнить OTP send/verify, затем повторный вход. В отчёт сохранять request/correlation ID, masked destination, provider message ID/status и время получения; OTP не сохранять. | SMTP/API provider acceptance фиксировать отдельно. Фактический PASS получения — письмо видно в выделенном QQ inbox с подтверждённым временем/заголовками. | **PENDING**: GitHub `qa2` не показывает SMTP secret names и нет подтверждённого выделенного QQ inbox/адреса. Нужны выделенный тестовый адрес с доступом к inbox и штатная QA SMTP-конфигурация. Реальные пользователи не адресаты. |
| Android FCM | После получения выделенного QA устройства/QA2 клиента зарегистрировать принадлежащую QA-тестеру сессию и token; создать одно синтетическое событие; записать event/outbox/recipient, transport choice, redacted provider message ID/status; проверить foreground/background/locked notification и deep link. | FCM accepted — только provider acceptance. Фактическая доставка подтверждена устройством и открытием корректной карточки/сделки; отдельно проверить отсутствие дубля. | **PENDING**: QA2 FCM secret names присутствуют, секреты не извлекались и отправка не выполнялась. Нужны выделенные QA аккаунт, устройство и согласие на тестовый token; текущая задача исключает телефоны. |
| iOS APNs | Подготовить QA/TestFlight bundle/environment с sandbox APNs настройками, выделенный тестовый аккаунт/устройство; одно тестовое событие с сохранением provider result, затем визуальная проверка на устройстве. | APNs accepted ≠ доставлено. PASS доставки — получение на тестовом iPhone, открытие правильного deep link и проверка badge/read state. | **PENDING**: в GitHub `qa2` secret-name inventory нет APNs QA credentials; EAS preview не является отдельной QA API-конфигурацией, доступ к тестовому iPhone отсутствует в scope. Нужны владелец/администратор APNs sandbox конфигурации и тестовый iPhone. |
| Приватное storage | Отдельная QA private bucket/root без production credentials; загрузить один не-PHI тестовый PDF с известным SHA, проверить metadata и bytes после нового процесса; owner/participant могут скачать, outsider не может; проверить expiry/подпись и отсутствие public URL. | Upload provider acceptance фиксируется отдельно. Доступность подтверждается фактическим download и равным SHA; права — положительным owner/participant и отрицательным outsider тестом. | **PENDING**: отдельный QA bucket/root/credential не подтверждён inventory; `SUPABASE_SERVICE_KEY`/prod env использовать нельзя. Нужны ACL-изолированное storage namespace и ограниченные QA credentials; не включать VPS write mode только ради теста. |

Ни одна внешняя доставка или внешний storage provider не тестировались в этом продолжении; provider readiness нельзя выводить из наличия имён secrets.

## Реестр состава PR551 и исключённых PR542–545

**PR551 с base PR550 (`fb23ebd…`) включает:**

- База PR550 содержит проверенную ancestry PR546–549: автоматическую пагинацию публичных feed грузов/рейсов, восстановление/проверки Android FCM classes и bounded token retries, ограниченную материализацию города, debounce/cancel устаревшего поиска и исключение поиска в закрытом picker. Также у base есть изменения из предыдущего QA-кандидата, включая авторизованный запрос фильтра избранного и ограничение окна карточек. PR550 body подтверждает scope и ancestry; это описание состава, а не физическая приёмка.
- Прикладной diff PR551: `src/utils/push.js` — безопасное прекращение/возобновление регистрации токена вокруг logout, активного запроса, повтора и смены сессии; regression tests. Новых экранов/функций UX нет.
- Backend diff PR551: `chat_messages.event_id` в свежей schema и идемпотентная legacy migration в chat startup; устранена ошибочная миграция из marketplace; добавлены cold-start и двухрольный API tests.
- В текущем PR551 отдельно присутствуют QA docs/restart evidence. Магазинные IPA/AAB не создавались и PR551 не release binary.

**Открыты отдельно, не входят в PR551 ancestry или diff** (все ниже OPEN/DRAFT на проверке 2026-10-16):

| PR | Отдельное содержание | Что не подтверждено / блокер |
|---|---|---|
| [#542](https://github.com/777ubu-ai/urtruck-app/pull/542) | Chat attachment API limit до 100 MiB и boundary tests. | Production Nginx сохраняет 16 MiB, API 12 MiB и Supabase bucket 10 MiB по собственному описанию PR; нужен согласованный лимит всей цепочки, review, concurrency/memory и guarded infra change. Старый `/chat/photo` 8 MiB. Не выкатывать отдельный backend bump как будто end-to-end лимит уже увеличен. |
| [#543](https://github.com/777ubu-ai/urtruck-app/pull/543) | Клиентская JPEG подготовка/filename/MIME/фактический size check для фото в чате. | Физическое HEIC/JPEG transcode и upload на iPhone/Android не проверены; новый QA APK и mobile acceptance отсутствуют. |
| [#544](https://github.com/777ubu-ai/urtruck-app/pull/544) | Default-off private VPS storage для новых chat attachments, подписанный доступ. | Нужны отдельные усиленный review, backup/restore private root, QA/production storage configuration, concurrent upload/memory, Nginx путь и end-to-end clients. Нельзя включать без защиты/миграционного плана старых объектов. |
| [#545](https://github.com/777ubu-ai/urtruck-app/pull/545) | Клиентская локализация `ROLE_NOT_ALLOWED` RU/EN/KK/ZH и сохранение заполненной формы. | Тесты покрывают отображение кода, но не устанавливают роль конкретного китайского пользователя; пользовательский отказ/несовпадение роли ещё требует идентификатора аккаунта и read-only role/request evidence. Включение требует новой app сборки. |

## Известные проблемы и release blockers

- **Fresh backend cold-start `event_id`:** source fix и проверки пройдены (выше); ещё нет выпуска/deploy, и новая клиентская композиция не доставлена пользователям.
- **Upgrade старой пользовательской базы и файлов:** `UPGRADE_PENDING`, конкретные материалы перечислены выше.
- **Реальные email/QQ, FCM, APNs и private storage:** `PENDING`; acceptance провайдера и фактическое получение должны оставаться раздельными.
- **Пользовательский отказ публикации груза на китайском:** PR545 отдельно; без точного account ID, серверной роли, `users/me`, времени/endpoint/status нельзя называть первопричину. Не менять роль предположением.
- **Фото/PDF и большие вложения:** PR542/543/544 отдельно; существующие лимиты разных слоёв не согласованы в единую end-to-end проверку.
- **Полный мобильный пользовательский путь/поиск и память:** физические проверки не выполнялись этим этапом; PR550 CI/API проверки не доказывают отзывчивость, FCM получение или долговременную память на телефонах.
- **Состав старой release base:** 9ac/IPA99/AAB214116271 и Apple submission не менялись этим заданием; их прежние статусы не обновлялись и не означают release готовность данного кандидата.
- **Production runtime:** в этом read-only продолжении exact runtime/deploy target не проверялся; не объявлять его совместимым на основании QA synthetic tests.
- `node-forge@1.4.0` advisory `GHSA-86w9-cpqp-85rv` остаётся upstream risk; локальная временная компенсация и срок пересмотра описаны в full audit checkpoint.

## План выпуска и отката — только будущий, не выполнен

1. **До любого выпуска**: получить разрешённую protected old-DB + files копию и закрыть upgrade rehearsal; выполнить внешние QA проверки с отдельными адресами/аккаунтами/устройствами; пройти соответствующий independent review итоговой интеграции. Определить точный production target/runtime и совместимость старых клиентов. Ни health endpoint, ни synthetic tests не подтверждают production SHA.
2. **До backend activation** существующий guarded deploy writer должен сверить source/runtime identity и текущую schema, сделать свежий consistent backup БД и отдельный backup storage, зафиксировать before hashes конфигурации/runtime и проверяемые rollback targets. Не выполнять ad-hoc SSH writes.
3. Миграция `event_id` аддитивная и не удаляет/переписывает rows. На предварительно проверенном target сначала выполнить штатный backend startup/migration, подтвердить schema, health, status transitions, session/ownership и storage links; контролировать ошибки. Если проверка не проходит — остановить rollout и откатить только код штатным writer, оставив additive колонку и все новые строки на месте.
4. **Не восстанавливать прежний DB backup поверх live DB после начала записи.** Он хранится только как forensic/restore point; любая потеря/повреждение устраняется forward repair на свежей копии либо восстановлением с replay новых записей по отдельной процедуре. Storage backup отдельный и согласованный с DB snapshot, чтобы не потерять недавно загруженные файлы.
5. После стабильного backend и подтверждённой совместимости отдельно решить выпуск приложения: exact source/build mapping, QA update без очистки данных, stores review и phased/public rollout по отдельной авторизации. PR551 не содержит новые IPA/AAB и не меняет текущие store submissions.
6. Rollback criteria заранее задать в deploy review: startup/migration failure, рост 5xx, ошибки статусов/event persistence, нарушение ownership, исчезновение сообщений/файлов или несовпадение fingerprint. Сначала остановить новый code path/повторные writes по guarded writer; сохранить все live DB/storage данные. Автоматический rollback старой базы запрещён.

## Состояние работы

- Source fix: `IMPLEMENTED`; целевые тесты `PASS`; required CI `PASS`; backend diff review `PASS`.
- Текущий PR551: OPEN/DRAFT, без merge. Production/store/real data writes: **не выполнялись**.
- Выпуск в целом: **BLOCKED** из-за `UPGRADE_PENDING`, внешних интеграций и мобильной приёмки; полной готовности не заявлять.
- Самый ранний внешний шаг: предоставить разрешённую обезличенную old-QA SQLite + соответствующие private files (или отдельно разрешить конкретный protected backup для изолированной копии). Параллельно назначить отдельный контролируемый QQ inbox, Android QA device/аккаунт, iOS APNs sandbox/device и изолированный QA private storage.
