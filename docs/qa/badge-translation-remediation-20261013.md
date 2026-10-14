# QA2: исправления badge и RU→EN 422 — PRE-FLIGHT

Branch: fix/audit-remediation-20261013. Starting SHA: 2ff51d4281c436e7d9bf9af65957149526321443.
Владелец 13.10.2026 разрешил исправить перевод и зависший badge с проверкой QA2. Production и магазины не входят в разрешение.
Known-good: actual QA2 Huawei agent-boris/client и OPPO agent-serik/driver: chat unread 0, canonical badge 27 = 24 reminder + 3 review. Нативные push/GPS и iPhone не приняты.
Scope: backend/api/notifications.py, backend/qa_ai_service/quality.py и адресные backend regression tests; этот журнал. Изменение вспомогательного AI pipeline допустимо только если фактическая модельная диагностика докажет необходимость.
Protected: production runtime/env/DB, секреты, неизменяемая история уведомлений, права доступа, quality gate, клиентские UI/native SDK, реальные сделки.
Graphify AST-only: 10970 nodes /24242 edges; SQL parser отсутствует, SQL проверяется непосредственно и backend tests. Связанные функции unread_badge_count→push_sender._compute_recipient_badge и repair_logistics_translation→QA2 AI translate/memory revalidation прочитаны.
Checks: regressions исключения reminder/review при сохранении истории, unread message/bid/read-to-zero, other user/room isolation, callback/native badge contracts; реальные raw NLLB hypotheses сообщения QA4FC/398; semantic contradiction/exception, price/date/weight/IDs, текущая translation-memory матрица; fresh CI/review и QA2 Huawei/OPPO API/UI.
Rollback: before deploy копия только изменяемых backend/AI runtime files + source markers; восстановить эти файлы и перезапустить только urtruck-qa2.service / urtruck-qa2-ai.service. Данные и очередь не откатывать и не удалять. Production fingerprint сравнить до/после.
Status: IN PROGRESS. Не DONE/10 из 10; новая mobile build/review не запускалась.

## Установленные причины и минимальный патч

- Badge: данные на физических Huawei/OPPO: chat unread 0, badge 27 = 24 reminder +3 review. unread_badge_count считал все non-chat rows. Теперь включаются только существующие DEAL_NOTIFICATION_TYPES плюс тот же raw unread активных комнат. Общая история и is_read напоминаний/отзывов сохраняются; push_sender пользуется той же формулой.
- Перевод: read-only QA2 message398 — контрольный QA4FC RU test с ценой1270 USD, датой18.10.2026, маршрутом Алматы—Астана, весом21 т и запретом разгрузки без подтверждения. Однократный private model inference получил три raw NLLB гипотезы с корректным «Not to be unloaded without confirmation». Все три отвергались только как unloading_condition_flipped.
- Первопричина: два regex rf-string с {0,24} интерполировали tuple(0,24), не квантификатор. Теперь пассивный запрет использует имеющийся _EN_UNLOADING_GAP; эта же граница исключает and/but/or/второй unload. Модель, provider, словари фактов, safety gate и public error payload не заменялись и не ослаблялись.
- До патча: воспроизведение badge —1 FAIL (27 вместо0); реальные модельные fixtures —3 FAIL. После патча:164 scoped pytest PASS, включены badge, quality gate, local AI client и translation memory/engine. Сохранены проверки противоречий, отрицания, исключений, price/date/weight/cities/IDs.
- Сырые результаты только контролируемого QA message сохранены на Mac в /private/tmp/urtruck-controlled-model-398-20261013.log; auth/user tokens и другие сообщения не записывались.

Полный isolated backend: exit0,132 pytest summaries,1223 passed,FAIL/ERROR markers0; compileall PASS. Standalone assertions не прибавлялись к pytest-сумме. Adjacent notification/path/history tests:20 PASS. CI/review нового SHA, QA2 deploy и physical retest pending.

Сверка runtime до deploy: backend/AI .qa-source-sha=2ff51d4; notification/quality file hashes совпадают с исходной базой. AI /health отдавал устаревший source_sha7ebf2ed из systemd Environment, несмотря на новый .qa-source-sha. При новом QA2 deploy нужна синхронизация AI source metadata через отдельный systemd drop-in; base unit/env secrets не менять. Production /api/version1.0.50 /2026-10-10 05:23; контрольные production hashes сохранены для сравнения.
