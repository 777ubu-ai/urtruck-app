# UrTruck RC #190 — NO-GO gate

Дата: 2026-08-16
Branch: `agent/urtruck-fix-security-freeze-20260815`
Latest reviewed HEAD before docs gate: `f88f012bfc49b770a7517de10f02acda9e1233cc`
PR: #190

## Verdict

**NO-GO**

PR остаётся draft/review-only. Merge в `main` и production deploy запрещены до отдельного pre-production `GO` от Tom.

## Что подтверждено через GitHub

- PR #190 открыт и находится в draft.
- PR технически mergeable, но это не release approval.
- Branch ahead of `main` на 29 commits, без behind на момент проверки.
- Изменений много: 148 files, включая backend, security, GPS, iOS Pods, workflows, QA, Playwright, Maestro, frontend, package-lock.

## CI / GitHub Actions по `f88f012`

### PASS

- QA Center quick gate: PASS.
- QA Center Maestro flow contract: PASS по YAML/contract validation.
- Backend tests в PR Quality Gate: PASS.
- API and backend regression в Full QA Audit: PASS.
- Playwright mobile visual audit: PASS.

### FAIL / BLOCKER

- PR Quality Gate / Frontend tests and build: FAIL на шаге `Dependency audit`.
- Full QA Audit / Playwright desktop visual audit: FAIL на шаге `Run desktop Playwright suite`.
- Full QA Audit / Design, FSM and UX gate: FAIL на шаге `Release dependency and secret gates`.

## Dependency experiment performed

Проверен package-only override:

```json
"image-size": "2.0.3"
```

Результат: **FAIL**.

Причина: без синхронного обновления `package-lock.json` GitHub Actions падает уже на `Install dependencies`. Поэтому package-only override был отменён отдельным commit, чтобы не оставлять ветку в ещё более сломанном состоянии.

Вывод: исправление `image-size` должно выполняться через нормальный `npm install` / lockfile regeneration в локальном Codex/worktree или через полноценный dependency update pipeline, а не ручным изменением только `package.json`.

## Главные release blockers

### 1. Dependency audit / `image-size`

`package-lock.json` содержит `image-size@1.2.1`, транзитивно через `metro@0.81.5` (`metro` требует `image-size: ^1.0.2`).

Из advisory/NVD: `image-size` versions `1.1.0 <= 1.2.1` и `2.0.0 <= 2.0.2` affected; fixed version indicated as `2.0.3+` in NVD/VulnCheck records.

Нельзя делать `npm audit fix --force`, если он downgrade/ломает React Native/Expo/Metro.

Нужно одно из двух:

1. Safe remediation: доказанный override/resolution на безопасную версию с синхронным `package-lock.json`, затем `npm ci`, audit, Web build, Android, iOS, Playwright regression.
2. Documented accepted risk: доказать, что `image-size` используется только Metro/build-time и не reachable от production user input. Это не “fixed”, а accepted build-time dependency risk с upgrade ticket.

### 2. Desktop Playwright visual audit

Full QA Audit показывает FAIL на desktop Playwright suite. Нужно открыть HTML/report/log artifacts и исправить реальные failures либо обновить устаревший тест только после проверки product contract.

### 3. Design/FSM/UX release gate

Full QA Audit показывает FAIL на `Release dependency and secret gates`. Нужно выяснить точную причину. Пока gate красный — release NO-GO.

### 4. iOS simulator/device

iOS build/runtime evidence всё ещё должен быть подтверждён на актуальном HEAD после dependency decisions. Pods-only PASS не считается iOS PASS.

### 5. Maestro runtime/device

GitHub сейчас подтверждает YAML/contract validation, но это не полноценный runtime Maestro на устройстве/симуляторе. Release требует runtime evidence.

### 6. Production-smoke

Production-smoke intentionally отделён от local QA и должен запускаться только после deployment expected commit. Сейчас production-smoke на expected deployed SHA не пройден.

### 7. Yandex MapKit approval/key

В PR/GitHub нет доказательства, что Яндекс выдал approval или что production MapKit ключ активен и ограничен для Android package / iOS bundle / web domain. Нужно подтверждение из Yandex кабинета или владельца.

## Что нельзя делать

- Не merge #190.
- Не deploy production.
- Не переводить PR из draft в ready.
- Не игнорировать `npm audit` без reachability analysis.
- Не делать `npm audit fix --force`.
- Не ослаблять security ради зелёного CI.
- Не считать Maestro YAML validation полноценным device QA.

## Следующий порядок работ

1. Закрыть dependency audit корректно: safe override/remediation или documented accepted build-time risk.
2. Исправить desktop Playwright failure.
3. Исправить Design/FSM/UX release gate.
4. Повторить PR Quality Gate и Full QA Audit до PASS.
5. Получить iOS simulator build/install/launch evidence.
6. Получить Android/iOS runtime smoke evidence.
7. Запустить Maestro runtime.
8. Проверить GPS/map/docs/chat/push/CGR на final candidate.
9. Получить Tom pre-production `GO`.
10. Только потом обсуждать merge/deploy.

## Current release statement

UrTruck RC #190 ещё не готов к release.

Технически PR mergeable, но release-wise он **NO-GO** до закрытия всех blockers выше.
