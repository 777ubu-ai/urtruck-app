# BACKEND DEPLOY PREFLIGHT — Variant B (canonical chat rooms)

> Деплой НЕ выполнен. Это preflight-отчёт. Вердикт внизу. Деплой — только после явного «ок» владельца.

## 1. Backend-diff Variant B
Один коммит: **`318789a`**. Backend-файлы (на ветке `integration/build-30`):
| Файл | Что |
|---|---|
| `backend/database/chat_schema.sql` | новая `chat_rooms`: +`owner_id/bidder_id/bid_id/deal_key`, `UNIQUE(deal_key)` вместо `UNIQUE(participant_1,participant_2)` |
| `backend/api/chat.py` | `_deal_key`, `_migrate_canonical_rooms` (миграция при старте), `_upsert_room`, `get_or_create_deal_room`, `/chat/send` принимает `room_id`, payload уведомления, порядок `_init` |
| `backend/api/marketplace.py` | `_ensure_chat_room_inline` на каноническом ключе, ставка возвращает `room_id` |
| `backend/tests/test_deal_rooms.py` | тесты (не рантайм) |

Зависимостей/конфигов/новых пакетов **нет**. chat.py импортит только существующее (`database.db`, `api.verification_gate`, `api.push`).

## 2. Миграция — безопасность (dry-run на легаси-БД выполнен)
- Что делает `_migrate_canonical_rooms` (идемпотентно, guard по колонке `deal_key`): пересоздаёт `chat_rooms` (новые колонки + `UNIQUE(deal_key)`), **переносит все строки** (id сохраняются), бэкфиллит `deal_key` (`c:/t:/p:`) и роли `owner_id/bidder_id` из `deals`.
- Таблицы/колонки: +`owner_id,bidder_id,bid_id,deal_key` в `chat_rooms`; `chat_messages/bids/deals` — **не трогаются**.
- Аддитивно по данным: **строки не теряются** (dry-run: 3 комнаты → 3, 3 сообщения → 3, id целы).
- Блокировки: `chat_rooms` маленькая (комнаты сделок) → rebuild в транзакции мгновенный, без долгих локов.
- `deal_key` уникальны (dry-run: `c:cargo1:aaa:bbb`, `t:trip1:ccc:ddd`, `p:eee:support_bot`).
- Дубль-комнаты: новый `UNIQUE(deal_key)` гарантирует одну комнату на (cargo+пара).
- **Откат:** ⚠️ старый код на новой схеме **ЛОМАЕТСЯ** (`ON CONFLICT(participant_1,participant_2)` → «does not match any UNIQUE constraint»). Значит миграция **НЕ обратима откатом кода** → откат = **восстановление БД из бэкапа**. Бэкап перед деплоем — ОБЯЗАТЕЛЕН.

## 3. Обратная совместимость (клиенты)
- `/chat/send`: `to_user_id` стал Optional, добавлен `room_id`. **Старое приложение** (шлёт `to_user_id`+`cargo_id`) → ветка `elif to_user_id` → работает (deal_key по cargo+паре → та же комната). **Новое** (шлёт `room_id`) → ветка room_id. ✅
- `/chat/rooms`, `/chat/messages`, `/chat/unread`: сигнатуры **без изменений**, существующие комнаты/сообщения видны (id целы). ✅
- Потери данных нет, форс-логаута нет. ✅
- ⚠️ Мелкий edge: легаси-комната с `cargo_id=NULL` получает `deal_key=p:...`; если клиент позже шлёт с `cargo_id` → `deal_key=c:...` = другая комната (история могла бы разойтись). На практике deal-комнаты создавались с `cargo_id` (через `_ensure_chat_room_inline`) → `c:` → совпадают. Риск низкий; support-чат (p:) и так per-пара.

## 4. Production readiness (выполнено)
- `backend/tests/test_deal_rooms.py` — **5/5 PASS**.
- import api.chat + api.marketplace — **OK**.
- Миграция dry-run на легаси-БД — **PASS** (см. §2).
- E2E/матрица (ранее) — PASS.

## 5. План деплоя (исполняет владелец/терминал — у меня нет SSH к серверу)
1. **Бэкап БД (обязательно):** `cp /home/ubuntu/urtruck-security/database/security.db security.db.bak-$(date +%F-%H%M)`
2. **Решение scope** (см. риски): либо 3 файла (chat.py, marketplace.py, chat_schema.sql) из build-30, либо весь backend build-30.
3. Скопировать на сервер в `$BACKEND_DIR`, **рестарт PM2** `urtruck-security-api` → миграция применится на старте автоматически.
4. Пост-чеки (§6).

⚠️ CI (`deploy.yml`) деплоит backend **на push в main** — но мерж запрещён. Поэтому деплой **ручной** (scp+ssh), без мержа.

## 6. Пост-деплой проверки на проде
- `curl https://urtruck.kz/health` → ok
- `/chat/send` принимает `room_id` (участник комнаты)
- `/market/bids` возвращает `room_id`
- каноничность: повтор get_or_create → тот же room
- payload уведомления содержит `room_id/cargo_id/bid_id`
- старый путь (`to_user_id`) ещё работает
- в логе старта: «deactivated…»/миграция применилась один раз

## 7. План отката
- **Код:** вернуть прежний backend-коммит (redeploy старого).
- **БД:** ⚠️ просто откат кода НЕ работает (старый код несовместим с новой `chat_rooms`). Откат = **восстановить `security.db` из бэкапа** (шаг 5.1) + redeploy старого кода.
- **Быстрое «отключить новый путь»:** отдельного флага нет → механизм отката = бэкап-restore. Поэтому бэкап критичен.
- Подтверждение восстановления: `curl /health` ok + `/chat/send` старого пути работает.

---

## ВЕРДИКТ: **A. BACKEND DEPLOY READY — требуется одобрение владельца**

Кода/миграции/тестов — зелено. Жёстких блокеров нет. **Условия деплоя (обязательные):**
1. **Бэкап prod-БД до рестарта** (миграция не обратима откатом кода).
2. **Решить scope** деплоя: 3 файла vs весь build-30 backend (рекомендую весь build-30 backend — это протестированный цельный юнит; 3 файла самодостаточны, но цельный безопаснее по консистентности).
3. Исполнение — владелец/терминал (у облачного Claude нет SSH к `185.22.65.11`).
4. Откат = restore из бэкапа + старый код.

Решения от тебя: (1) подтвердить прод-деплой; (2) выбрать scope (3 файла / весь backend); (3) кто исполняет (терминал с SSH или ты).
