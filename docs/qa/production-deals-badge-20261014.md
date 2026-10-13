# Production: ложный Deals badge от no_bids — PRE-FLIGHT, 14.10.2026

Владелец00:00 Алматы явно разрешил перенос серверного исправления на production. Scope — только Deals/native badge, не полный rollout QA2.
Branch fix/production-deals-badge-20261014; base a1fa2822276cbef602e490aaaaf54abb040e958a. Full production backend SHA UNKNOWN: web marker7bae71a не соответствует всему backend. Нельзя объявлять production полным a1fa или заменять весь backend.
Observed: по шести screenshot deals определён driver5804eb84…; chat unread0 + no_bids notification3952/is_read0/created13.10.2026 23:45:56Алматы → badge1. Backend healthok/dbok. Source scheduler no_bids_notify_job, активный рейс18+часов безbid, cron every3hours.
Known-good: QA2a1fa canonical Deals type whitelist принят по runtime/source; ранее физически7ff read-to-zero Huawei/OPPO. Production native/iPhone acceptance pending.
Files: scripts/ops/production_deals_badge_patch.py, backend/tests/test_production_deals_badge_patch.py, tests/fixtures/production_badge_functions_20261014.json, этот журнал. Generated runtime patch: только api/notifications.py и services/push_sender.py; два SQL-фильтра NOT IN chat → IN existing DEAL_NOTIFICATION_TYPES. Сообщения, роли, active room rules, provider/ownership gates и история сохраняются.
Graphify AST11003nodes/24384edges; SQL parser отсутствует, SQL проверен непосредственно и SQLite tests. Generated graph внеgit.
Риск: неправильный whitelist мог скрыть настоящиеbid/status/chat unread; tests покрывают все10 canonicaltypes,5 unrelatedtypes, raw chat1→0, ownership, system/own/terminal/foreign filtering, standalone compatibility, read-history сохранение и fail-closed source/hash drift.
Before реальных production function fixtures:6FAIL/16PASS. Patched22PASS; локальный isolated SQLite, без production imports/startup/migrations.
Защищено: production DB/env/front/nginx/AI/Auth/FSM/прочиепроекты/QA2/ASC/build98/review. Генератор offline не deploy; exact expected SHA256 двух production files обязателен. Подмена broad source не допускается.
Deploy после независимого exact-head review/CI: code-only backup двухfiles + hash/env/front/protected-module inventory; fence PM2 API urtruck-security-api id3/pid2780551/cwd /home/ubuntu/urtruck/backend и scheduler id4. Restart только этихдвухпроцессов через существующийPM2, не ручнойuvicorn/kill. Native icon writer изscheduler тоже должен взять новуюформулу.
Rollback: восстановить только дваbackupfiles при совпадении own afterhash, restart тежеPM2 API/scheduler; DB/notifications/is_read/очередь не изменять/не откатывать. Наличие3952/is_read0 должно сохраниться, но вычисленныйbadge стать0.
Status PREPARED, НЕDEPLOYED. Review/CI/currentcommit и productionverification pending.
