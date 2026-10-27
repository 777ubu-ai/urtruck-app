# Актуальный QA2 TestFlight для iPhone — 27.10.2026

## PRE-FLIGHT

- Branch/SHA: `fix/qa2-testflight-current-pr-20261027` / `155aad837a19386fd38c44f9186e9e466942549c`.
- Known-good Huawei: `com.urtruck.app.qa2`, версия `1.0.9-qa2`, `versionCode=214494471`, физический экран ленты — 13 089 карточек.
- Известная iOS QA2 сборка: `1.0.12 (113)`, PR #605 merge `dc982a291c5f0190612710b20da2be925bd5aa91`, API `qa2.urtruck.kz`, успешный TestFlight upload 25.10.2026.
- Подключённый iPhone: `com.urtruck.app`, версия `1.0.12`, build `114`.
- Scope: release guard `.github/workflows/testflight-rc.yml`, его симуляционный тест `tests/frontend/test_owner_internal_release_guards.mjs` и журнал этой QA2 процедуры; разрешить проверенный merge любой указанной QA2 PR, а не навечно фиксировать PR #605.
- Защищено: production endpoint/БД, App Store production release, backend data и Android Huawei build. Новый iOS candidate должен строго включать `https://qa2.urtruck.kz`.
- Проверки: PR quality gate; exact branch/SHA; PR merged to `qa2/integration-candidate`; descendant от принятого PR #605; required CI check runs; QA2 host; monotonic EAS/ASC build numbers; signature/entitlements/config; TestFlight submission.
- Rollback: не устанавливать QA2 candidate на iPhone; текущий build 114 остаётся. Backend и production data не меняются. Тестовый билд удаляется/не устанавливается из TestFlight, если конфигурация не проходит.

## Причина расхождения

Снимок iPhone показывает 3 357, а физически подключённый Huawei в той же ленте показывает 13 089. Huawei установлен как отдельный QA2 application. Поэтому одинаковый аккаунт не гарантирует одну базу: счётчик берётся с API, зашитого в binary.

## Изменение release guard

25.10.2026 TestFlight workflow был привязан к merge SHA PR #605. После merge PR #622 QA2 branch продвинулся до `155aad837a19386fd38c44f9186e9e466942549c`; старый guard корректно отказал в сборке устаревшего SHA. Обновлённый guard принимает номер merged QA2 PR и требует совпадения его merge SHA с кандидатом, успешных проверок head-коммита и ancestry от первоначально разрешённого PR #605.
