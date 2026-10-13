# UrTruck: интеграция релиза 14 октября 2026

База: `a1fa2822276cbef602e490aaaaf54abb040e958a`. Ветка: `release/consolidated-20261014`. Это реестр выбранной композиции, а не сертификат готовности магазинов. Final SHA/tree, результаты CI/review и физической проверки записываются в устойчивом dossier `qa-evidence/release-consolidation-20261014` после проверки exact head.

## Состав

PR519/520, QA2 `2ff51d4` и cargo timeout уже ancestors базы. PR521 включён merge с происхождением: guest cold start, verified без роли, optional messenger обеих ролей и сохранение формы при verification_required. Обязательные имя/телефон, проверка роли и текущий профиль API сохранены. PR522 включён как offline hotfix recipe с historical fixtures; актуальные `notifications.py` и `push_sender.py` не заменены. PR523 включён с доверенным runtime manifest, проверкой candidate transition до overlay, listener→PM2 и ограниченным stopped recovery. Все решения, зависимости и индивидуальный откат: `integration-ledger.json`.

Шесть незакоммиченных файлов сверены с snapshots, хеши совпали. Push patch уже вошёл, база содержит более новую обработку permission race и SafeAreaView. GPS-тесты byte-equivalent. QA2 controller DEFER: чужой конфликт и отдельное окружение; stages сохранены. Generated native folders и node_modules не переносились. Исторический resubmit97 не используется для отправки нового кандидата.

## Проверки и защищённые контракты

PRE-FLIGHT: `preflight.json`; свежий Graphify: `graphify-summary.json`. Local scoped: 54 frontend и 75 backend tests прошли на combined source `0e78dab2a4615ef070a70da64bbd160028919032`. Эти результаты не являются full CI или physical PASS. Final combined head требует shared CI и независимого review. Новый commit отменяет approval старого exact SHA.

Защищены Auth/session owner, privacy, signed documents, FSM, GPS lifecycle/disclosure, unread cursor, badge whitelist, retry/idempotency, token ownership и строгий translation quality gate. Profile response shape, SDK/dependencies, native capabilities и DB schema относительно базы не изменены. RU/EN/ZH/KK copy меняется только в затронутом onboarding. Новый client source требует новой iOS сборки; IPA98 содержит только a1fa282. Android установленный code213720253 пока без подтверждённого sourceSHA.

## Окружения и единственный writer

Production full backend SHA остаётся UNKNOWN/mixed до live сверки. QA2 на a1fa282 и iOS98 production — исторически разные окружения. Backend/AI/web/native artifact identities записываются раздельно; одного web marker недостаточно.

Push этой интеграционной ветки сам по себе не запускает production writer, Android build или Play upload. Main автоматически запускает `deploy.yml`, Android и `deploy-play.yml` по их triggers; merge в main до code freeze/готовности запрещён. Normal caller `secure-production-deploy.yml` принимает только успешный UrTruck Deploy на main. Break-glass caller закреплён на writer в `refs/heads/main`, требует существующего audited guard. Обе схемы используют `production-deploy-execute.yml`; новый writer не создаётся. Guard этой ветки ещё не активирован в main.

Текущий mixed production не имеет trusted baseline. Первый переход требует отдельного reviewed исполнителя/протокола: свежий fingerprint и stop при drift, актуальный durable backup code/config/consistent DB, учёт legacy consumers и extra runtime files, чистая staged source композиция, сохранение env/storage/DB/signing, ограниченные additive schema действия и доказанный code rollback. Генерация trusted manifest поверх неизвестного live кода запрещена. Overlay не удаляет runtime files; removal/rename требует предварительной staged migration. Working foreign listener не обходится. Recovery допустим только при пустом порте, unique named PM2, PID0/stopped/errored и совпадающем cwd; финальная проверка требует живого named PM2 PID без recovery flag.

Историческая schema rehearsal из ТЗ не переносится автоматически: изменения final backend относительно a1fa282 ограничены profile validation, но нужно прочитать оригинальные records и подтвердить startup composition, backward compatibility и code rollback final candidate. Новые пользовательские данные нельзя перезаписать старым SQLite snapshot. Legacy Expo transition ещё PENDING: dual mode/59 enabled rows из ТЗ требуют live freshness/ownership и совместимости клиентов, без ручного включения logout/invalid tokens.

## Матрица выпуска

| Этап | Текущее ограничение |
| --- | --- |
| Full shared CI / independent exact-head review | PENDING до актуальных результатов |
| QA2 exact final runtime | PENDING |
| Android physical | OPPO PJB110/Android14 доступен ADB; installed1.0.9/code213720253, final source не доказан |
| iOS physical | iPhone15ProMax Bah2 unavailable при live inventory; PHYSICAL_PASS отсутствует |
| Auth/profile/core flow/push/GPS30min | Требуется actual final artifact, оба owner/роль/API host и evidence |
| Production migration/schema/rollback | PENDING, writes не выполнены |
| IPA/AAB final source/signing/hash | Не созданы; номера сначала сверить с ASC/Play/EAS |
| Скриншоты и reviewer | 10 COMPLETE Apple assets сохранены по ТЗ; live/визуальная сверка, затронутый onboarding и reviewer login PENDING |
| Declarations Android / demo video | PENDING actual AAB и подтверждённых сведений |
| Apple/Play submission | Не выполнялись; historical выбранный97 не является final candidate |

До доказанного noP0/P1, exact SHA CI/review, freeze, data compatibility/rollback, physical core matrix и store readback отправка блокирована требованиями владельца. AFTER_APPROVAL, upload, submitted, approval и publication фиксируются отдельными фактами. Проверки monitoring15/60/180 минут возможны только после реального production изменения и не считаются заранее выполненными.

## Исправление независимого review

Review d6d2485a выявил P1: unsafe destination нового runtime файла мог быть обнаружен лишь после writes. Guard теперь read-only проверяет каждый candidate destination и все parents до первого write; baseline inventory отклоняет dangling runtime file symlinks и symlink directories. Добавлены семь регрессий, всего44 stdlib tests PASS. Existing writer/recovery order, protected storage/venv/env и source contracts сохранены. Финальный новый SHA требует свежего review и полного CI.

## Продолжение

Получить оригинальный актуальный `UrTruck-pre-review-checkpoint-2026-10-13.md` (поиск local/Desktop/Documents/~/.codex и /private/tmp не нашёл), завершить exact-head gates и восстановить физический доступ iPhone. Новые сборки только после source freeze и подтверждения необходимости. Общий10/10 и фактический выпуск не объявлены.
