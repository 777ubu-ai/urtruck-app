# Синхронизация production push mode — checkpoint 15.10.2026

## Read-only состояние перед операцией

- Штатный SSH key+pinned-host доступ работает. Backend root `/home/ubuntu/urtruck/backend`; API listener `:8001` принадлежит `urtruck-security-api` PID 2862573.
- `.env` задаёт `PUSH_PROVIDER_MODE=dual`; API и scheduler online, cwd `/home/ubuntu/urtruck/backend`, оба effective mode `native` (PID 2862573 и 2862710). API health `ok`, DB `ok`; `PRAGMA quick_check=ok` на фактической БД.
- Runtime-selected `DB_PATH=/home/ubuntu/urtruck/runtime/security.db`. Файл `/home/ubuntu/urtruck/backend/database/security.db` не используется процессами и является пустой decoy для этого deploy; backup обязан брать путь из `.env`.
- `/api/v1/push/info`: gateway mode `native`, ready; FCM и APNs configured, APNs sandbox=false. Это конфигурация/provider readiness, не доказательство доставки на телефон. В 24-часовом delivery log есть provider accepts и отдельные `provider_not_configured`/`invalid_token` failures; недавние успешные APNs/FCM записи также есть.
- Registry: 59 active Expo, 70 FCM, 3 APNs. Из Expo 7 и из FCM 3 active rows ownerless; их не назначать владельцам. Ещё 17 Expo disabled/logout; все disabled/invalid/account-deleted rows сохраняются без ручного включения. Двадцать active Expo rows у 17 владельцев не имеют enabled native-пары по `user_id + device_id`: last_seen 1 row ≤7d, 9 rows 8–30d, 10 rows >30d. Нулевой count active Expo rows с null `device_id`. Это точная текущая группировка; старый показатель «17» означал owner count, не row count.
- В выбранном DB на момент readback pending/processing outbox `0`; dead `6`, sent `211`, sent_partial `85`, skipped_no_devices `55`, затем `59` при следующем read. Scheduler менял terminal counters между снимками; значения являются наблюдениями на время, а не гарантиями.
- PM2 saved `/home/ubuntu/.pm2/dump.pm2` хранит оба UrTruck процесса в `native`. Изменение только live PM2 environment не переживёт `pm2 resurrect`/host reboot.
- Текущие SHA live `services/push_gateway.py` `cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56`, `services/push_sender.py` `9ed81b63c1b288f439c716ec6519eb2899dc653b9178ffff0eae1c3175bc5030`. Runtime inventory: 141 Python/SQL/requirements files, fingerprint `e2c9ef0562e19509016bce855f3ee1366f1d0caab4ffb1238b3a2e8c03889cf4`. Full backend SHA `UNKNOWN_MIXED`, trusted manifest отсутствует.

## Reviewed writer

PR #533 caller использует единственный `production-deploy-execute.yml`, ключ SSH и pinned host. До write проверяются exact `main` ref/SHA, path, runtime file count/fingerprint, source hashes, `.env=dual`, API/scheduler/native state и listener PID.

Исправленная версия writer должна до переключения создать на сервере защищённый backup `~/urtruck/backups/push-mode-sync-<run-id>`: каталог 0700, файлы 0600; точная копия PM2 dump и consistent SQLite backup через read-only/query-only SQLite backup API по фактическому DB_PATH. В record остаются только non-secret режимы/PID/CWD, hashes и integrity result. Действующая `.env`, БД, storage, registry, outbox и source не перезаписываются.

Существующий `remote_health_check.sh` останавливает только named scheduler, меняет API затем scheduler на `dual`, проверяет process readback и health, затем `pm2 save`. Helper проверяет, что сохранённый список процессов тот же, а различается только `PUSH_PROVIDER_MODE` этих двух процессов. При ошибке восстанавливается исходный PM2 dump и native modes; при недоказанном API rollback scheduler остаётся остановленным. С SQLite snapshot не выполняется автоматическое восстановление: mode-only operation не меняет бизнес-данные, а старая копия поверх свежего трафика опасна.

## Push compatibility и границы доказательства

В `dual` текущий gateway отправляет native FCM/APNs и Expo fallback для активных записей без совпавшего native `device_id` внутри recipient. Совпавшая Expo запись исключается, чтобы не отправить два канала на одну известную установку. Ownerless/disabled/invalid/logout rows не включаются вручную и не изменяются. 20 Expo rows у 17 владельцев становятся допустимыми fallback-кандидатами, но их возраст/registry state не доказывают получение push. Provider `sent` означает принятие соответствующим provider, не показ на устройстве. Без physical delivery/read-race проверки ставить `DEVICE_TESTS_PENDING`.

Никаких deploy/production writes на момент checkpoint не выполнено. Перед вызовом writer нужны exact-head CI + Security Review для последнего изменения, свежий read-only preflight и успешно созданный backup. После применения проверить process+persisted PM2 modes, push/info, health, scheduler, registry/outbox invariants и ошибки. Новый source/runtime или trusted manifest этим mode-only изменением не объявляются.

## Review-найденные release safeguards

Security Review точного cumulative diff `1bc6d87b… → cf558793…` нашёл P1: изменившиеся dependency/audit tooling paths не входили в `deploy.yml paths-ignore`, что могло запустить обычный full deploy при merge. Он также отметил P2: mode не сохранялся в PM2 dump. В последующем candidate исправлены оба риска: paths-ignore включает только конкретные operations/tooling paths с регрессией полного PR path list (product/backend paths остаются в deploy gate); writer сохраняет и валидирует backup/persisted process state. Эти новые правки ждут собственных exact-head CI и review.
