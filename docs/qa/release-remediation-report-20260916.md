# UrTruck — отчёт об исправлениях и готовности выпуска

Дата: 16.09.2026 UTC. Работа по утверждённому URTRUCK-RELEASE-REMEDIATION-20260916-v1.
**Release verdict: BLOCKED. Оценка 10/10 не подтверждена.**

## База и сохранение

- Репозиторий: 777ubu-ai/urtruck-app.
- Ветка: qa/master-hard-qa-20260916, без merge/rebase main.
- Начало этого пакета: ba2835d682a079e676f07cc588ddd9c6cbe65942.
- Исходники QA APK: 103473497d0656d989d14b1db2de2989d0ad88c2.
- Старый headless recovery 07013b6e остаётся ancestor.
- Worktree: /private/tmp/urtruck-master-hard-qa-20260916; изменения сохранены в origin.
- Production, .env, платежи, рабочая БД и телефоны не изменялись. OPPO и GPS 15/30 min не запускались по последнему поручению владельца.
- Это исходниковые и изолированные integration-проверки. Старые physical PASS из переписки не выдаются за новый прогон.

## Выполненные пакеты

| Commit | Изменение | Доказательство |
|---|---|---|
| 433872cc | Ограничения размера/времени/конкурентности форм; bounded read вложений; безопасные зависимости | 6 новых ASGI checks; первоначально 828 backend PASS; установленный граф без известных advisory |
| db4493d6 | GPS: атомарные записи по sample и аккаунту, persist-before-network, FIFO, карантин, authoritative active, оригинальный capture и idempotent backend journal | 10 новых frontend + 3 backend tests; targeted GPS 17/17 |
| b88b5f54 | Counter accept: outbox и in-app обеих сторон в транзакции сделки; стабильный ключ и retry | 12/12 durable-delivery tests, включая сбой после commit и rollback при outbox failure |
| a4b94f7f | Дополнительный local_whisper STT через существующий сервис, без вызова OpenAI API | 21/21 adapter + STT contract; реальные RU/ZH inference, quality-ограничения ниже |
| b0e4b1a9 | Достоверные неизвестные метрики карты; нет fake ETA/0%; null-координаты не превращаются в 0,0; live freshness обновляется | 4 новых проверки и полный frontend 663/663 |
| d9ac615d | AST-контракт transactional notification вместо старой literal-string проверки | Полный backend 838/838 |
| 10347349 | Версия нового QA2 APK 211040057, прежняя безопасная injection MapKit secret | CI run 35160059710 |

До этого пакета уже сохранены 41d2569f (one-tap voice state/cache/retry) и ba2835d6 (web fail-fast). Они включены в текущий HEAD; не представлены как повторно сделанная работа.

## Финальные автоматические проверки

| Проверка | Результат |
|---|---|
| Полный backend | **838 passed, 0 failed**, 264 deprecation warnings, 30.83 s |
| Полный frontend | **663 passed, 0 failed**, skipped 0 |
| Lint | PASS, 377 active JS |
| i18n RU/EN/KK/ZH | PASS, 2003 keys на язык, missing 0 |
| qa:nav | PASS, проверка контракта; не physical navigation matrix |
| qa:zh | PASS |
| Реальный npm run build:web | PASS, export + finalizer, 1 JS bundle и 8 обязательных статических источников |
| pip check основного backend | PASS |
| SCA основного установленного backend/test-графа | 0 известных уязвимостей; ignore не использовался |
| Чистая установка backend + optional local STT | PASS; pip check PASS; SCA 0 известных уязвимостей |
| git diff --check | PASS |

Backend тестировался в отдельном venv Python 3.12 и новой SQLite БД. В тестовой копии один hardcoded DB_PATH переведён на уникальный путь окружения; assertions не ослаблялись. Копия содержит актуальные изменённые backend-файлы и requirements. Хранилище файлов также изолировано.
Web собран из git archive 10347349; node_modules взят из предыдущей чистой установки с побайтово тем же package-lock. Никакого deploy.

Промежуточные падения не скрыты: frontend static test требовал progress||0; backend static test требовал create_notification без event_key/conn. Контракты обновлены с сохранением проверок маршрутов и добавлением поведенческих сценариев. Финальные полные прогоны выше — после этих изменений.

## Голос без OpenAI API

**Да, технически возможен. Новый adapter реализован, сохранён и реально запущен в изолированном QA. Production не переключён.**

Настройки: TRANSCRIBE_PROVIDER=local_whisper; LOCAL_WHISPER_MODEL_PATH — абсолютная папка заранее установленной модели. Зависимости в backend/requirements-local-voice.txt.
Модель Systran/faster-whisper-small, revision 536b0662742c02347bc0e980a01041f333bce120.
Whisper изначально разработан OpenAI, но локальное исполнение не требует аккаунта, API, отправки записи в OpenAI или оплаты OpenAI. Это не независимое от происхождения модели решение.

- RU 8.57 s и ZH 9.34 s: язык определён правильно, сумма 7800 сохранена; первый smoke 4.9/4.18 s. В чистой STT-only среде холодный RU-запуск занял 22.73 s, следующий ZH — 4.16 s.
- Настоящий adapter обработал 58-секундные синтетические fixtures: RU 59.53 s, ZH 55.82 s. RU добавил лишнюю фразу на обрезанном конце: **quality FAIL**. Это не принятие 60-second native voice.
- Дополнительные цельные TTS-записи: RU 55.08 s / inference 14.09 s; ZH 59.8 s / inference 18.72 s. Сумма 7800 сохранена, но RU исказил «из Алматы», ZH записал Иу неверными иероглифами. Quality gate остаётся открыт; это не телефонный acceptance.
- Argos Translate: RU→ZH сохранил смысл; ZH→RU превратил Иу в Италию и потерял часть сообщения. **В приложение этот переводчик не подключён.**
- Экспериментальная Argos-venv дополнительно имеет advisory в stanza 1.10.1; она не используется в requirements-local-voice.txt и не поставляется в production. Отдельная чистая STT-only установка без Argos проходит SCA.
- OpenAI сохранён как selectable/default provider. Реальные обращения работающего backend дали HTTP 429 credit_balance_exhausted для STT и translation. Баланс GitHub не оплачивает OpenAI API.
- Результаты реального inference и manifest модели сохранены в docs/qa/evidence/voice-20260916. Это синтезированные QA-записи, не телефонные сообщения.

