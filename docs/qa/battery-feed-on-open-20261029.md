# Загрузка внешней ленты по действию пользователя — 29.10.2026

## PRE-FLIGHT

- Branch: `fix/feed-on-open-battery-20261029`; base/starting HEAD: `3cd723e23cfb84d4b729aa1b0a50df1051a09235` (`qa2/integration-candidate`).
- Разрешение: владелец просит убрать постоянную работу, загружать данные при входе/повторном входе, проверить GPS и жалобы на батарею. Измеренной причины разряда на телефонах нет.
- Known-good: исходник кандидата уже содержит map-only/snapshot GPS и паузу общих сетевых интервалов на AppState background/inactive. Эти свойства исходника не доказывают установленную версию или расход энергии пользователей. Production Android AAB `215090230` из run40776684461 был отправлен в production review run40783805168; его readback прямо указывает `public_availability_confirmed=false`. App source той сборки: `6aa6badf3ddfd8d124268c8cecf7c5e202c0baca`; фактическая версия у жалующихся UNKNOWN.
- Scope: удалить только минутные интервалы `ExternalFreightEntry` и `ExternalFreightFeedScreen`, обновить соответствующие runtime-тесты и этот журнал. GPS, auth, FSM, карта, чат, документы, push, импорт/каталог и серверы не меняются. Номер новой сборки не резервируется.
- Graphify AST-only: 15383 узла / 31626 связей; entry вызывает existing count API, экран использует existing loadRef, focus/AppState и server cursor. Риск — новые/закрытые объявления и счётчик не обновятся посреди непрерывного чтения до следующего пользовательского действия.
- Checks: до патча новые ожидания дали 8 FAIL (оба счётчика и 2 роли × Android/iOS/web), остальные 25 проверок PASS. Проверить отсутствие интервалов и дополнительных запросов за виртуальные 10 минут, немедленные focus/AppState/manual refresh, обе роли, сортировку, страницы, offline/retry; существующие GPS/polling regressions и CI.
- Rollback: revert отдельного patch-коммита через PR; БД и серверная конфигурация не затрагиваются.

## Что подтверждено кодом

- GPS: `FOREGROUND_LOCATION_ONLY=true`; map hook разрешён только на открытой карте активного рейса, непрерывный GPS-таймер в этом режиме не запускается. `captureForegroundPosition` имеет конечный timeout и удаляет native subscription при результате, отмене и background.
- Общий `foregroundPolling` удаляет интервалы при background/inactive и возобновляет их при active. Счётчики непрочитанных продолжают проверяться при активном приложении; данный патч не объявляет приложение полностью свободным от сетевой работы.
- `gps_lost` watchdog в исходнике выбирает только `capture_mode='continuous'`, а не snapshot. Это не сверка фактического server runtime.
- Двухсекундный QA2 bridge — серверный systemd timer; он не является интервалом запросов мобильного клиента.
- Новый патч: лента загружается на открытии, возврате focus/AppState, смене фильтров, ручном обновлении и запросе следующей страницы. Entry count — на открытии и возврате. Оба не создают повторяющийся таймер.

## Ограничения и приёмка

- Прямой доступ к серверу/устройствам в этой сессии отсутствует: последний ответ Desktop Commander — месячный лимит, сервис запрещает повторять команды/переподключение до восстановления. Здесь не прочитаны живые access logs, Battery Historian/Perfetto или iPhone energy logs.
- Нельзя заявлять, что найденная периодическая работа — доказанная причина жалоб, или обещать процент экономии. Нужны версия/номер установленного приложения и сравнимый прогон без зарядки: одинаковая сеть/яркость/экран, foreground feed и screen-off, отдельно проверка отсутствия location requests/wakelocks и частоты API.
- Установленный бинарник не получает удаление JS-таймеров только от серверного deploy. Новая сборка/доставка и физическая приёмка выполняются отдельно; этот патч не опубликован пользователям.
- Рекомендации сверены с Android Developers: https://developer.android.com/develop/connectivity/minimize-effect-regular-updates и https://developer.android.com/develop/sensors-and-location/location/battery/optimize .

## Локальные результаты

- После удаления двух интервалов: 173 связанные frontend/unit-проверки PASS (0 FAIL). Включены обе роли, Android/iOS/web в JS harness, 10 минут виртуального простоя без повторных запросов ленты/count, возврат и ручное обновление, сортировка/пагинация/offline, protected baseline, foreground polling idle, map-only entry, native capture cleanup и location queue.
- `npm run lint` и `git diff --check`: PASS. Полный новый GitHub CI на момент подготовки журнала ещё требуется; автоматические тесты не заменяют измерения энергии и физическую приёмку.

## Объединение30.10
PRE-FLIGHT: PR651 поверх a0af68b7743469f7f163ebaa41c4a40ac5e464a4; новые девять языков и GPS pause сохраняются. Known-good base: CI5037db2c PASS3/3, исходник кандидата a0af. Исторические173PASS исходного PR651 не переносятся на merge. Scope четыре исходных файла PR651 и документация; БД/backend/store metadata не меняются. Риск: середина непрерывного чтения не обновляется до действия пользователя. Откат отдельного merge-коммита. Перед публикацией проверены синтаксис4файлов, отсутствие setInterval в обоих компонентах и сохранение language adapters. Runtime/fullCI нового merge pending. Устройство479/124 не принимает новый merge автоматически. Задачи Mac: docs/qa/release-handoff-20261030.md.
