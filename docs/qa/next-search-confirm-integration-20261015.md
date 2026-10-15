# Интеграционный checkpoint: marketplace search + подтверждение статуса

Дата: 15.10.2026, Asia/Almaty. Статус этого файла: промежуточный до итогового CI/review.

## PRE-FLIGHT и состав

- Изолированная ветка `integration/next-search-confirm-20261015`, создана от PR536 exact SHA `1080523a04a931dfe4465805e80c4a99c0e4b506` (PR base).
- PR539 current head `0983b82e0b2fff08749c61255eae09849baa4d57`; прикладной diff — `f242523ae6ff89281d7586eda9baa7f313f972be`, tree `0671088d25e7eacd92f4d285271dc85757ca30cd`; последний commit PR539 документационный.
- PR539 зависит от PR537 `f975e450cae9bb44a9e2217bd382c54af3605f51`; его включение необходимо для parent/pagination contract.
- PR538 head `c489fbbb2f10fe7e318cf78f87298ffb6f792c57`, base тот же PR536 SHA. Изменения подтверждения/Modal lifecycle независимы от поискового патча; merge прошёл без конфликтов.
- Использованы сохранённые branch commits обычными `--no-ff` merge-коммитами для сохранения происхождения; PR536, PR537, PR538, PR539, main/release не изменялись. Ни один merge не выполнялся в release/main.
- Планируемые защищённые соседние пути: Auth/owner scope, unread/push, chat/documents/voice/translations, GPS/map, deal FSM/roles/terminal statuses. Новые зависимости, SQL schema migrations, production writes и mobile/store builds не входят в scope.
- Rollback интеграции: закрыть draft PR и отбросить только эту отдельную ветку/worktree; пользовательские данные/БД/production не менялись.

## Graphify

AST-only `graphify update .` выполнен на базовом checkout до merge: 11,125 nodes / 24,644 edges. Исследованы связи `DealWorkspaceScreenV2` (85 edges) с `AppConfirmModal`, Auth, unread/outbox, GPS, attachment, voice/translation; `FeedScreen` (31) и `CargoFeedScreen` (24) с Auth, i18n, picker/sheet/card и `marketAPI`. SQL parser `tree_sitter_sql` отсутствует (20 SQL файлов не попали в граф); 2 Gradle-файла разобраны частично. Эти ограничения не затрагивают изменяемые JS/backend Python связи. Generated `graphify-out/` удалён.

## Среда и границы

- Production backend SHA остаётся `UNKNOWN_MIXED`; deployment не запускался.
- Read-only VPS check: PID 2310531, owner `www-data`, PPID 1, cgroup `/system.slice/cron.service`, executable `/var/tmp/.systemd-private-33/.lib/xmrig`, SHA256 `8c19b4bf96922f30937ff8e3798584f1c2f1ff5796c11d62f2d9504782d1f58b`, около 346% CPU при наблюдении. Стандартные systemd/cron startup path matches не найдены; происхождение процесса не установлено. Не останавливался и не удалялся. VPS load test закрыт до проверки администратором/безопасного baseline.
- OPPO `WGCA9PSGOFUOWC7D` доступен и ADB-authorized; installed QA2 `com.urtruck.app.qa2` versionCode `211040106` соответствует ранее проверенному APK из run `38635942279`, source SHA `1080523a...`, а не интеграционному кандидату. Production package остаётся отдельным и не затрагивается.
- Huawei в свежем `adb devices -l` отсутствует. New Android/iOS builds не создавались; физическая приёмка интегрированного SHA не заявляется.

## Итоговый состав и доказательства

Заполняется после exact integration CI/review. CI на отдельные PR не переносится автоматически на интеграционное дерево. Нагрузочный и physical-device результаты указываются отдельно от source/CI.