Итог: полностью качественный voice→text→translation без OpenAI API пока **не принят**. Экспериментальный local STT не объявляется production заменой; нужны длинные естественные записи/шум и серверный latency/timeout/load test. Для текущего OpenAI-перевода нужен рабочий API-баланс либо отдельно проверенный альтернативный переводчик.

## GPS

Исправлены исходниковые причины F04/F05/F07. Новые данные сначала записываются, сервер подтверждает конкретный sample_id; исходный captured_at_ms не заменяется временем flush. Последняя позиция не откатывается при поздних samples; active response старой сессии/невалидного JSON не стирает IDs. Журнал делает повтор после потерянного ack безопасным. Невалидные/terminal точки сохраняются в карантин.

Ограничения остаются явными:
- Тест 3500 samples подтверждает работу adapter, а не свободное место/ёмкость Android AsyncStorage.
- Retry идёт следующим callback/tick; отдельный exponential backoff/Retry-After GPS ещё не реализован.
- Сбой диска возвращает GPS_QUEUE_FAILURE; бесконечное offline-хранение не обещается.
- Client требует sample_id в успешном ack. **Сначала совместимый backend, затем установка нового APK.** Старый backend не позволит новой очереди очистить pending.
- Physical long screen-off, native FIFO capacity, Location OFF/ON и completion-stop в этом цикле NOT RUN.

## Push

Counter accepted теперь имеет надёжную запись до inline send. Повтор accept остаётся 409, accepted amount остаётся active counter.
Provider retry тестируется на существующем worker; native default, hidden Bell, получатели и ссылки сохранены.

Это at-least-once доставка. Crash после реального принятия FCM и до записи delivery log всё ещё может дать транспортный дубль; exactly-once не заявляется.
Новый physical FCM/APNs, звук и launcher badges не проверялись. OPPO вне текущего поручения. In-app unread/навигирование покрыты исходниковыми suites, но не заменяют OS acceptance.

## Карта

Renderer прежний: react-native-yamap / Yandex MapKit. Ключ: EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY из GitHub secret. Значение нигде в отчёте не выводится.
Убрано выдумывание ETA из плановой даты, прогресса 0% при отсутствии GPS и свежести «сейчас» при loading.
Время маршрута обозначено оценкой, а не фактически отработанным временем водителя.

Открыто: отображение отдельного driving_duration_s и точного remaining ETA; обработка off-route/петель/jitter в существующем nearest-vertex progress; физическая карта Driver/Shipper и реальные China-corridor metrics. Для неполных данных выводится «—». F08 исправлен в части ложных значений, весь W5 **не закрыт**.

## APK

- Package: com.urtruck.app.qa2.
- versionName: 1.0.8.
- versionCode: 211040057.
- Source: 103473497d0656d989d14b1db2de2989d0ad88c2.
- Workflow: https://github.com/777ubu-ai/urtruck-app/actions/runs/35160059710 .
- Build/SHA256/signing certificate: будет дополнено по завершению CI.
- Это QA2 с явным debug-signing opt-in по существующему workflow. Не Play production artifact.
- Установка на телефоны не выполнялась. Совместимость установленной подписи не утверждается без проверки перед install -r.

## Осталось до выпуска

1. F01: развернуть согласованный backend artifact с миграцией GPS journal/новыми dependencies. Перед этим backup БД, конфигурации и текущего артефакта; health/auth/ownership/upload/GPS-ack smoke и rollback-план. Развёртывание в данном поручении не выполнялось.
2. Восстановить реальный voice translation provider; выполнить RU↔ZH и длинные natural recordings, persistence/retry/cache на рабочем runtime.
3. Завершить метрики карты и bounded retry/backoff GPS; проверить выбранную политику ёмкости/ошибок диска.
4. После разрешения владельца — короткая платформенная приёмка нового APK и iOS. Не переносить Android PASS на APNs/iOS. Повторять отменённые владельцем 15/30 min сейчас не требуется, но отсутствие нового evidence сохраняется в статусе.
5. Production signing/store artifacts, iOS build/TestFlight, native map/push/location/microphone и финальное решение о выпуске — отдельные незакрытые gates.

**Новых P0 в выполненных тестах не обнаружено; это не доказательство отсутствия всех P0. P1 release blockers остаются: runtime divergence/rollout, рабочий голосовой перевод, непроверенная native карта и платформенная приёмка.**
Ни исправления в Git, ни зелёные unit suites сами по себе не означают, что установленные приложения или сервер уже обновлены.

## Подробные отчёты

- docs/qa/upload-security-20260916.md
- docs/qa/gps-queue-freshness-20260916.md
- docs/qa/push-counter-durability-20260916.md
- docs/qa/map-metrics-truth-20260916.md
- docs/qa/local-voice-provider-20260916.md

Логи Mac: /private/tmp/urtruck-security-20260916-i3Bkql и /private/tmp/urtruck-voice-live-20260916. Существенные результаты и ограничения перенесены в Git, временные evidence не удалялись.
