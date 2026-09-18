# Push event matrix — live iPhone/Android checklist

Ручной чек-лист для реального устройства. Автоматический контракт живёт
в `backend/tests/test_push_event_matrix.py` (15 тестов, ловят drift кодового
контракта). Live — то, что автотест доказать не может: реальная доставка
APNs/FCM, tap-routing, счётчики, in-app баннер.

**Как заполнять**: для каждой строки, сделав действие, помечай:
- `✅ PASS` — push пришёл, tap открыл правильный экран, счётчик обновился;
- `❌ FAIL` — и рядом что именно (ниже даны конкретные симптомы);
- `⚠️ SKIP` — сценарий недоступен на этом билде/девайсе, объясни почему.

Скриншоты складывать в `qa-artifacts/push-matrix-YYYYMMDD/`. Именование —
`ev{N}-{event}-{role}-{step}.png` (например `ev1-bid_created-shipper-tap.png`).
Папка в `.gitignore` уже, скриншоты локально или в ссылке.

## Пре-условия

- [ ] Установлен свежий TestFlight RC (SHA актуального `release/…` бранча).
- [ ] На устройстве **разрешены push** для UrTruck (Настройки → Уведомления → UrTruck).
- [ ] `GET https://urtruck.kz/security/api/v1/push/info` показывает
  `native_ios >= 1` (или `native_android >= 1` для Android). Если 0 —
  registration не прошёл, дальше по чек-листу смысла нет.
- [ ] Второе устройство или второй аккаунт (driver + shipper) готовы.
- [ ] Открыт `qa-artifacts/push-matrix-YYYYMMDD/` для скринов.

## Матрица live-проверок

### Ev 1. bid_created

**Setup**: A = shipper с активным грузом, B = driver.
**Действия B**: открыть груз → «Предложить цену» → сумма → отправить.
**Ожидание A**:
- push «💰 Ставка $N» ~1–3 сек;
- tap → CargoDetail именно этого груза, ставка B в списке;
- бейдж «Сделки» +1 (in-app notification в колокольчике «Ставка $N»);
- payload URL = `/cargos/{id}?bid={bid_id}` (проверить через `Настройки → About → last push url`, если есть debug-экран).

| Кто | PASS/FAIL | Screenshot | Notes |
|---|---|---|---|
| shipper (получатель) | | ev1-*.png | |
| driver (отправитель — push НЕ должен прийти самому себе) | | ev1-self-check | ownership guard |

### Ev 2. bid_accepted (+ implicit deal_created)

**Действия A**: открыть CargoDetail → карточка ставки B → «Принять» → подтвердить.
**Ожидание B**:
- push «✅ Ставка принята!»;
- tap → CargoDetail этого же груза (плашка «Сделка создана», прогресс, «Открыть чат»);
- +1 в колокольчике «bid_accepted».

| Кто | PASS/FAIL | Screenshot |
|---|---|---|
| driver (получатель) | | ev2-*.png |
| shipper (принявший — сам себе push НЕ должен) | | ev2-self-check |

### Ev 3. deal_created (только counter-accept путь)

**Setup**: A и B в состоянии `countered` (owner отправил counter).
**Действия B**: «Принять контр-оффер».
**Ожидание обоих**:
- push «✅ Сделка создана» тому, кто не нажимал;
- бейдж +1;
- tap → карточка заказа.

**NB**: обычный accept_bid (без counter) идёт через bid_accepted (Ev 2), не через deal_created.

### Ev 4. chat_message

**Действия**: любой из участников сделки шлёт текстовое сообщение в чат.
**Ожидание другой стороны**:
- push `💬 {sender_name}` с превью текста;
- tap → **сразу правильная комната** (тот же deal chat, а не список чатов);
- если пользователь УЖЕ в этой комнате — push не должен показывать banner (payload `type=chat_message` фильтрует это на фронте);
- badge на «Сделки» +1 если экран не открыт, 0 если открыт;
- **NO in-app notification в колокольчике** — chat unread идёт через `chat_messages`, не через `notifications`.

### Ev 5. chat_attachment

**Действия**: отправить фото / документ / голосовое в чат сделки.
**Ожидание**:
- push «Новое вложение в сделке» + label (📄 или 🖼);
- tap → та же комната, где attachment уже виден;
- badge +1 если не открыт.

### Ev 6. trip_started (deal → in_progress)

**Действия B (driver)**: в чате сделки нажать «Начать перевозку» / status change.
**Ожидание A (shipper)**:
- push «🚛 Рейс начался» с телом «FromCity→ToCity · $N»;
- tap → **CargoDetail карточка заказа** (не Deal Room), там прогресс-бар «Рейс начался»;
- бейдж «Сделки» +1;
- **дубль-нажатие «Начать перевозку»** не должно слать второй push (идемпотентно).

### Ev 7. gps_tracking_requested

**Ожидание**: push НЕ приходит. Permission dialog показывается локально на устройстве водителя, backend этого не видит. Отметить `⚠️ SKIP` — no backend event.

### Ev 8. gps_tracking_enabled/disabled

**Ожидание**: push НЕ приходит (backend gap G3, документ). `⚠️ SKIP`. Не путать с включением GPS-tracking status в UI (это локально).

### Ev 9. delivered_by_driver (deal → delivered)

**Действия B**: «Я доставил».
**Ожидание A**:
- push «✅ Доставлен — ожидается подтверждение получения»;
- tap → CargoDetail, там появляется кнопка «Подтвердить получение»;
- бейдж +1.

### Ev 10. received_by_shipper (deal → received)

**Действия A**: «Подтвердить получение».
**Ожидание B**:
- push «✅ Получение подтверждено»;
- tap → карточка заказа;
- бейдж +1.

### Ev 11. deal_completed (deal → completed)

Ожидание аналогично Ev 10 с телом «🤝 Сделка завершена». Обе стороны видят finalized deal.

### Ev 12. deal_cancelled (deal → cancelled)

**Действия**: любая из сторон отменяет сделку.
**Ожидание другой стороны**:
- push «❌ Отменено» с той же формулой «FromCity→ToCity · $N»;
- tap → CargoDetail, деал в статусе Cancelled;
- бейдж +1.

### Ev 13. bid_expired

**Ожидание после мерджа PR #309 + этого PR**: **push НЕ приходит** (Gap G4). Драйвер увидит статус ⏰ Истекло только при следующем открытии CargoDetail. Пометить `⚠️ SKIP — G4 documented`.

Когда/если G4 будет закрыт отдельным PR — вернуться сюда и обновить сценарий.

## Cross-cutting proofs

- **Ownership isolation**: с device A под user X пропушить в чужую сделку через API (напрямую curl) — 403. `qa/agents/*` уже это проверяют автоматом; в live-режиме достаточно убедиться, что пуш другого юзера не долетел на моё устройство.
- **Logout hygiene**: sign out на устройстве → на этом устройстве больше не должны приходить push. Это закрыто в PR #308 (server-side push deactivate on logout).
- **Reinstall**: удалить UrTruck, установить снова, залогиниться под тем же юзером — push должен возобновиться (registration re-establishes `native_ios` count).
- **Airplane mode retry**: включить airplane, кто-то отправляет чат-сообщение → выключить airplane → push должен прилететь.

## Финальный snapshot

Собрать одним exportsvg / скрином:
- `qa-artifacts/push-matrix-YYYYMMDD/summary.png` — таблица результатов (все ✅/❌/⚠️).
- Ссылка на этот файл в отчёте PR.
