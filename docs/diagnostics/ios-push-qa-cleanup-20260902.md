# P0/P1 Диагностический отчёт: iOS Push + QA Data Cleanup

**Дата:** 2026-09-02  
**SHA:** `362179e5700e2c10e0974b78aa9ed6b9238eece5`  
**Ветка:** `claude/youthful-cerf-barf3`

---

## §1–§3: iOS Push Chain — Анализ и Root Cause

### Доказанные факты (из кода)

#### 1. Полная цепочка push для iOS

```
Frontend push.registerNative()
  → getDevicePushTokenAsync() (raw APNs token)
  → getExpoPushTokenAsync({projectId}) (Expo Push Token)
  → POST /push/register-native (expo provider)
  → POST /push/register-native (apns provider)
  → Оба записываются в push_tokens_native

Бизнес-событие (bid, chat message, deal status change)
  → send_to_user() [api/push.py]
  → push_sender.send() [services/push_sender.py]
  → _send_native() → фильтр provider=='expo' → _send_expo()
  → POST https://exp.host/--/api/v2/push/send
  → Expo Push Service → APNs → iPhone
```

#### 2. Вся нативная доставка — через Expo Push Service

**Файл:** `services/push_sender.py` line ~262  
`expo_tokens = [t["token"] for t in tokens if t["provider"] == "expo"]`

`_send_native()` фильтрует по `provider == "expo"` для Expo и `provider == "fcm"` для Firebase. APNs-токены регистрируются (для будущего прямого APNs), но **доставка идёт только через Expo** — Expo Push Service проксирует в APNs. Это значит:

- Вся iOS-доставка идёт **только через Expo Push Service**
- APNs-токены регистрируются, но **не используются напрямую** (нет прямого APNs провайдера)
- FCM-стаб присутствует, но `FCM_SERVER_KEY` не задан → mock

#### 3. Expo Push Service — критическая зависимость

Для работы Expo Push Service с iOS **необходимо**:
- APNs credentials (P8-ключ) загружены в **EAS проект** `898bd902-ea62-49f6-96c3-b6e02219f828`
- `aps-environment: "production"` в entitlements ✅ (app.json подтверждает)
- `bundleIdentifier: "com.urtruck.app"` ✅
- `UIBackgroundModes: ["remote-notification"]` ✅
- `expo-notifications` plugin настроен ✅

#### 4. Frontend корректен

**push.js** (427 строк) делает всё правильно:
- `getExpoPushTokenAsync({projectId, devicePushToken})` — с projectId из Constants ✅
- `getDevicePushTokenAsync()` — raw APNs token ✅
- Оба токена регистрируются через `POST /push/register-native` ✅
- `autoRegister()` вызывается на каждом cold start + foreground return (App.js P5 effect) ✅
- Debounce 30 секунд для rapid transitions ✅
- Foreground handler подавляет баннер для активной комнаты чата ✅

#### 5. Backend корректен (push_sender.py + push_gateway.py)

- Badge = chat unread (без system) + notification unread ✅
- Event dedup по `event_key` ✅
- `DeviceNotRegistered` → деактивация токена ✅
- `InvalidCredentials` → только лог, НЕ деактивация (правильно!) ✅
- `push_tokens_native` — единственная таблица токенов (нет отдельной `push_devices`) ✅

#### 6. app.json / eas.json конфигурация

| Параметр | Значение | Статус |
|---|---|---|
| `bundleIdentifier` | `com.urtruck.app` | ✅ |
| `aps-environment` | `production` | ✅ |
| `UIBackgroundModes` | `["remote-notification", "location"]` | ✅ |
| `expo-notifications` plugin | настроен | ✅ |
| `projectId` | `898bd902-ea62-49f6-96c3-b6e02219f828` | ✅ |
| EAS build image | `macos-sequoia-15.6-xcode-26.2` | ✅ |

### Что НЕЛЬЗЯ доказать из кода (требует сервер/устройство)

| # | Вопрос | Как проверить |
|---|---|---|
| A | APNs P8-ключ загружен в EAS проект? | `eas credentials` или Expo Dashboard → Project → Credentials → iOS |
| B | Expo Push Token реально получен на iPhone? | Логи TestFlight или `POST /qa/push/native-tokens` с user_id |
| C | `push_tokens_native` имеет запись для юзера? | `SELECT * FROM push_tokens_native WHERE user_id = '<uid>'` на проде |
| D | Expo возвращает ticket.status=ok? | Серверные логи `push_sender.py` (grep "expo push") |
| E | APNs принимает пуш? | Только Expo Dashboard → Push Receipts или серверные логи |

