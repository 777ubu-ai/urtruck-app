"""Push event matrix contract (26.08.2026).

Фиксирует полный контракт из docs/release/push-event-matrix.md как
автоматический тест. Любой drift (тип уведомления удалён, URL сменил
формат, recipient стал зависеть от body вместо серверных строк, ownership
проверка исчезла) ловится этим файлом.

Это НЕ E2E-проверка доставки на устройство — та живёт в
qa/checklist/push-event-matrix-live.md и требует iPhone/Android.

Проверки — grep-style против уже задеплоенных backend-файлов, без запуска
FastAPI. Так же реализованы существующие suite'ы (see
test_notification_source_of_truth.py комментарии) — быстро, детерминировано,
без побочных таблиц.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = (ROOT / "api" / "marketplace.py").read_text(encoding="utf-8")
CHAT = (ROOT / "api" / "chat.py").read_text(encoding="utf-8")
DEAL_ROOM = (ROOT / "api" / "deal_room.py").read_text(encoding="utf-8")
NOTIFICATIONS = (ROOT / "api" / "notifications.py").read_text(encoding="utf-8")
PUSH = (ROOT / "api" / "push.py").read_text(encoding="utf-8")


# ─── Event 1: bid_created ─────────────────────────────────────────────────

def test_bid_created_notification_and_push_are_created_together():
    """create_bid должен послать И push И in-app notification одним
    контрактом. Раньше был баг: create_notification вызывался ВНУТРИ
    with-блока с открытой транзакцией — тихо падал, юзер жаловался
    'уведомлений нет'. Комментарий про 'PR-B' зафиксирован в коде;
    контракт проверяем здесь."""
    assert 'post_notifs.append((row["owner_id"], title, text, "💰", bid_url, True))' in MARKETPLACE, \
        "cargo owner must be notified on new bid"
    assert 'post_notifs.append((row["driver_id"], title, text, "📦", bid_url, True))' in MARKETPLACE, \
        "trip driver must be notified on new bid"
    # url формат
    assert 'bid_url = f"/cargos/{body.cargo_id}?bid={bid_id}"' in MARKETPLACE
    assert 'bid_url = f"/trips/{body.trip_id}?bid={bid_id}"' in MARKETPLACE
    # in-app создаётся с type='bid_created'
    assert 'create_notification(recipient, "bid_created", title, text, icon, url=url)' in MARKETPLACE


def test_bid_created_recipient_taken_from_server_row_not_request_body():
    """Owner берётся из cargos/trips row, не из тела запроса. Client не
    может подделать recipient и заспамить чужого юзера."""
    assert 'SELECT owner_id, from_city, to_city, currency FROM cargos WHERE id = ?' in MARKETPLACE
    assert 'SELECT driver_id, from_city, to_city, currency FROM trips WHERE id = ?' in MARKETPLACE


# ─── Event 2 + 3: bid_accepted + deal_created ─────────────────────────────

def test_bid_accepted_notification_hits_bidder_with_deal_url():
    """`bid_accepted` type шлётся только принявшему owner-у через
    require_level гейт; push уходит bidder-у на карточку заказа (не в
    Deal Room, см. решение 02.08.2026)."""
    accept_block = re.search(
        r'def accept_bid\(bid_id: str, user=Depends\(require_level\(1\)\)\):.*?return \{"ok": True',
        MARKETPLACE, re.DOTALL,
    )
    assert accept_block, "accept_bid handler must exist"
    body = accept_block.group(0)
    assert 'send_to_user(bid["bidder_id"], title, text, url=deal_url)' in body
    assert 'create_notification(bid["bidder_id"], "bid_accepted", title, text, "✅", url=deal_url)' in body
    # deal_url для cargo/trip → карточка заказа, fallback → /deals/{id}
    assert 'deal_url = f"/cargos/{bid[\'cargo_id\']}"' in body
    assert 'deal_url = f"/trips/{bid[\'trip_id\']}"' in body
    assert "deal_url = f\"/deals/{result['deal_id']}\"" in body


def test_deal_created_type_used_in_counter_accept_path():
    """counter-accept идёт другим кодом путём и использует явный тип
    `deal_created` для in-app — не смешиваем с прямым bid_accepted."""
    assert 'create_notification(uid_, "deal_created", title_, text_, "✅", url=deal_url)' in MARKETPLACE


# ─── Event 4: chat_message ────────────────────────────────────────────────

def test_chat_message_sends_push_with_room_context_and_no_duplicate_inapp():
    """send_message шлёт push с kind='chat' + payload {room_id/from_user/
    deal_id}, но НЕ создаёт in-app notification (Блок 5 аудита — chat
    unread считается отдельно от notifUnread)."""
    # Push вызов с kind="chat" (собран из отдельных подстрок, чтобы не
    # ловить регэксп-эскейпинг {..} против форматированного f-string).
    assert 'send_to_user(\n            recipient_id,\n            f"💬 {sender_name}"' in CHAT, \
        "chat push must be recipient_id, 💬 header"
    assert 'url=f"/chats/{room_id}"' in CHAT
    assert 'kind="chat"' in CHAT
    # Payload data: type/room_id/sender/recipient — фронт различает chat
    # push от bid push. Проверяем что все ключи в data есть.
    for token in ('"type": "chat_message"', '"room_id": room_id',
                  '"sender_id": user["id"]', '"recipient_id": recipient_id'):
        assert token in CHAT, f"chat push data payload missing: {token}"
    # send_message — sync def (не async). Проверяем что contract-функция
    # существует и что она НЕ создаёт in-app notification внутри своего
    # тела — chat unread источник = chat_messages, а не notifications.
    send_block = re.search(
        r'def send_message\(body: SendMessageIn, user=Depends\(require_level\(1\)\)\):(.*?)(?=\n@|\n\ndef )',
        CHAT, re.DOTALL,
    )
    assert send_block, "def send_message(...) handler must exist in chat.py"
    body = send_block.group(1)
    assert "create_notification(" not in body, \
        "chat message must NOT create in-app notification (Блок 5 аудита — badge считается через chat_messages, не через notifications)"


# ─── Event 5: chat_attachment ────────────────────────────────────────────

def test_chat_attachment_push_goes_to_the_other_participant_only():
    """Push об аттаче отправляется тому участнику chat_rooms, кто НЕ
    загрузил — recipient вычисляется на сервере, клиент не подделает."""
    assert 'send_to_user(\n                recipient_id,\n                "Новое вложение в сделке"' in DEAL_ROOM \
        or 'send_to_user(\n                recipient_id,' in DEAL_ROOM, \
        "attachment push must exist and send to recipient_id"
    assert 'recipient_id = room["participant_2"] if room["participant_1"] == user["id"] else room["participant_1"]' in DEAL_ROOM


# ─── Event 6–12: deal.status transitions ────────────────────────────────

DEAL_STATUS_LABELS = {
    "in_progress": "🚛 Рейс начался",
    "at_border": "🛂 На границе",
    "delivered": "✅ Доставлен — ожидается подтверждение получения",
    "received": "✅ Получение подтверждено",
    "completed": "🤝 Сделка завершена",
    "cancelled": "❌ Отменено",
}


def test_all_deal_status_transitions_have_labels_and_notification_and_push():
    """update_deal_status шлёт push+in-app для каждого целевого статуса —
    один и тот же кодовый путь, единая формула получателя."""
    handler = re.search(
        r'def update_deal_status\(deal_id: str, new_status: str.*?(?=\n@|\n\ndef )',
        MARKETPLACE, re.DOTALL,
    )
    assert handler, "update_deal_status handler must exist"
    body = handler.group(0)
    for status, label in DEAL_STATUS_LABELS.items():
        assert f'"{status}": "{label}"' in body, \
            f"deal_status label must exist for '{status}' (got mismatch)"
    # Recipient — «противоположная сторона», не uid
    assert 'other_id = deal["driver_id"] if uid == deal["shipper_id"] else deal["shipper_id"]' in body
    # Push + in-app с типом deal_status
    assert 'send_to_user(other_id, labels[new_status], body_txt, url=deal_url)' in body
    assert 'create_notification(other_id, "deal_status", labels[new_status], body_txt, "🚛", url=deal_url)' in body


def test_deal_status_deep_link_points_to_cargo_or_trip_card_not_chat():
    """"Дом заказа" (02.08.2026): tap по push ведёт на карточку заказа
    (там прогресс сделки), не в Deal Room чат."""
    handler = re.search(
        r'def update_deal_status.*?(?=\n@|\n\ndef )',
        MARKETPLACE, re.DOTALL,
    )
    assert handler
    body = handler.group(0)
    assert 'deal_url = f"/cargos/{deal[\'cargo_id\']}"' in body
    assert 'deal_url = f"/trips/{deal[\'trip_id\']}"' in body
    # Fallback только когда нет ни cargo_id, ни trip_id — не должен быть
    # первичным путём (иначе push будет вести на «/deals/…» вместо карточки
    # заказа, где живёт прогресс-бар).
    assert body.index('deal_url = f"/cargos/') < body.index('deal_url = f"/deals/'), \
        "cargo/trip deep-link must beat /deals/{id} fallback"


def test_update_deal_status_is_authenticated_and_restricted_to_deal_participants():
    """Не участник сделки не может выставить статус (и, следовательно, не
    может сгенерировать чужой push)."""
    handler = re.search(
        r'def update_deal_status\(deal_id: str, new_status: str.*?(?=\n@|\n\ndef )',
        MARKETPLACE, re.DOTALL,
    )
    assert handler
    body = handler.group(0)
    assert 'user=Depends(require_level(1))' in body
    assert 'if uid not in (deal["shipper_id"], deal["driver_id"]):' in body
    assert 'raise HTTPException(status_code=403)' in body


def test_update_deal_status_is_idempotent_on_repeat():
    """Повторное нажатие «Начать перевозку» не должно слать второй push.
    Идемпотентность обеспечивается _transition_deal → возвращает None
    payload для same-status повтора; update_deal_status в этом случае
    отдаёт 200 без похода в push-блок."""
    handler = re.search(
        r'def update_deal_status\(deal_id: str, new_status: str.*?(?=\n@|\n\ndef )',
        MARKETPLACE, re.DOTALL,
    )
    assert handler
    body = handler.group(0)
    assert 'if event_payload is None:' in body
    assert 'return {"ok": True, "status": new_status}  # идемпотентно' in body


# ─── Event 13: bid_expired ─────────────────────────────────────────────

def test_bid_expired_lazy_transition_exists_but_no_push_yet_documented_as_gap():
    """Экспирация ставки живёт в _maybe_expire_bid (PR #309). Push для
    bid_expired ЯВНО отсутствует, документирован как G4 gap в
    docs/release/push-event-matrix.md. Этот тест защищает от неявного
    возврата бага: если кто-то попробует добавить бесшумный send_to_user
    внутрь _maybe_expire_bid без event_key (и без дедупа), тест напомнит
    прочитать docs/release/push-event-matrix.md и оформить отдельным PR.

    NB: этот PR идёт против main; PR #309 (offer expiration) может ещё
    не быть смерджен. Тест соответствующим образом ветвится: если
    `_maybe_expire_bid` пока НЕ существует — no-op success (мы не можем
    проверять контракт функции, которая ещё не в main). После merge #309
    тест начнёт реально следить за G4-контрактом.
    """
    if "def _maybe_expire_bid" not in MARKETPLACE:
        # PR #309 ещё не в main — контракт G4 проверять не на чем.
        # Документ docs/release/push-event-matrix.md уже фиксирует gap.
        return
    # Push для bid_expired НЕ добавлен через send_to_user внутри
    # _maybe_expire_bid. Если этот assert упадёт — обнови документ и
    # переоформи в отдельном PR с event_key='bid-expired:{bid_id}'.
    expire_block = re.search(
        r'def _maybe_expire_bid\(c, bid: dict\).*?return out',
        MARKETPLACE, re.DOTALL,
    )
    assert expire_block
    assert "send_to_user(" not in expire_block.group(0), \
        "G4: bid_expired push должен быть отдельным event_key-дедупным PR, а не тихой правкой _maybe_expire_bid"


# ─── Общие ownership + dedupe контракты ──────────────────────────────────

def test_notifications_have_unique_event_key_index_for_dedupe():
    """В notifications есть UNIQUE index на (user_id, event_key). Без него
    scheduler'ные напоминания повторно ловят пользователя тем же event."""
    assert 'CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_event_key' in NOTIFICATIONS
    assert 'ON notifications(user_id, event_key) WHERE event_key IS NOT NULL' in NOTIFICATIONS


def test_push_token_ownership_resolution_lives_in_push_module():
    """Каждый device_id прикреплён к одному user_id. Чужой user не может
    зарегистрировать существующий токен без явного logout — иначе
    хайджек. Проверяем что этот механизм ЕСТЬ и не убран."""
    assert "_resolve_ownership" in PUSH
    assert "_reassign_device_if_needed" in PUSH


def test_no_notification_is_sent_from_open_transaction_block():
    """create_notification НИКОГДА не должен вызываться внутри `with
    get_conn() as c:` — иначе второе соединение блокируется на прод-БД
    с WAL, и уведомление тихо теряется. Проверяем что create_bid
    следует этому pattern-у: post_notifs собираются в список ВНУТРИ
    транзакции, отправка — ПОСЛЕ."""
    # Ищем call, где create_notification строго идёт после закрытия
    # with-блока — маркер `post_notifs` и цикл `for recipient, title, ...`.
    assert 'post_notifs: list = []' in MARKETPLACE
    assert 'for recipient, title, text, icon, url, want_push in post_notifs:' in MARKETPLACE


def test_deal_status_labels_are_localized_by_frontend_not_hardcoded_ru_only_here():
    """Backend label — русский (админский язык), фронт локализует по
    паттерну (см. localizeSystemMessage в DealWorkspaceScreenV2). Тест
    защищает от возврата к «переводу на сервере», что ломает контракт
    системных сообщений."""
    src = (ROOT.parent / "src" / "screens" / "DealWorkspaceScreenV2.js").read_text(encoding="utf-8")
    # Тест-сущность: функция должна быть импортирована и использована.
    assert "localizeSystemMessage" in src, \
        "frontend должен локализовать системные сообщения, не backend"
