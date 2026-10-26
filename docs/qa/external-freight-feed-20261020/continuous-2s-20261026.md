# Быстрое обновление внешней ленты QA2 — 26.10.2026

## PRE-FLIGHT

- Base branch/SHA: `qa2/integration-candidate` / `c11b47e58a30e05e07eb592714a06333372a5c65`.
- Known-good: QA2 bridge timer `OnUnitInactiveSec=20`, mobile external-feed refresh `20000 ms`; latest backend feed parser deployed at `c11b47e58a30e05e07eb592714a06333372a5c65`.
- Scope: `src/screens/ExternalFreightFeedScreen.js`, QA2-only systemd timer configuration workflow, timer template and this evidence log.
- Protected: Production, collector/publisher cadence, source allowlist, review classification, database rows, app data, store releases.
- Change: foreground feed polling and QA2 incoming bridge timer to 2 seconds. Telegram's event handler remains the first intake path; the 60-second historical reconciliation remains unchanged to avoid Telegram FloodWait.
- Risk: more foreground feed API reads and more frequent QA2 bridge process wakeups. API calls remain serial per visible screen; bridge skips its network request while the outbox is empty.
- Checks: PR quality gate, focused feed refresh contract, protected QA2 timer workflow, systemd timer state and one QA2 bridge oneshot. Production version fingerprint must match before/after.
- Rollback: set feed refresh to `20000 ms`, restore `OnUnitInactiveSec=20`, restart only `urtruck-qa2-feed-bridge.timer`. Do not restore or delete SQLite data/outbox.

## Результат

Изменения и развёртывание будут записаны после прохождения CI и запуска защищённого QA2 workflow. Интервал означает частоту проверки, а не гарантию, что новое объявление придёт каждые две секунды: скорость поступления зависит от Telegram.
