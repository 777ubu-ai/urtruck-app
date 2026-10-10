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
