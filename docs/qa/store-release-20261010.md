# UrTruck — отправка обновления в магазины 10.10.2026

## PRE-FLIGHT и разрешение
Владелец 10.10.2026 17:09 Asia/Almaty явно разрешил новую production версию: iOS довести до отправки в App Store, Android полностью подготовить для финальной кнопки менеджера. Владелец сообщил о проверке GPS 30 минут и push. Это owner-reported acceptance без номера сборки/устройств и приложенного evidence; полный аудит и 10/10 не подтверждены.

- Branch release/store-public-20261010; base c39af30ad73ead21853f503ce9d95c16504ba72f.
- База включает последний unified source d41c51c, #506–514 и Android MapKit 4.19 / 16KB gates; не собирать устаревший main или старую базу #516 отдельно.
- План файлов: адресные cherry-picks 2093f103 (ownership API, utility, chat mapping + tests), decc059 (vehicle safe-area + rendered tests), 3def0ac (vehicle units + rendered tests); сборочные workflows testflight-local.yml и deploy-play.yml, этот журнал.
- Риски: совместный chat mapping должен сохранить STT/links/composer/read logic последних версий; safe-area и units не менять vehicle API, required fields или роли. Проверить конфликтующие строки и обязательный regression gate. Старый production backend может не отдавать mine — физический ownership PASS не переносится.
- Known-good: новые последние iOS/Android runs 37945679955/37945674289 SUCCESS на workflow c39af30; manifest/source/build уточнить. Huawei production 213702394 и iPhone (96) по checkpoint не доказывают физическую приёмку добавляемых патчей.
- Checks: Graphify AST-only перед интеграцией; scoped rendered/unit regressions; общий quality gate до сборок; signed identity/production host/Firebase/APNs/16KB checks, store state/API и manager handoff.
- Protected: чужие ветки/незакоммиченные изменения, production сервер/БД, ключи, реальные сделки, устройство/данные, прежние опубликованные версии.
- Rollback: не публиковать новый неподтверждённый binary; до публичного выпуска сохранить старый store baseline и отменить только собственную отправку/черновик. Установленный Android versionCode нельзя понизить обычным обновлением.
- Сборки: только существующий GitHub-hosted local EAS workflow и Gradle runner; платный EAS cloud build не запускать.
- Полный независимый review #516/#517 отсутствует; владелец разрешил продолжение релиза после checkpoint, это не APPROVED от независимого reviewer.

## Интеграция
- Graphify AST-only: 10724 nodes /23665 edges, affected chatMessageListState проверен; graphify-out не сохраняется в git.
- Cherry-picks ownership + vehicle safe-area + units интегрированы. Единственный конфликт import чата разрешён с сохранением measureComposerLines последних iOS fixes. Diff чата: только import isOwnDocument и вызов для serverDocs.mine.
- Scoped проверки на 7901dc9: 43 PASS, 0 FAIL — ownership, URL expiry, readiness/history/composer и rendered vehicle regressions.
- Новый iOS guard >96; оба канала собирают final workflow SHA с текущими runtime production settings. Android minimum code >213720253, AAB выбран для production draft, финальную публикацию выполняет менеджер.
- Свежая ASC API проверка: 1.0.9 REJECTED, submission UNRESOLVED_ISSUES; ранее отправленная 94 не находится в WAITING_FOR_REVIEW. Текст нового отказа пока неизвестен, browser требует Apple Account. Не помечать причины resolved без чтения.

## Исправление release-контракта
- Первые runs 38051291956/38051294466 остановлены gate до native build: backend/E2E PASS; frontend 1151 PASS, 1 FAIL. Причина — существующий test_play_release_inputs жёстко ожидает прежний minimum code 213298108. Новый workflow minimum 213720253 с ним не синхронизирован.
- Scope: только baseline assertion этого существующего release-contract теста; значение обновлено до подтверждённого последнего загруженного Android номера. Guards подписей/host/16KB/шифрования APK не ослабляются.
- Автоматическая проверка отклонила browser-auth password step Apple, трактуя предыдущую authResult=FAILED как неудачный вход и требуя нового разрешения пользователя. Обходов не выполнять; текст нового rejection остаётся UNKNOWN.

