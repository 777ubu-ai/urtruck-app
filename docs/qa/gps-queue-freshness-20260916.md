# GPS: FIFO и свежесть — 2026-09-16

База пакета: 433872cc, ветка qa/master-hard-qa-20260916.

Исправлены F04/F05/F07: сохранение всего callback до сети; отдельный атомарный ключ AsyncStorage на sample вместо read-modify-write массива; очередь на аккаунт/сделку; failed head не обгоняется; новые точки других сделок продолжаются. Нет обрезания до 256. Старый JSON мигрируется с сохранением исходника. Неактивные записи остаются evidence и не отправляются. 400/403/404/409/422 сохраняются в карантин; 401/429/5xx/timeout оставляют pending. Ограничение сетевого ожидания 15 секунд. Повтор выполняется следующим callback/tick.

Backend принимает sample_id, подтверждает именно его, журналирует captured_at_ms и received_at отдельно. Уникальность deal_id+sample_id; конфликт содержимого 409. Поздняя точка сохраняется, не откатывая latest location. SQLite сериализует lost/restored; completed не принимает live location. Авторизация driver/consent сохранена.

Пустой callback повторяет pending, но не делает старую cached координату новым heartbeat. Настоящие stationary updates остаются 60 секунд / distanceInterval=0. Foreground использует timestamp ОС, а не Date.now. Malformed active-response и ответ старой сессии не очищают разрешённые IDs.

Проверки: frontend **659/659**, lint **375 активных JS**; GPS backend **17/17**. Тесты покрывают перезапуск, 3500 точек (>24 ч при 25 с для одной сделки), конкурентные writers, два deal, failed head, потерянный ack, смену аккаунта, malformed/empty active, batch, карантин, исходные timestamps, idempotent journal и конкурентный restored. Исходный статический тест cached-heartbeat заменён поведенческим тестом честной свежести.

Ограничения: 24-часовая проверка выполнена на storage adapter; реальная ёмкость зависит от свободного AsyncStorage/диска и требует native acceptance. Ошибка записи возвращает GPS_QUEUE_FAILURE и журналируется; бесконечное offline-хранение не обещается. Новый клиент требует backend с sample_id ack; сначала совместимый backend, затем APK. Никакого production rollout в этом пакете. 15/30 минут physical NOT RUN по поручению владельца.

Evidence: /private/tmp/urtruck-security-20260916-i3Bkql/{frontend-gps-v3.log,lint-gps.log,backend-gps-final.log}. Общий release ещё не 10/10.
