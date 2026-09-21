# UrTruck — Engineering Standards & Quality Protocol

**Статус:** обязательный инженерный стандарт проекта.  
**Цель:** прекратить цикл «исправили одно — сломали другое» и сохранить доказанно
рабочий функционал при каждом изменении.

## 1. Главный принцип

Новая функция не считается улучшением, если она ломает существующую. Регрессия
ранее подтверждённого критического сценария — release blocker.

Приоритет решений:

1. сохранить known-good поведение;
2. найти первопричину;
3. внести минимальное изменение;
4. добавить/обновить тест;
5. доказать отсутствие регрессии;
6. только после этого merge/release.

## 2. Golden Baseline

Центральный реестр — `docs/GOLDEN_BASELINE.md`.

Он хранит только доказанные факты:

- exact SHA;
- PR/commit;
- CI run IDs и результаты;
- physical devices;
- production verification;
- known risks/blockers.

Запрещено заносить «работало раньше», «должно работать» или «10/10» без
проверяемого evidence.

Перед изменением Chat, Deal/FSM, Push, GPS, Map, Auth, Documents, Voice,
Translation/STT, Payments или Localization исполнитель обязан найти последнюю
known-good реализацию и сравнить её с текущей.

## 3. No Rewrite / Minimal Diff

Переписывание рабочего модуля с нуля запрещено по умолчанию.

Rewrite допустим только отдельным PR, где есть:

- доказанная причина невозможности безопасного ремонта;
- список поведения, которое обязано сохраниться;
- regression tests;
- migration/compatibility plan;
- rollback plan.

Одна задача не должна одновременно менять несвязанные домены. «Попутное
улучшение» оформляется отдельной задачей/PR.

## 4. Архитектурные границы

Критические домены должны сохранять явные контракты:

- Auth / Identity;
- Users / Profiles;
- Vehicles;
- Cargo / Trips / Offers;
- Deals / Deal FSM;
- Chat;
- Voice / STT / Translation;
- Documents / Attachments;
- GPS / Tracking;
- Maps / Routing;
- Push / Notifications;
- Border / CGR;
- Payments;
- Localization;
- Analytics / Observability.

Состояние сделки, рейса, unread, GPS tracking и payment не должно иметь
несколько конкурирующих источников истины.

## 5. Deal FSM

Любое изменение сделки проверяется минимум для:

- shipper/client;
- driver;
- unauthorized third party;
- repeated tap;
- slow/offline → online;
- app restart;
- push/deeplink;
- chat/documents/GPS;
- RU/ZH/EN и поддерживаемой KK.

UI не придумывает статус. Backend/FSM определяет допустимый переход.

## 6. Strong typing and contracts

Запрещены новые бесконтрольные `any`, `@ts-ignore`, `@ts-nocheck` и
нетипизированные критические payload. Исключение требует комментария и
обоснования в PR.

Изменение API требует проверки backward compatibility Android/iOS/web/backend.
Destructive DB/API changes без migration/rollback plan запрещены.

## 7. Git discipline

- прямые изменения `main` запрещены;
- feature/fix/hotfix/refactor/governance выполняются отдельными ветками;
- force push/delete protected branch запрещены;
- commit должен иметь один логический смысл;
- PR не смешивает UI, API и unrelated refactor.

## 8. Pull Request Definition

PR обязан содержать:

- цель и root cause;
- точный scope;
- затронутые/незатронутые модули;
- baseline/known-good reference;
- regression risks;
- тесты и точные результаты;
- UI screenshots, если менялся UI;
- device evidence, если требуется;
- rollback plan;
- blockers/known risks.

Автор не имеет права скрывать FAIL или заменять тестирование формулировкой
«должно работать».

## 9. CI quality gates

Канонические автоматические gates уже существуют:

- `.github/workflows/pr-quality-gate.yml`;
- `.github/workflows/quality-gate-reusable.yml`;
- `.github/workflows/qa-center.yml`;
- `.github/workflows/full-qa-audit.yml`;
- `.github/workflows/governance-contract.yml`.

Required checks должны оставаться fail-closed. Нельзя удалять/ослаблять test
gate только для прохождения конкретного PR.

Минимально защищаются backend regression, frontend unit/lint/build, security
subsets, mandatory web E2E, FSM/UX, localization, Maestro contracts и
Playwright desktop/mobile.

## 10. Critical Path

Критический путь UrTruck:

