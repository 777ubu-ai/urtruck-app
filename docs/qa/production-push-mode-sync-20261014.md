# Синхронизация production push mode — 14.10.2026

## Наблюдаемое состояние до операции

- Production `.env`: `PUSH_PROVIDER_MODE=dual`.
- Named PM2 API и scheduler: `online`, оба с `PUSH_PROVIDER_MODE=native`, cwd `/home/ubuntu/urtruck/backend`.
- Listener `:8001` принадлежал named API PID на read-only проверке.
- На установленном production push-коде были подтверждены SHA256 `services/push_gateway.py` `cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56` и `services/push_sender.py` `9ed81b63c1b288f439c716ec6519eb2899dc653b9178ffff0eae1c3175bc5030`.
- Общий backend остаётся смешанным, full source SHA неизвестен, trusted runtime manifest отсутствует. Данный режимный переход не создаёт такой manifest и не объявляет backend known-source.

## Операция

Новая ручная workflow-вызовка вызывает режим `sync_push_mode` в существующем reusable production writer. До рестарта она сверяет точный ref/SHA caller workflow, production SSH key и pinned host key, заданный backend path, два live push-файла, named PM2 процессы, их cwd/online/native state и владельца listener. `.env` должен уже содержать ровно одно значение `dual`.

После preflight существующий `remote_health_check.sh` останавливает только named scheduler, переводит API и scheduler на `dual` через `pm2 restart --update-env`, затем проверяет readback обоих процессов и API health. При ошибке helper возвращает оба процесса к прежнему режиму и проверяет восстановление health. Эта операция не копирует runtime code, не редактирует `.env`, БД, storage, registry, outbox, frontend или магазинные артефакты. В очереди остаются те же события; scheduler приостановлен только на время переключения.

Обычный `operation=deploy` остаётся отдельной веткой того же writer. Новая ручная workflow не содержит SSH/deploy-кода и вызывает только reusable writer. GitHub concurrency у writer сериализует её с обычным production deploy.

## Границы доказательства

Режим `dual` возвращает Expo-only записи в выборку старого production gateway; его прежняя реализация исключает Expo-строку при совпавшем `device_id` с native строкой. Поэтому известные 17 Expo-записей без native-пары снова становятся кандидатами на доставку, но реальное получение push телефоном этой процедурой не доказывается. Новый проверенный same-install/app-aware fallback из release PR #532 ещё не развёрнут на production; доставка при одновременно существующей, но невалидной native-паре требует production code transition и отдельного provider/device подтверждения.

Эта узкая операция разрешена только при совпадении live source hashes и указанных PM2/listener условий. Любой source drift или изменение режима останавливает её до restart. Она не заменяет план первого known-source перехода.
