# PRE-FLIGHT: отдельная production-доставка внешней ленты

- Branch/SHA: ops/external-feed-production-target-20261023 отa30dd65f. Это подготовка совместимого пакета, не production deploy/активация.
- Known-good: QA2 a30dd65f, CI3/3 и независимыйreview; существующий bridge преднамеренно запрещает production. Поэтому сам серверный API overlay не делает магазинную ленту наполненной.
- Scope: только валидатор целевого API в external_freight_queue_bridge.py, его регрессии, этот журнал. По умолчанию по-прежнему только QA2. Production требует отдельной явной настройки EXTERNAL_FREIGHT_DEPLOYMENT_TARGET=production и отдельного adapter state в /home/ubuntu/urtruck/runtime/external-feed/.
- Protected: очередь/reader/session Telegram, QA2state/key, core/auth/роли/чат/GPS/push/расходы, схемы основных таблиц, любые live окружения. Никаких обходов auth/ролей, перенаправления QA2 или второго collector.
- Checks: отказ production по умолчанию, strict scheme/host/path/port/userinfo/query, запрет общего/QA2 state и symlink-переадресации, прежние QA2-проверки/bridge tests. Независимый review+CI новогоSHA. Синтетические тесты не работают с основной БД.
- Rollback: revert валидатора/выключение отдельного импорта. SQLite и новые пользовательские записи не заменять. Production env/key/timer пока не создаются.
