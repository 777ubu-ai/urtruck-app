# Публичный выпуск UrTruck — 28.10.2026

Branch/SHA: qa2/integration-candidate, проверенный удалённый HEAD 88e349531a3cc8777b95e09b65fb6ebfb8dc29cc; отдельный checkout detached HEAD того же SHA.
Known-good: PR635 source 4402b6ba42d9b1c4ffbc1b9fee4bf2abc220e13b, CI40702441326 PASS 3/3; дерево 8e26cc5923107ac4e72e1ea7ae7fd21ae861fdb8 совпадает. Это не физический PASS production-бинарника. Production SHA UNKNOWN до runtime-проверки.
Scope: только production release metadata/workflows и доказательства. API https://urtruck.kz, com.urtruck.app, ASC6764504167. Цель iOS 1.0.13 после проверки ASC. Каталог повторно не импортировать. QA2 IPA121 и QA2 versionCode214494478 исключены из production.
Protected: бизнес-функции, серверные данные, схемы, Chat, FSM, Push, GPS, Auth, перевод, каталог и QA2 остаются защищёнными.
Checks: ASC/EAS/Play live counters, runtime и авторизованные ленты/каталог/пагинация/прошедшие даты, CI, встроенные API/SHA/подписи/config готовых бинарников, обязательная полная физическая матрица на production-кандидатах.
Rollback: до публичной отправки остановить workflow/сохранить текущие магазинные версии; новые артефакты не продвигать без приёмки. Конфигурация через отдельный PR/revert. БД не заменять, импорт не выполнять. После публичного обновления откат бинарника пользователям не обещается, нужен новый номер.
Блокер устройств: iPhone unavailable; владелец сообщил, что сейчас подключить не может. Два Android доступны через adb. Mac заблокирован, управление локальным браузером отключено в Work; CLI/API проверяются независимо.

Уточнение scope: добавлен только read-only режим inspect_only в существующий deploy-play.yml, scripts/ops/inspect_play_store.py и регрессии. Цель — получить текущий максимум Play через существующий сервисный аккаунт, не меняя права, пакеты и треки. Production build пока блокируется отсутствием защиты PR634 в production runtime. Новые production workflow/SHA не выдаются за принятые.

## Подтверждённые проверки

- ASC live: 1.0.12 READY_FOR_SALE; последняя TestFlight-сборка 1.0.13 (121), VALID. EAS iOS counter121. Новая production IPA должна иметь build ≥122 после повторной сверки; QA2 IPA121 исключена.
- EAS Android counter213392856 устарел. Исторический Play production upload215090228, workflow40292336795; это не свежая сверка магазина и не основание повторно использовать номер.
- Production runtime: /home/ubuntu/urtruck/backend, port8001, БД /home/ubuntu/urtruck/runtime/security.db, URTRUCK_ENV=production, native push, STT/translation openai. /health OK, /api/version1.0.50, build_time2026-10-24 16:33. Единого подтверждённого git SHA нет.
- Production marketplace.py SHA256 b53a884ab31ebffe41406f93f14f4f43250c587110d537b1bc641059840d4da4: _require_current_bid_route_date отсутствует; новый PR634 guard не установлен. Сборка/публичная отправка заблокированы до узкого совместимого продвижения и проверки runtime.
- Production feed-файлы отличаются от кандидата. Клиентская совместимость нового исходника требует проверки: body_query, sort/cursor, contact fields и каталог.
- Авторизованная production-лента reviewer-driver: count3560, три страницы по100, 300 уникальных ID, межстраничных дублей0. Directory403 для driver — ожидаемая защита. Клиентский API каталога пока не проверен: существующая разрешённая client-сессия не найдена.
- Каталог read-only SQL:1297 активных в production и1297 в QA2; повторный импорт не выполнялся.
- Локальная Google OAuth-сессия:403 insufficient authentication scopes. Для live Play используется существующий CI service account через inspect_only. Скрипт читает tracks/bundles/apks, удаляет временный edit без commit, не создаёт сборок и не публикует.
- Новые unit tests8/8 PASS; существующие release/counter tests42/42 PASS; YAML и bash -n PASS. Это не physical acceptance.

## Дальнейшие действия

1. Сверить live Play максимум через inspect_only, повторить непосредственно перед будущей сборкой.
2. Продвинуть узкий совместимый runtime PR634 и требуемый API-контракт через защищённый production-путь с backup/rollback; не заменять целиком backend и не импортировать каталог.
3. Актуализировать существующие production build guards со старых PR605/1.0.12 на проверенный кандидат, сохранив exact SHA/CI/подписи и отдельный запрет отправки до приёмки. Сейчас guard обходить нельзя.
4. После устранения runtime-блокера собрать по одному кандидату, проверить встроенные API/SHA/signatures/config, выполнить физическую матрицу проекта на production-бинарниках. iPhone подключает/разблокирует владелец; доверие подтверждается на устройстве.
5. Только после полного PASS отправить в App Review и публичный Google Play. Ни TestFlight, ни Internal, ни draft не считаются публичным выпуском.

Документация API: https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/list ; https://developers.google.com/android-publisher/api-ref/rest/v3/edits/delete . Максимум относится к пакетам и трекам, видимым в текущем edit; перед загрузкой повторная сверка обязательна.
