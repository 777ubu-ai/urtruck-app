# Защищённая репетиция обновления backend

`upgrade_rehearsal.py` запускает полный `main:app` только на свежих копиях
SQLite и локального private storage. Исходные пути открываются только для
чтения; production-маркеры, незащищённые файлы, симлинки, неполная база,
несовпавшие fingerprints и удалённые ссылки вложений приводят к отказу.
Рабочий каталог должен существовать заранее, принадлежать текущему
пользователю и иметь права `0700`; все создаваемые файлы закрываются до
`0600`. Данные и startup-логи остаются там для последующей защищённой
проверки, автоматической очистки нет. Runner требует чистое Git worktree,
записывает фактические source SHA/tree в агрегированный отчёт и откажется
работать при незакоммиченных изменениях.

Исполнять команду можно только после получения разрешённого QA snapshot
(сам snapshot должен быть отдельной защищённой копией, а не live DB или
единственным backup), соответствующего дерева файлов, трёх валидных
выделенных QA-сессий и отдельного QA `FILE_SIGNING_KEY`. Секреты не передаются
через аргументы процесса и не выводятся. Не помещать входные JSON, секретный
файл, копии DB/storage или результат внутрь Git worktree.

```sh
umask 077
mkdir -m 700 /protected/urtruck-upgrade-lab
chmod 700 /protected/urtruck-upgrade-lab
python3 scripts/qa/upgrade_rehearsal.py \
  --source-db /protected/qa-copy/old.sqlite \
  --source-storage /protected/qa-copy/storage \
  --protected-root /protected/urtruck-upgrade-lab \
  --authorization /protected/qa-copy/authorization.json \
  --access-probes /protected/qa-copy/access-probes.json \
  --file-signing-key-file /protected/qa-copy/file-signing-key \
  --report /protected/urtruck-upgrade-lab/aggregate-report.json
```

`authorization.json` (режим `0600`) содержит только аттестацию и заранее
зафиксированные fingerprints:

```json
{
  "format": "urtruck-upgrade-authorization-v1",
  "authorized_for_upgrade_rehearsal": true,
  "source_kind": "sanitized_qa_copy",
  "copy_id": "локальный-идентификатор-копии",
  "database_sha256": "64 hex",
  "storage_manifest_sha256": "64 hex"
}
```

`source_kind` может быть `sanitized_qa_copy` или `protected_backup_copy`;
во втором случае сам исходный файл также обязан быть отдельной разрешённой
защищённой копией. Storage fingerprint вычисляется по относительным именам,
размерам и SHA-256 всех файлов; абсолютные пути не попадают в отчёт.

`access-probes.json` (режим `0600`) содержит выделенные сессии сторон сделки,
валидную сессию постороннего QA-пользователя, идентификаторы комнаты и
вложения, а также ожидаемый SHA-256 локального файла:

```json
{
  "participant_a_bearer": "QA session token",
  "participant_b_bearer": "QA session token",
  "outsider_bearer": "QA session token",
  "conversation_id": "QA fixture id",
  "attachment_id": "QA fixture attachment id",
  "attachment_sha256": "64 hex"
}
```

Программа сверяет существующие строки каждой таблицы по первичному ключу и
всем старым колонкам, допускает добавление новых колонок/миграционных строк,
но не изменение или потерю прежних строк. Второй штатный запуск обязан
сохранить точный результат первого. После повторного старта оба участника
должны прочитать вложение, а третья сессия получить `403`; содержимое файла
сверяется с ожидаемым hash. В JSON-отчёт выходят только количества,
контрольные SHA и статусы — без имён, контактов, содержимого сообщений,
идентификаторов пользователей, токенов и HTTP response bodies.

Backend запускается новым Uvicorn-процессом на `127.0.0.1` с полным
`main:app`, отдельным `DB_PATH`, копией local storage, `BETA_MODE=false`,
пустой конфигурацией внешних провайдеров, выключенным Sentry, ботом без
токена, `URTRUCK_ENABLE_SCHEDULER=0` и `CGR_FEATURE_ENABLED=false`. Это
отключает отправки и периодические scheduler jobs. Идемпотентные startup
migrations (включая одноразовое фоновое построение индекса, если оно
требуется текущей схемой) остаются частью штатной инициализации базы.
Storage URL другого хоста отвергается до HTTP-запроса; удалённое storage
не подключается и не считается проверенным.

До появления подходящей разрешённой копии команда не запускается: статус
остаётся `UPGRADE_PENDING`. Известная текущая QA-копия не содержит полной
цепочки сделка → участники → сообщения → вложение и реальные байты файла.
