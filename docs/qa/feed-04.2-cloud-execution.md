# FEED-04.2 — проверка установщика в облачной среде
Дата: 31 октября 2026, Asia/Almaty.
PRE-FLIGHT: fix/urtruck-feed-audit-20261030, исходный SHA 787ef5abae8baf885334901704a9300eb8db31e8. Known-good runtime UNKNOWN. Production SHA UNKNOWN.
Scope: scripts/qa/deploy_external_feed_candidate.sh и tests/frontend/test_qa2_external_feed_deploy_workflow.mjs. Backend, схема данных, collector, UI и устройства не изменяются.
Rollback: revert этого отдельного коммита; данные не меняются.

## Исправлено
Preflight больше не подставляет ожидаемый режим вместо отсутствующего EXTERNAL_FREIGHT_SOURCE_MODE: runtime bridge при отсутствии этой переменной выбирает published. Обязательны явные incoming/owned для соответствующих конфигураций.
Preflight теперь требует EXTERNAL_FREIGHT_IMPORT_ENABLED в одном из поддерживаемых runtime значений 1/true/yes. Отключённый импорт больше не проходит эту проверку готовности.
Отказ происходит до резервного копирования, установки кода и перезапуска QA2 units.

## Проверено
node --test tests/frontend/test_qa2_external_feed_deploy_workflow.mjs: 6 PASS, 0 FAIL. Четыре новых теста исполняют настоящий Python-блок preflight в изолированных временных каталогах без SSH: валидные настройки, отсутствие режима, неверные/переставленные режимы, отключённый/отсутствующий флаг.
Контроль на исходной логике: 4 PASS, 2 FAIL; восстановлена исправленная версия.
bash -n scripts/qa/deploy_external_feed_candidate.sh: PASS.
Это адресная локальная проверка, не полный backend/CI и не реальный deploy.

## Блокеры
GitHub run 41199502137 для исходного SHA: три обязательных job завершились failure без доступных выполненных steps. В описании PR зафиксировано сообщение о billing lock; в этой проверке платёжное состояние самостоятельно не читалось и не менялось.
В текущем executor не настроены SSH identity/host credentials, нет подключённых устройств или снимка исходной базы с обезличенными сообщениями. Прямой QA2 deploy, два часовых замера, ручная разметка и физическая приёмка не выполнены.
Существующий отчёт docs/qa/feed-04-classification-sample.md содержит агрегаты по реальным сообщениям, но не сохраняет сами примеры: это не независимая разметка.
Штатный workflow сохраняет обязательный gate и QA2 environment protection. После доступности CI: gate на финальном кандидате, PR promotion, scoped QA2 deploy, версии компонентов, два часовых баланса и проверка обеих клиентских лент.
Статус: PARTIAL / BLOCKED. Восстановление incoming не заявляется.
