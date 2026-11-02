# FEED-04.2 — подготовка узкого QA2 deploy

## Граница

Workflow `.github/workflows/deploy-qa2-external-feed.yml` устанавливает только компоненты внешней ленты на QA2. Он запускается вручную только с ref `qa2/integration-candidate` и exact SHA, уже включённого в эту ветку. Перед deploy выполняются адресные feed-регрессии и полный обязательный `quality-gate-reusable.yml`; deploy job также требует QA2 environment approval. Общий кандидат находится в PR #662; workflow не устанавливает PR-ветку напрямую.

Production, публичные магазины и реальные Telegram-каналы не являются целью workflow. Активные строки базы не очищаются и не переигрываются вручную.

## Установка

После снятия GitHub billing lock, успешного Quality Gate и продвижения принятого SHA в `qa2/integration-candidate`:

1. Открыть Actions → `Deploy UrTruck external feed components to QA2`.
2. Выбрать ref `qa2/integration-candidate`.
3. Указать полный SHA текущего `qa2/integration-candidate` и подтверждение `INSTALL_URTRUCK_FEED_QA2`.
4. Утвердить среду `qa2`, если GitHub запросит environment approval.
5. Проверить артефакт/лог `QA2_FEED_SOURCE_SHA`, хеши компонентного manifest и путь резервной копии.

Workflow повторно проверяет exact SHA и ancestry, конфигурацию incoming/owned на `qa2.urtruck.kz`, пути независимых баз, наличие QA2 systemd units и неприменимость Production target. До изменений выполняется SQLite online backup входного source DB и независимых incoming/owned adapter DB с `quick_check`, плюс резервная копия изменяемого кода. Source DB не меняется. В `/home/ubuntu/urtruck-qa2` устанавливаются `scheduler/jobs.py`, classifier, adapter, bridge, parser, DAL/API внешней ленты и отдельный `ops/telegram-feed/health.py`. Перезапускаются QA2 API и два QA2 bridge; устанавливаются отдельные `urtruck-qa2-feed-health.service/.timer`. Общие collector, health.py и их units не заменяются и не перезапускаются. Перед копированием останавливается только прежний QA2 health; rollback восстанавливает его предыдущее состояние. Новый state path: `/home/ubuntu/urtruck-qa2/external-feed-health/state/health.json`; alert-config общего collector читается без изменения.

После установки workflow сверяет SHA-256 всех скопированных модулей, проверяет активность затронутых units и локальный QA2 `/health`, после чего пишет компонентный manifest с source SHA. Идентификатор попытки GitHub Actions входит в имена stage/backup, поэтому повторный запуск workflow не сталкивается с каталогами частично завершённой предыдущей попытки. Изменённые SQLite-файлы не восстанавливаются поверх текущей базы при rollback: backup сохраняется для расследования, а rollback возвращает только предыдущий код и перезапускает эти же units.

Дополнение FEED-05: runtime-тесты исполняют настоящий remote shell-блок в изолированных путях и проверяют первую/повторную установку, хеши, прежний timer и сохранение новой строки SQLite после отката. Это не серверный deploy. Полный результат: `docs/qa/feed-05-audit-remediation-20261101.md`.

## Результат проверки workflow

Скрипт deploy прошёл `bash -n`; benchmark script прошёл `py_compile`. Рабочий deploy намеренно не запускался: обязательный GitHub Quality Gate заблокирован billing lock, а PR ещё не продвинут на `qa2/integration-candidate`. Синтаксическая проверка не является выполнением GitHub Actions, удалённого preflight или серверной установки. Перед первым запуском требуется CI на фактическом SHA и QA2 environment approval.

## Локальное сравнение ACK/backoff

`scripts/qa/benchmark_external_feed_adapter.py` воспроизводит одну synthetic mock пачку одинакового размера на установленном старом adapter SHA и кандидатном adapter SHA. API fixture отвечает 49 `created` + 1 `expired`; выполняются два последовательных flush. Скрипт не подключается к сети, QA2 или Production. Его результат проверяет только обработку смешанного ACK и локальные SQL-записи; он не измеряет задержку API, скорость bridge на сервере или видимость карточек.

Результат сохранён в `docs/qa/feed-04-metrics/local-adapter-ack-benchmark.json`. На кандидате одной пачки хватило для терминального ACK expired элемента и 49 созданий; старый adapter повторил всю пачку. Серверная пропускная способность подтверждается только после установки и двух часовых замеров.

## После deploy

Не считать deploy успешным завершением приёмки. Сначала проверить версии/hash компонентов и private health/SQLite агрегаты. Затем выполнить два последовательных часовых баланса incoming/owned, исключив истечения из числа доставок. Для выбранных новых/восстановленных записей подтвердить цепочку до активной карточки в обеих клиентских лентах. Физические устройства и клиентские кнопки проверяются отдельно на exact QA сборке; недоступное устройство — `BLOCKED`.