Shipper login → cargo create/publish → driver finds cargo → offer →
shipper receives/accepts offer → deal → chat → trip start → GPS →
map → international border when applicable → documents →
driver Delivered → shipper Received → Completed → rating/archive.

Поломка пути = release blocker.

## 11. Chat / Voice / Translation golden checks

После затрагивающих изменений проверять:

- text RU/ZH/EN;
- ordering, retry, duplicate prevention;
- unread/badge;
- photo/document;
- voice 55–60 sec;
- STT;
- RU↔ZH translation и требуемые направления;
- persistence after restart;
- offline/reconnect;
- push/deeplink.

Server 200 не заменяет device verification.

## 12. Push golden checks

Проверять foreground/background/killed, sound, badge, token rotation,
stale token, duplicate protection и deeplink для ключевых событий сделки.

Факт постановки сообщения в outbox/FCM не равен факту доставки на устройство.

## 13. GPS / Map golden checks

Проверять start-trip consent, foreground/background, screen off, stationary,
movement, 15/30 min, offline FIFO, reconnect, GPS OFF→ON, lost→restored,
terminal stop, unauthorized access и in-app map.

Контрактный тест не заменяет физический Android/iPhone QA.

## 14. Security

Проверять owner/counterparty/third party. Чужие deals, chat, documents,
coordinates и private data недоступны.

RLS/IDOR/auth/token/storage regression — P0/P1 blocker.

Секреты запрещены в репозитории и логах.

## 15. Localization

Пользовательские строки должны проходить канонический i18n/locale QA.
Смешение языков, raw keys или недопустимый fallback на критическом экране
являются regression.

## 16. UI / Visual regression

Утверждённый UI — часть baseline.

Unrelated change не должен менять navigation, tabs, spacing, buttons, colors,
headers, cards или typography.

UI PR: before/after screenshots + Playwright/Maestro evidence по применимости.

## 17. Bad network / Idempotency

Deal creation, offer acceptance, status transitions, messages, documents,
payments, push jobs и GPS batches должны безопасно выдерживать retries.

Repeated tap/request не создаёт дубль бизнес-сущности или события.

## 18. Root Cause Protocol

Для P0/P1/P2 фиксировать:

1. что произошло;
2. первопричина;
3. почему тесты пропустили;
4. исправление;
5. regression test;
6. затронутые сценарии;
7. повторная проверка.

## 19. Stop-the-Line

Если обнаружена регрессия known-good:

1. остановить unrelated development;
2. определить first bad commit;
3. сравнить с baseline;
4. fix или rollback;
5. добавить regression test;
6. повторить затронутые gates;
7. продолжать только после PASS.

## 20. Release

Перед release:

- code freeze для новых feature;
- все required CI green;
- physical mobile QA для затронутых device-dependent функций;
- production smoke;
- monitoring check;
- exact release SHA;
- rollback readiness.

P0/P1, login failure, broken deal lifecycle, critical chat/push/GPS/doc/security
failure блокируют release.

## 21. Definition of Done

DONE только если одновременно:

- scope реализован;
- tests обновлены;
- старые required checks PASS;
- regression проверена;
- security проверена по применимости;
- physical QA выполнен по применимости;
- production проверен по применимости;
- blockers явно перечислены;
- exact SHA записан.

Фразы «код написан», «build зелёный», «у меня работает», «API 200» не являются
Definition of Done.

## 22. Правило 10/10

10/10 — не настроение и не оценка автора. Это состояние с доказательствами.

Нельзя утверждать 10/10, если обязательный physical/device/production пункт
имеет статус PENDING, FAIL, UNKNOWN или NOT VERIFIED.

## 23. AI coding agents

Codex/Claude/Cursor/ChatGPT и другие агенты обязаны соблюдать этот же протокол.

Запрещено агенту:

- начинать заново без анализа существующей реализации;
- переписывать known-good ради удобства;
- менять unrelated files;
- удалять непонятный код без dependency/history analysis;
- выдумывать результаты тестов;
- называть задачу готовой без evidence.

Первое действие агента — чтение `AGENTS.md` и Golden Baseline, затем PRE-FLIGHT.

## 24. Финальный отчёт

Формат:

```text
Branch:
Commit SHA:
Base SHA:
Baseline SHA:

CHANGED:
PROTECTED / UNCHANGED:
TESTS:
PHYSICAL DEVICES:
PRODUCTION:
REGRESSIONS FOUND:
REGRESSIONS FIXED:
KNOWN RISKS:
BLOCKERS:
FINAL STATUS: PASS / PARTIAL / BLOCKED
```

Только факты.
