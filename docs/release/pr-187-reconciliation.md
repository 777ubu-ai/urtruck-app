# PR #187 Reconciliation — `agent/comprehensive-10-10-audit-20260815`

**task_id:** urtruck-pr-187-reconciliation
**original_head_sha:** `84d57b9d5e841baa7db7becb898859791a3b6d2a`
**base_main_sha:** `d52b7c8f0d6e412ade3302c876365563865145f9`
**backup of original head:** tag `backup/pr-187-original-head`, branch `backup/pr-187-original` (both @ `84d57b9`)

## Метод
PR #187 создавался против старого main и разошёлся с текущим (`behind 138 / ahead 38`).
Ветка **пересобрана от текущего `origin/main`**; перенесены ТОЛЬКО подтверждённо
недостающие инварианты минимальным диффом. Слепой merge/rebase не выполнялся —
он вернул бы устаревший код и откатил новые map/FSM/i18n/deploy улучшения main.
Каждый инвариант классифицирован сверкой `origin/main` (d52b7c8) vs
`backup/pr-187-original-head` (84d57b9).

## Reconciliation matrix

| # | Область | Инвариант #187 | Статус в main | Решение | Доказательство |
|---|---------|----------------|---------------|---------|----------------|
| 1 | Chat privacy | Приватный чат сделки только после accept (send) | STILL_MISSING | **PORT** | `chat.py:send_message` в main проверял лишь участие, не статус сделки; добавлен `_assert_chat_is_accepted` |
| 2 | Chat privacy | Pre-accept комнаты скрыты из списка | STILL_MISSING | **PORT** | `my_rooms` в main без фильтра `deal_status`; добавлен фильтр по `_DEAL_CHAT_STATUSES` |
| 3 | Chat privacy | Приватный чат только после accept (read) | STILL_MISSING | **PORT** | `get_messages` в main без гейта; добавлен `_assert_chat_is_accepted` |
| 4 | Chat privacy | Бейдж непрочитанных только по accepted-комнатам | STILL_MISSING | закрыт транзитивно #1 | pre-accept сообщений больше нет → бейдж корректен без правки запроса |
| 5 | Documents | Накладная только по активной сделке / блок cancelled | STILL_MISSING | **PORT (в live-путь)** | live-путь `marketplace.py` waybill не фильтровал статус; добавлен 409 для cancelled/rejected |
| 6 | Documents | TTN привязан к авторизованной сделке, участники, IDOR fail-closed, schema-safe | ALREADY_IN_MAIN (сильнее) | не трогаем | live waybill: 403 не-участнику + HMAC signed-URL + TTL; `documents.py`-роутер #187 **осиротевший** (фронт его не вызывает) — его rewrite НЕ переносим |
| 7 | Reviews | Отзыв только после `completed` (получение подтверждено) | STILL_MISSING | **PORT** | main разрешал отзыв при `status != 'cancelled'` / `delivered`; ужесточено до `completed` (backend `reviews_dal` + 4 фронт-гейта) |
| 8 | FSM | Подтверждение получения грузоотправителем (delivered→completed) | ALREADY_IN_MAIN | не трогаем | `_DRIVER_ONLY_TRANSITIONS`/`_SHIPPER_ONLY_TRANSITIONS`, `_DEAL_FLOW` уже кодируют |
| 9 | FSM | Порядок delivered→completed, completed терминальный | ALREADY_IN_MAIN (SUPERSEDES #187) | **REJECT #187** | main `dealStatusOrder.js`: `awaiting_confirmation:4/delivered:5/completed:6`; версия #187 схлопывает ранги — регресс |
| 10 | FSM | Роль-проверка ДО идемпотентного повтора | STILL_MISSING (низкий риск) | **NOT PORTED (сознательно)** | в main все реальные переходы уже owner-guarded; #187 меняет лишь 200-no-op→403 для чужого повтора. Трогает горячий deal-status путь + требует правки `test_deal_status_actor_fsm.py` (в main +39 строк). Отложено как defense-in-depth |
| 11 | Push | Персист event_key + дедуп ретраев + миграция колонка-до-индекса | STILL_MISSING | **PORT (механизм+тест)** | main `push_sender`/`push_schema`/`push.py` не имели дедупа; добавлены `_event_key`/`_already_delivered`, колонка `event_key`, индекс через миграцию |
| 12 | Push | GPS-пуши идемпотентны per-transition | ALREADY handled by design | **NOT PORTED (сознательно)** | `_tracking_notify` в main уже short-circuit'ит повторы (early-return), а комментарий кода прямо ЗАПРЕЩАЕТ постоянный per-deal ключ («re-request must create fresh notification»). Наивный ключ #187 регрессировал бы легитимный повторный запрос GPS |
| 13 | Push | `_send_expo`/`info()` из #187 | DANGEROUS | **REJECT** | #187 (стар. база) возвращает `InvalidCredentials` в dead-token list (убивает валидные регистрации) и срезает диагностику `info()` — регресс против main |
| 14 | i18n | `deal_event_status_completed` (событие «получение подтверждено») | STILL_MISSING | **PORT (4 языка)** | ключ реально используется `DealRoom.js` (`t('deal_event_status_${p.status}')`), в main отсутствовал |
| 15 | i18n | Отдельное значение `status_delivered` (Доставлен≠Завершён) | DANGEROUS в текущем main | **REJECT** | `ChatsListScreen.js:48` мапит И `completed`, И `delivered` → `t('status_delivered')`; смена значения на «Доставлен» переименовала бы и completed-сделки. Требует отдельной доработки лейблов вне scope #187 |
| 16 | i18n | Ослабление `t()` fallback (RU вместо EN/ZH→EN), удаление `LEGACY_ZH_TRUCK_TYPES`, ZH `tent` → `帆布` | DANGEROUS | **REJECT** | регресс не-RU локалей и legacy ZH truck-types |
| 17 | Frontend misc | `AppConfirmModal`→`window.confirm`, drop `lang`-арг у normalizeCargo/cargoDisplay/tripDisplay, откат map/track в статик-тесте | DANGEROUS | **REJECT** | стар. база #187 — откат новых фич main |

## Что реально перенесено (STILL_MISSING → PORT)
- **Chat privacy** — `backend/api/chat.py`: `_assert_chat_is_accepted` (send/get) + фильтр `my_rooms`; статусы включают `awaiting_confirmation` (в main FSM он есть).
- **Documents status-gating** — `backend/api/marketplace.py` waybill_link/waybill_html: 409 для cancelled/rejected (в live-путь, НЕ в осиротевший documents.py).
- **Reviews** — `backend/database/reviews_dal.py` (`status='completed'`) + `src/screens/CargoDetail.js` (×2) + `src/screens/TripDetail.js` (×2): гейт с `delivered` → `completed`.
- **Push idempotency (механизм)** — `backend/database/push_schema.sql` (+колонка), `backend/api/push.py` (миграция колонка-до-индекса), `backend/services/push_sender.py` (`_event_key`/`_already_delivered`/`_log`/guard в `send`).
- **i18n** — `src/utils/i18n.js`: `deal_event_status_completed` ×4 языка.
- **Тесты** — портированы фикстуры `backend/tests/test_unread_badge.py`, `backend/tests/test_deal_rooms.py` (`_mk_accepted_deal`), новый `backend/tests/test_push_idempotency.py`.

## Что отклонено/не тронуто (не регрессируем main)
`dealStatusOrder.js` (main строго лучше), `documents.py` rewrite (осиротевший роутер), push `_send_expo`/`info()`, `status_delivered` relabel, `t()` fallback/`LEGACY_ZH_TRUCK_TYPES`/ZH tent, `AppConfirmModal`/`lang`-арг откаты, ownership-before-idempotency (отложено), GPS event_key stamping (противоречит дизайну main).

## Production impact
**NONE** — PR не смержен и не задеплоен.
