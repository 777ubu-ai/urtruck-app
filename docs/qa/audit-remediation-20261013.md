# Исправления аудита 13.10.2026 — PRE-FLIGHT

Branch: fix/audit-remediation-20261013
Starting HEAD: 1302c3cb7aa75dba137cf7040def379e1cc22385
Base release: 644591cab3c508053ec677975670d389b6ce2c83
Production SHA: UNKNOWN; данные/runtime не меняются.
Known-good: build 97 / 7ee5e908 — исторические проверки; новые дефекты открыты. PR519 — исходный патч current-session 401.
Scope: geography/picker, EditProfile/черновики, push safe area/privacy, keyboard frame, guest entry, transactional status events/outbox; QA2 отдельно.
Checks: новые поведенческие regressions, штатный frontend loader, изолированная backend БД, lint/build, exact-head CI, физическая приёмка отдельно.
Rollback: новые commits в отдельной ветке; revert отдельных патчей. Нет deploy/DB изменений production.
Graphify: AST-only, 10815 nodes / 23766 edges; SQL parser отсутствует, SQL проверяется вручную и backend tests. Навигация/AuthContext/marketplace — высокий риск. Пользователь 13.10: «Исправляй все», разрешение на перечисленные дефекты; релиз не входит.

Статус: IN PROGRESS. 10/10 не подтверждено.

## Подготовленный кандидат

- 87f1d3d: GeoNames офлайн 34162 города / 244 country codes, сохранение curated routes, country-scoped search, manual ISO fallback. Для 6 ISO в основном списке нет записей cities15000: AQ/BV/IO/HM/TK/UM; ручной ввод доступен. Справочник не обещает все населённые пункты; UI лимит 80 строк, поиск по полному набору. Дополнительный source payload ~3.1 MB; оценка latency на физическом устройстве pending.
- 00ab6e9: failed profile save не закрывает форму/черновик, local mirror только после success; hydration защищает изменённые поля; страна выбирается; contact_email отдельный от login email. Ошибки phone change видны в поле. Migration nullable contact_email, runtime checks existence; production не применялась.
- d87a7a1: iOS KAV учитывает измеренный origin родителя (высота не участвует в feedback); push banner safe-area; guest cargo entry и private translation cache logout cleanup.
- b0eac1d: статус, notification, outbox, timeline и system message в одной транзакции; fast provider send после commit, worker retry сохранён. Общий _transition_deal применяется и к legacy trip-status path.
- Патч current-session 401 из PR519 включён в базу кандидата; физический logout/relogin pending.

## Проверки

- Backend canonical `run_backend_tests.sh --isolated --disable-warnings`: exit 0, 132 test modules; 131 pytest summaries, суммарно 1132 passed, failure markers 0. Один модуль запускался standalone. Не прибавлять standalone assertions к числу pytest tests.
- Целевой backend: 64 passed. Новые failure-injection: provider failure сохраняет queue/timeline; queue-storage failure откатывает status/tracking; повтор не дублирует события. Contact email не меняет login identity.
- Полный frontend: 1174 passed / 0 failed до последней точечной дедупликации geo search. После финальных geo-only guards связанный geo/regression набор: 11 passed / 0 failed (alias duplicate, country-tab search, approved-country filtering).
- Первоначальный целевой frontend: 51 passed. Два первоначальных failure были устаревшими shape expectations safe-area/phone handler; harness обновлён, поведенческие проверки сохранены.
- Локальный Playwright profile-save-recovery: 8 passed, desktop 1440px/mobile 393px. API mocked; не считать physical native или real email acceptance. Регрессия EditProfile дополнительно выполняется фактическим extracted finishSave, failure matrix 401/422/500/network.
- lint: 495 active JS parsed PASS. i18n: 2025 keys ×4, missing 0. ZH existing corpus PASS. Maestro contract 70 flows PASS (не physical execution).
- Финальная post-geo web build PASS; bundle 9.6 MB (uncompressed), обязательные статические источники присутствуют.
- Full backend и frontend содержат предупреждения; они не объявлены исправленными.

## Не закрыто

Независимый усиленный review Auth/DB/FSM, exact-head CI, physical iPhone/Android на новых сборках, полный real push/GPS/deal flow. iOS keyboard correction — SOURCE/UNIT verified; physical fix ещё не подтверждён. QA2 APNs app identity у зарегистрированных iOS устройств отсутствует (app_id NULL), поэтому topic/credentials не подставлялись наугад. QA2 AI timeouts требуют отдельного runtime анализа/приёмки; production OpenAI не менялся. Старый App Store build97/review не изменён. Никакого GO/10 из 10 или production rollout этим отчётом не выдано.

Финальная географическая проверка добавила два соседних guard: country-tab search показывает города выбранной страны; глобальный поиск исключает неутверждённые ISO-коды из внешнего источника. Code snapshot: 6e9a267. Draft PR #520. Итоговые CI/gates проверяются на текущем HEAD PR; результаты старого SHA не переносятся.