## Проверки замороженного SHA
- Binary source SHA: 7ee5e9087a6e4afda648c93123a33c8d5403a498. Повторные iOS 38051831925 и Android 38051833715: backend, frontend/lint/build, mandatory web E2E — SUCCESS перед native build. Release-contract subset: 10 PASS.
- Production reviewer login 10.10: штатный email/verify с ранее настроенными приватными review credentials HTTP 200, session issued, verification_level 2; /register/me, /market/my, /chat/rooms, /notifications/badge HTTP 200. Секреты и session token не выводились. Это API smoke, не физическая проверка новой сборки и не объяснение нового Apple отказа.

## Подписанная iOS сборка
- Run 38051831925 SUCCESS. Manifest: sourceSHA 7ee5e9087a6e4afda648c93123a33c8d5403a498, com.urtruck.app, 1.0.9 (97), urtruck.kz, flavor production, apsEnvironment production.
- IPA SHA-256 ee5cb86d25a79f4668cb507f7ae69c56714c6ceabcaafcd9e1a4372524f37336. Artifact 11670671029.
- 12:45:25 UTC EAS Submit: binary successfully uploaded to App Store Connect. Это TestFlight upload; App Review submission и public release этим не выполнены. Первые ASC polls ещё не возвращают build 97, ожидается processing.

## Android production draft
- Run 38051833715 SUCCESS: signed AAB com.urtruck.app 1.0.9 (213798673), source SHA 7ee5e9087a6e4afda648c93123a33c8d5403a498. 48 ELF 16KB /0 failures; AAB ZIP alignment, Firebase runtime resources, package/code guards PASS. Native Gradle build + release unit tests SUCCESS.
- AAB SHA-256 db4473b090ac1696433c0f11d83b57d8c327e45bfad4eb289d3901a23bcfb740; artifact 11669832493. Google API upload/commit SUCCESS 12:47:51 UTC.
- API inspection run 38052147274 SUCCESS: production draft 213798673; public completed baseline 213702394 (1.0.9), beta 209578495 (1.0.7), internal 213720253. Поэтому owner-reported 1.0.7 в Play не совпадает с production track API.
- Дополнительный scope preflight: metadata-only ops/store-notes-20261010 c104161, existing inspect workflow, только RU notes существующего 213798673 draft. Exact draft+baseline guards, validate/commit, fresh read. Public status/other tracks не менялись. Run 38053507984 SUCCESS, notes_committed true, publication_performed false.
- CI нового binary: frontend main suite 1152 PASS/0 FAIL; mandatory web E2E 23 PASS; backend canonical и P0/P1 subsets SUCCESS; deprecation warnings не исправлялись этим релизом.

## Финальная точка продолжения
- ASC 97 VALID, id 726f808c-f6ca-41a9-bc68-5d086fae3353. Перед заменой selected build сохранён приватный snapshot, guard исключает downgrade и отмену review. Новый build 97 привязан к 1.0.9, releaseType AFTER_APPROVAL; fresh API подтверждает PREPARE_FOR_SUBMISSION и selectedBuild 97.
- Предыдущая submission bea2c456-d49f-4894-ab2b-afb5a316e64e всё ещё UNRESOLVED_ISSUES. Issues не помечались resolved, reviewSubmitted false, publicationPerformed false. App Store public 1.0.7 READY_FOR_SALE. Нужно прочитать фактический rejection и устранить/ответить, затем отправить новую review. Повтор защищённого password-entry Apple остановлен automatic approval review; требуется новая явная авторизация этого retry.
- Android 213798673 production draft + RU notes подготовлены. Менеджер проверяет фактические Console declarations / Publishing overview и отправляет на review/rollout. Console формы не проверены, гарантия одной кнопки отсутствует.
- Подписанные binary остаются на frozen SHA 7ee5e9087a6e4afda648c93123a33c8d5403a498. Последующие commits содержат только инструкции/ASC helper и не означают пересборку. Production backend/БД/реальные сделки не изменялись. Full audit NO-GO не превращается в 10/10 на основании store upload.

