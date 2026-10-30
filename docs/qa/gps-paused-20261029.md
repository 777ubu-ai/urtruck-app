# GPS временно приостановлен — 29.10.2026

## PRE-FLIGHT
- Branch: fix/gps-paused-20261029; base SHA: 3cd723e23cfb84d4b729aa1b0a50df1051a09235 (QA2). Production runtime и версии пользователей UNKNOWN.
- Решение владельца: временно отключить GPS; оставить плановый маршрут и доступный километраж, без постоянной работы.
- Known-good: исходник map-only/snapshot; исторические PASS на патч не переносятся. Graphify AST-only до изменения: 15383 узла/31626 связей; SQL parser отсутствует, два Gradle partially parsed. Backend/Gradle не меняются.
- Scope: GPS policy, capture/send guards, hook, status entry, маршрутные представления и location menu. Защищены auth, chat/voice/translation, push, documents, backend FSM/roles, database/import.
- Проверки: paused и сохранённый включаемый режим, native stop, snapshot start, обе роли и 4 языка, navigation/background/abort, routing/payload_t, protected baseline.
- Rollback: revert одного PR. Данные и очередь не удалять; включение GPS — отдельное проверенное обновление.

## Результат в коде
- GPS_TRACKING_PAUSED=true блокирует получение/отправку координат и новые native permission prompts до API/очереди/сети. Hook не создаёт GPS poll/fix/post; сохранена остановка прежнего native background task при входе и через headless callback.
- Три маршрутных представления монтируют PlannedRouteSummary вместо карты/MapKit: один запрос по городам и payload_t при показе, без GPS, интервалов и повторов. Blur, background и unmount отменяют запрос; поздние ответы не применяются.
- Только положительный конечный distance_m успешного routing API отображается как километраж. Нет данных — недоступность, без выдуманного прогресса/остатка/позиции.
- Старт рейса: capability-запрос и действующий status API с capture_mode=snapshot, без GPS-разрешения/health/fix. Несовместимый backend не переводит рейс молча в continuous. Серверные роли и FSM сохраняются. Snapshot исключён из continuous gps_lost watchdog. Прежний однократный перевод старых continuous-рейсов в snapshot при входе сохранён.
- Скрыты отправка геопозиции и определение города по GPS; ручной выбор города сохранён. Предупреждение RU/KK/ZH/EN. Оригинальная карта и GPS доступны для последующего отдельного включения.

## Проверки и ограничения
- Финальные связанные проверки: 158 PASS, 0 FAIL — pause/однократный маршрут, native cleanup, GPS/logout/queue legacy, start/capability/status confirmation, menu обеих ролей, payload_t, protected baseline, foreground polling idle.
- Lint 596 JS PASS; diff --check PASS.
- Первый полный frontend-прогон не PASS: отсутствуют react, sucrase, country-flag-icons, @react-navigation/routers, @supabase/supabase-js. VM-harness нового флага и ожидание history исправлены, включены в финальные 158 PASS. Полный install/build/CI требуется.
- Исходный protected baseline не перезаписан. Отдельное именованное исключение хешей трёх разрешённых GPS-файлов; остальные protected hashes проверяются как прежде.
- Физические Android/iPhone, энергия, живой сервер, production и магазины NOT VERIFIED. Предыдущий доступ к Mac остановлен месячным лимитом Desktop Commander, команды не повторялись. Процент экономии и причина жалоб не установлены.
- Старые binaries не получают этот патч от PR/server deploy: нужны новая сборка и физическая приёмка. Новую сборку и rollout не запускали. Чат и уведомления продолжают сетевую работу.
- Отдельный PR651 удаляет интервалы внешней ленты; этот GPS-патч его не дублирует.
