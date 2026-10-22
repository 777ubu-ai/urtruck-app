# Независимое непрерывное наполнение QA2 — 22.10.2026

## PRE-FLIGHT
Branch feat/external-feed-continuous-20261022; base d6e7b854 (PR572).
Known-good: существующий Telegram worker active/enabled, Restart=on-failure/30s;
QA2 bridge active/enabled с drop-in OnUnitInactiveSec=20. Живая запись до работы:
121 cargo active / 1 vehicle active, 1440 review. Production SHA UNKNOWN.
Scope: только collector входа внешних сообщений, parser/classifier/bridge и внешний экран.
Protected: существующие queue/cursors/prior и сессия Telegram, источник авторизации,
основные marketplace, auth, chat/deals, GPS, документы, production, магазины.
Риск: ошибочная классификация, смешение блоков, повтор после сбоя, новая выдача при прокрутке.
Graphify AST-only выполнен; общие get_conn/navigation/i18n/core modules не меняются.
Checks: parser/bridge/collector replay+restart, API isolation, UI refresh+filters/scroll, lint/web.
Rollback: вернуть только code/config из backup; не восстанавливать устаревшие рабочие базы.

## Реализация
- Существующий worker остаётся единственным Telegram-публикатором и авторизованным reader.
- В ТОЙ ЖЕ feed.sqlite3 добавлены app_messages/app_cursors/source_health; прежние таблицы сохраняются.
- NewMessage/MessageEdited сохраняют источник сразу, независимо от старого eligible()/телефона/публикации.
- Контрольный обход последовательный, целевой интервал 60s; reverse chronological traversal исправлен на
  хронологический reverse=True. Курсор продвигается после durable записи каждого сообщения.
- FloodWait обхода сохраняет scan_after, не останавливая событийную запись. Публикация круглосуточная,
  прежние 60s, random_id, защита неопределённой отправки и reconciliation сохранены.
- IncomingQueueBridge активируется ТОЛЬКО EXTERNAL_FREIGHT_SOURCE_MODE=incoming.
  Default published mode остаётся для совместимости/отката. URL ограничен https://qa2.urtruck.kz.
- Мост проверяется текущим 20s timer. 10 свежих + старый хвост до50: первичная загрузка не блокирует
  свежие сообщения и новые сообщения не вытесняют старую очередь бесконечно.
- Durable ACK разбора отделён от HTTP ACK адаптера. Ошибочные записи не блокируют остальные.
- Точное совпадение нормализованного текста между источниками подавляется в окне120h.
  Это не доказательство полноценной семантической дедупликации.
- Нумерованные или route-first блоки разбираются отдельно; нет переноса общего телефона/цены/маршрута.
  Изменение/сокращение списка закрывает прежние сегменты без удаления данных.
- «Нужна машина»/«нужен груз»/«порожний контейнер» разделены; отсутствующая цена/контакт допустимы.
  Явное неполное направление сохраняется; нераспознанное/противоречивое остаётся review.
- Источник поста вычисляется из проверенных public username + numeric message id. Это не личный контакт.
- Открытая лента обновляется каждые20s только в foreground/focus, без активной формы/запроса/закладки.
  Фильтры сохраняются; native использует maintainVisibleContentPosition, web — поправку scroll offset.
  Истёкшие обычные карточки убираются; сохранённые сохраняют статус expired/closed.

## Проверка источников
Read-only аудит существующей серверной авторизацией, без вступлений/отправок:
7/9 доступны; gruzoperevozka_rf_kz и logistics_kazakhstan — protected_content, исключены.
Подготовлены app-only дополнительные источники gruzuzbekistan, gruzy_horgos,
perevozka_cargoinfouz, poputno_gruz, TvoiGruz, TIRtrans, roolz_ru_offers.
Файл ops/telegram-feed/app-sources.json. Прежний Telegram allowlist из10 не расширяется.
В выборке до100 сообщений/источник за24h новый parser нашёл80 cargo active и0 vehicle active;
межканальные дубли здесь НЕ вычитались. Это аудит/оценка разбора, не импорт и не число людей.
Наличие «Транспорт» в названии группы не является доказательством потока машин.

## Развёртывание после review/CI
1. Снять online backup feed.sqlite3 и adapter.sqlite3, сохранить feed.py и3 backend service-модуля,
   текущие хеши, unit/drop-ins и настройки. Ключи не выводить/не коммитить.
2. Остановить bridge.timer, дождаться окончания bridge.service. Дождаться безопасной паузы
   Telegram (sending/uncertain=0), остановить единственный urtruck-telegram-feed.service.
3. Атомарно установить ops/telegram-feed/feed.py в /home/ubuntu/urtruck-telegram-feed/feed.py,
   app-sources.json рядом. В backend/services QA2 установить только classifier/parser/queue_bridge.
4. Restart только QA2 backend для загрузки classifier; проверить health и9 external routes,
   отсутствие изменения основных API/данных. Collector запустить штатной службой.
5. Добавить drop-in bridge.service: Environment=EXTERNAL_FREIGHT_SOURCE_MODE=incoming.
   daemon-reload; вернуть20s timer. Все .env/importer credentials оставить прежними.
6. Проверить автозапуск enabled, Restart=on-failure, source health; сравнить старые таблицы/сессию,
   увидеть автоматические app_received→bridge→HTTP ACK для двух типов. Один импорт недостаточен.