## Защищённый вход и фактический отказ — продолжение 10.10.2026
- Владелец явно разрешил повтор защищённого входа в App Store Connect. Secure browserAuth выполнен; аккаунт и private App Review page доступны. Прежний login blocker снят.
- Документальный PRE-FLIGHT: HEAD ae2d0e692bc0a2d1b3e12f5e163e0ae154412f1b, working tree clean; scope — только этот журнал, manager handoff и текст неподтверждённого ответа Apple. App source/CI/workflows/production auth/backend не менять; tests — diff check и свежий browser state; rollback — revert собственного documentary commit. Binary source остаётся 7ee5e9087a6e4afda648c93123a33c8d5403a498.
- Прочитано фактическое сообщение Apple от 10 октября: Guideline 4.8 — Login Services. Review devices iPad Air 11-inch (M3), iPhone 17 Pro Max; Apple reviewed 1.0.9 (94). Текущий item уже связан с 1.0.9 (97), но submission всё ещё UNRESOLVED_ISSUES, Resubmit disabled.
- Reviewer attachment Screenshot-1010-101634.png просмотрен: Google и email на экране, Apple button отсутствует.
- Scoped source inspection: PhoneV2 показывает Apple только если getAppleAuthGate().show; live Supabase auth settings read-only HTTP 200: google=true, apple=false. Это подтверждает выключенный Apple provider, а не неработающий Apple Account пароль. Ключи/токены не выводились. Build 97 не содержит исправления auth gate; Guideline 4.8 не объявляется resolved.
- Apple явно предлагает Bug Fix Submissions: попросить одобрить исправляющее обновление и устранить замечание в следующем update; сообщение указывает, что обычная повторная отправка не требуется для этого варианта. Поскольку выбранный build сменился с reviewed 94 на 97, подготовленный ответ отдельно уточняет 97 и просит указать, нужна ли новая submission.
- Ответ сохранён через Save Draft; browser state показывает Continue Draft / Delete Draft, Messages (2) не увеличился. Reply не нажат, сообщение не отправлено. Текст: docs/qa/appstore-review-reply-20261010.md. Требуется согласие владельца именно на обращение Apple с обязательством исправить 4.8 в следующем update; это новая коммуникация/обязательство, а не повтор разрешения релиза или входа.
- Не менять Apple provider или security credentials без отдельного конкретного действия/авторизации; ни настройки provider, ни приложение, ни production данные этим продолжением не изменены. Публичная версия App Store остаётся 1.0.7; новая 1.0.9 пока не опубликована.

## Ответ Apple отправлен — 10.10.2026
- Владелец явно разрешил отправить сохранённый ответ: запросить одобрение 1.0.9 (97) и обязаться исправить 4.8 в следующем обновлении.
- Documentary PRE-FLIGHT: branch release/store-public-20261010, исходный HEAD 43c086ad83ead8a59fac26b8485fe2cd754cb48a, working tree clean. Known-good — сохранённый draft и selected build 97 видны в App Store Connect; это не physical acceptance новой сборки. Scope — только три release docs; app source, backend/auth settings, binary source 7ee5e9087a6e4afda648c93123a33c8d5403a498 защищены. Checks — fresh browser message state и git diff --check. Rollback документации — revert собственного commit; отправленное сообщение не отзывать и не обещать его удаление.
- Continue Draft открыл тот же согласованный текст; Reply нажат один раз. После завершения UI показывает Messages (3), полный текст нового сообщения владельца, Reply to App Review; Continue Draft / Delete Draft отсутствуют. Отправка подтверждена.
- На момент подтверждения submission bea2c456-d49f-4894-ab2b-afb5a316e64e остаётся Unresolved Issues, item 1.0.9 (97) Rejected / 4.8, Resubmit disabled. Ни approval, ни public release не подтверждены. Ответ просит Apple отдельно сообщить, нужна ли новая submission из-за замены reviewed 94 на 97.
- Следующий шаг — решение/ответ Apple по Bug Fix Submissions. Согласованное обязательство: обеспечить equivalent login, соответствующий 4.8, в следующем update. Не отмечать 4.8 resolved без фактического исправления и проверки.
- Доказательство: сохранённый screenshot urtruck-appreview-sent-1791644178305.jpg, live App Review message page. Android draft не изменялся этим действием.