### Наиболее вероятный root cause

**Отсутствие APNs credentials в EAS проекте.** Без P8-ключа Expo Push Service не может проксировать пуш в APNs, и ticket возвращает `InvalidCredentials`. Push sender корректно НЕ деактивирует токен (P0-1), но сам пуш не доходит.

**Действия для владельца:**

1. Открыть https://expo.dev/accounts/[owner]/projects/898bd902-ea62-49f6-96c3-b6e02219f828/credentials
2. Проверить наличие iOS Push Certificate / P8 Key
3. Если нет — `eas credentials` → iOS → Push Notifications → Upload P8 Key
4. После загрузки — TestFlight re-install не нужен, Expo начнёт доставлять сразу
5. Проверить через `POST /qa/push/test-direct` с user_id

---

## §4–§6: QA Data Cleanup

### Доказанное происхождение 47+26 сделок

**Серверный endpoint `/market/my`** (marketplace.py line 1793):
```sql
SELECT d.* ... FROM deals d ... 
WHERE d.shipper_id = ? OR d.driver_id = ? 
ORDER BY d.created_at DESC LIMIT 50
```

**Нет фильтра по статусу** — сервер возвращает ВСЕ сделки (active + cancelled + completed) до LIMIT 50. Фронтенд разделяет active/archive клиентски.

**QA-акторы** создают сделки при тестовых прогонах:
- `agent-boris` (shipper) + `agent-serik` (driver)
- `agent-fedya` (shipper) + `agent-armando` (driver)
- и другие комбинации из 6 акторов

Эти сделки остаются в БД, потому что `/qa/cleanup` **намеренно не трогает deals** (graduated pipeline).

### Реализованное решение

**Новый endpoint:** `POST /api/v1/qa/cleanup/deals`

Безопасные гарантии:
1. **Только QA-only сделки** — ОБА участника (shipper_id И driver_id) должны быть из `QA_ACTOR_IDS`
2. **dry_run=true по умолчанию** — без мутации
3. **confirm=true обязателен** для мутации
4. **Полный бэкап** в ответе (поле `backup`)
5. **Чат-зачистка** опциональна (include_chat)
6. **Токен-аутентификация** (`X-QA-Cleanup-Token`)

**Дополнительный endpoint:** `GET /api/v1/qa/cleanup/deals/preview` — безопасный просмотр без мутации.

### Процедура зачистки на проде

```bash
# Шаг 1: dry-run — посмотреть что будет затронуто
curl -X POST https://urtruck.kz/security/api/v1/qa/cleanup/deals \
  -H "X-QA-Cleanup-Token: $QA_CLEANUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}' | python3 -m json.tool

# Шаг 2: проверить backup в ответе, убедиться что нет реальных сделок

# Шаг 3: применить (ТОЛЬКО после проверки backup)
curl -X POST https://urtruck.kz/security/api/v1/qa/cleanup/deals \
  -H "X-QA-Cleanup-Token: $QA_CLEANUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false, "confirm": true, "include_chat": true}' | python3 -m json.tool

# Шаг 4: проверить результат на фронте — обновить /market/my
```

---

## §7: Контрактные тесты

### Новые тесты

| Файл | Тестов | Статус |
|---|---|---|
| `backend/tests/test_ios_push_chain_contract.py` | 8 (31 assertion) | ✅ PASS |
| `backend/tests/test_qa_deal_cleanup.py` | 7 (22 assertion) | ✅ PASS |

### Регресс существующих тестов

| Файл | Тестов | Статус |
|---|---|---|
| `tests/frontend/test_positive_deal_deeplink_room_membership.mjs` | 3 | ✅ PASS |
| `tests/frontend/test_deal_deeplink_guard_runtime.mjs` | 11 | ✅ PASS |
| `backend/tests/test_deal_access_matrix.py` | 8 | ✅ PASS |

---

## Итого: что осталось сделать владельцу

### iOS Push (блокирует TestFlight)
- [ ] Проверить APNs P8-ключ в EAS Credentials
- [ ] Загрузить если отсутствует: `eas credentials`
- [ ] Проверить серверные логи push_sender на `InvalidCredentials`
- [ ] Тест: `POST /qa/push/test-direct` → iPhone получает уведомление

### QA Data Cleanup (блокирует чистый UX)
- [ ] Задеплоить ветку (или cherry-pick endpoint)
- [ ] Выполнить dry-run на проде
- [ ] Подтвердить backup
- [ ] Выполнить мутирующий cleanup
- [ ] Проверить что дашборд чист
