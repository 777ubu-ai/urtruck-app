# UrTruck — Engineering Constitution & Anti-Regression Protocol

Статус: обязательно к исполнению.
Приоритет: выше локальных задач и временных решений.
Область: Backend, Web, Android, iOS, Database, Push, GPS, Maps, Chat, Documents, Localization, CI/CD и AI-агенты.

## 0. Golden Rule

**Не ломать то, что уже работает.**

Регрессия ранее принятой функции — P0/P1 blocker. Она запрещает merge, deploy,
production build, публикацию и формулировку «10/10».

Сначала сохранить рабочее. Затем вносить минимальное улучшение.

## 1. Обязательное чтение

До изменения кода исполнитель читает:

1. `AGENTS.md` и `CLAUDE.md`;
2. этот документ;
3. `docs/GOLDEN_BASELINE.md`;
4. `docs/CURRENT_PRODUCT_CANON.md`;
5. `docs/CURRENT_ENGINEERING_CANON.md`;
6. `docs/DEAL_FSM.md` и `docs/RELEASE_CHECKLIST.md`, когда они существуют;
7. связанные тесты и ранее утверждённые UI/UX решения.

Без PRE-FLIGHT код не меняется.
## 2. PRE-FLIGHT

Перед работой фиксируются: задача, branch, HEAD, base SHA, подтверждённый
production SHA, затрагиваемые и защищаемые модули, риски, существующие тесты,
known-good реализация и план минимального изменения.

Если production SHA не подтверждён, это указывается как UNKNOWN.

## 3. Golden Baseline и No Rewrite

Для принятой функции сначала найти known-good SHA и evidence, сравнить код,
определить причину деградации и восстановить существующую реализацию.
Переписывание Chat, Deals, FSM, Push, GPS, Maps, Auth, Documents,
Translation, Voice, Payments и Notifications с нуля запрещено без отдельного
архитектурного решения, regression plan и rollback.

## 4. Change Isolation

Одна причина — один патч — один набор тестов. Нельзя попутно менять несвязанные
модули, дизайн, зависимости или FSM. Побочное улучшение становится отдельной
задачей.

## 5. Источники истины

Backend определяет Deal, Offer, Trip, GPS, unread, payment и document access.
FSM определяет допустимые переходы. UI только отображает авторитетное состояние.
API-изменения сохраняют backward compatibility старых клиентов.
## 6. Git, PR и review

Запрещены прямые commits в main/master/develop/production/release, force-push
и удаление истории. PR содержит описание до/после, scope, риски, тесты,
скриншоты, результаты платформ и rollback.

Автор не подтверждает критическую работу единолично. Для Auth, Security,
Database/RLS, Payments, FSM, GPS, Documents и production infrastructure
требуется усиленное review. Новый commit сбрасывает устаревшее approval.

## 7. CI quality gate

Обязательные проверки: install, format, lint, typecheck, secret scan, backend
unit/integration, API contracts, RLS/security, FSM, frontend, localization,
web build, Android validation/build, iOS validation, Maestro, Playwright и
critical regression path. Любой FAIL блокирует merge.

## 8. Critical path

Shipper login → cargo create/publish → driver offer → push → accept → deal →
chat → trip start → GPS → map → border → documents → delivered → received →
completed → rating → archive.

Падение любого шага — release blocker.

## 9. Golden physical tests

Chat: RU/ZH/EN text, photo, document, voice 55–60 s, retry, offline/reconnect,
ordering, unread, push/deeplink, STT, RU↔ZH, persistence.

Push: foreground/background/killed/locked, sound, badge, deeplink, token
rotation, duplicates and all critical business events.
GPS: start, foreground/background/screen-off, 15/30 min, stationary/movement,
offline FIFO, recovery, killed/headless limits, permission denial, GPS OFF→ON,
signal lost/restored and terminal stop.

Security: owner, counterparty and unauthorized third party. Любая утечка deal,
chat, GPS, documents, phone или private file — P0.

## 10. Design protection

Утверждённый UI — часть Golden Baseline. Unrelated change не меняет spacing,
buttons, colors, navigation, headers, icons, tabs, cards и typography.
UI PR требует BEFORE/AFTER screenshots и mobile visual regression evidence.

## 11. Data and dependencies

Database меняется только миграциями с backup, rollback, RLS и compatibility.
Idempotency обязательна для deal, offer accept, statuses, messages, documents,
payments, push jobs и GPS batches.

Обновление Expo, React Native, navigation, push SDK, Supabase SDK или MapKit —
отдельная задача с breaking-change audit, rollback и full regression.

## 12. Stop the line

При регрессии: остановить новую разработку, записать defect, найти first bad
commit, сравнить с Golden Baseline, исправить/rollback, добавить тест и повторить
затронутый critical path. Симптом без root cause не закрывает дефект.
## 13. Physical devices и release

Эмулятор не заменяет физическое устройство. Android PASS не переносится на iOS.
Без iPhone допустим только статус «Android QA PASS; iOS pending».

Перед production вводится Code Freeze: разрешены только release blockers.
Hotfix не содержит refactor, redesign, dependency update или новую функцию.

## 14. Definition of Done

DONE требует одновременно: scope соблюдён, typecheck/lint/unit/integration/
regression/security/E2E PASS, screenshots reviewed, требуемый physical QA,
production smoke где применимо, monitoring checked, no new P0/P1 и SHA записан.

«Код написан», «build зелёный», «API отвечает» и «должно работать» не являются
доказательствами.

## 15. Статус 10/10

10/10 допустим только при Critical Path, Chat, Push, GPS, Maps, Documents, FSM,
Security, Localization, Android, iOS, Web и Production PASS одновременно, без
P0/P1 и известных critical regressions.

## 16. Формат отчёта

Branch, Commit SHA, Base SHA, Production version, CHANGED, PROTECTED, TESTS,
PHYSICAL DEVICES, PRODUCTION, REGRESSIONS FOUND/FIXED, RISKS, BLOCKERS и
FINAL STATUS: PASS / PARTIAL / BLOCKED. FAIL скрывать запрещено.

## 17. AI rule

AI обязан определить baseline, архитектуру, affected modules, tests и known-good
реализацию. Запрещено начинать заново, переписывать без разрешения, менять
unrelated files, удалять непонятый код и заявлять результат без evidence.