7. Обновить QA2 web проверенным export; APK не создавать до серверной и web приёмки.
8. На телефонах проверить реальную карточку обеих ролей, источник, цену unknown, фильтры,
   закладки, позицию списка, автопоявление. Native/iPhone не засчитывать по browser PASS.
9. Без отправки сообщений в источники дождаться реальных грузов/машин; журнал этапов:
   source_date → app_messages.received_at → incoming_bridge_seen.processed_at →
   selected_outbox.delivered_at → external_freight_items.ingested_at → время видимости телефона.
10. В безопасной паузе перезапустить collector/bridge и повторить replay; сверить0 новых дублей.

## Откат
- Остановить только bridge.timer и дождаться завершения oneshot; сохранить pending outbox.
- Убрать incoming drop-in в архив конфигурации, вернуть сохранённые3 backend modules;
  restart QA2 backend, health. Вернуть прежний published mode и20s timer.
- В безопасной паузе остановить collector, вернуть backup/feed.py и прежний app-sources.json
  (если раньше отсутствовал — перенести новый файл в backup), запустить collector.
- Не откатывать source/adapter/feed DB назад: новые таблицы безопасно остаются и не читаются старым кодом.
- Web вернуть предыдущим export. Production и магазинные приложения не участвуют.

## Статус
Код подготовлен отдельно от runtime. Независимое review и CI обязательны перед сменой collector/DB.
Ночной событийный путь, живое автонаполнение машин, реальные задержки и physical acceptance
нового кода пока НЕ доказаны. Старый published bridge продолжает работать с прежними ограничениями.


## Выполненные проверки кандидата
- 93/93 backend: collector/parser/classifier/bridge и настоящий FastAPI importer на изолированной
  синтетической SQLite, роли/закладки/TTL/повторы/правки/422/retry. Пути трёх service-модулей
  проверены: импортировались из staging, а не из рабочего backend.
- 48/48 pure collector/parser/bridge на Mac; 33/33 frontend Node (включая29 guards основных файлов).
- 21/21 browser baseline+автообновление; после исправления scroll anchor отдельно2/2 continuous:
  новая карточка без ручного обновления, выбранный фильтр, unknown price, source link и
  сохранённая экранная позиция карточки при добавлении новой головы. Ответы API в browser синтетические.
- Lint571 JS, web export и diff-check PASS. APK не создавался.
- Ошибки промежуточных проверок исправлены: «Нужен груз.» ошибочно распознавался как грузоотправитель;
  web использовал изменение суммарной высоты виртуализованного списка вместо координаты видимой карточки.
- Не проверены: новая схема на живой очереди/ночью, service crash recovery нового процесса,
  реальная автоматическая машина, native Android/iPhone, end-to-end SLA.
- Новый событийный код/конфиг НЕ установлен в runtime. Применён только отдельно проверенный night-gate патч, см. ниже.


## Применённый минимальный ночной патч
22.10.2026 15:44:29UTC (20:44Алматы): в рабочем feed.py удалён ТОЛЬКО09:00–21:00 gate.
AST всех остальных определений совпал. Старыйhash35a3f7336322d74646452515ee39cc654ac9cf052bdf8696310a455becc97f1a;
новый252bed51e7d0f058af483f10004bf63350b74bc3906cec8fce098563f142954d.
Backup /home/ubuntu/urtruck-telegram-feed/backups/night-20261022T154429Z содержит
feed.py, online SQLite (integrity_check=ok) и result.json. Перед заменой worker остановлен,
sending/uncertain=0. После restart active/running/enabled,NRestarts0, scan15:44:53 успешен.
Очередь не редактировалась. 120h/входящая схема/новые источники НЕ активированы.
Rollback только ночного патча: в безопасной паузе stop worker, вернуть backup/feed.py,
start worker; SQLite не откатывать. Это возвращает старое дневное ограничение.
В15:45:59UTC вQA2 остаются121 cargoactive/1vehicleactive; с15:08:12 ни одного нового
активного объявления с коррелированным ACK адаптера; SLA новой видимой записи не измерен.
Остальные сообщения старого pipeline могли уйти вreview — это не успешное наполнение обеих лент.
CI первогоSHA нашёл недокументированныйEXTERNAL_FREIGHT_SOURCE_MODE; добавлен безопасный
default published вbackend/.env.example. Перепроверяется полным CI.

## Независимое review и исправления перед QA2 activation
Review первого SHA нашёл четыре P1: ошибочная запись cursor при unavailable source;
отсутствие старого outbox в дедупликации при mode switch; stale active карточка при edit в дубль;
зависимость app intake от прав destination Telegram. Исправлены отдельно, добавлены regression cases.
Оригинальный CI984dc8a1 завершился3/3PASS; после правок требуется новый CI и approval нового SHA.

Preflight runtime22.10 16:01UTC: QA2 API8002 работает orphanPID327778 с PPid1, systemd unit inactive.
main.py загружает backend/.env; штатный unit ссылается на другой parent .env.
Перед takeover сохранить unit/drop-ins, cmdline, envфайлы приватно; сравнить effective DBpaths;
использовать reset EnvironmentFile→/home/ubuntu/urtruck-qa2/backend/.env и исходныйhost0.0.0.0:8002.
Остановить только подтверждённый QA2PID, запустить существующий unit, проверить1 listener, health/API/coreDB.
Это не запуск второгоAPI и не изменение production. Rollback конфигурации→backup; рабочиеDBнеоткатывать.
