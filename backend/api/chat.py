"""Server-side Chat API. Сообщения сохраняются в БД."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from database.db import get_conn, new_id
from api.verification_gate import require_level
from api.push import send_to_user

chat_router = APIRouter()

# Специальные юзеры
SUPPORT_ID = "urtruck-support-bot"
SUPPORT_NAME = "Поддержка UrTruck"
VOLODYA_ID = "ai-volodya-test"
VOLODYA_NAME = "ИИ Володя (Тест)"

# Demo bots (Володя and friends) leak into production unless explicitly
# enabled. Required by the chat hygiene step: real users must not see test
# personas, but devs can flip the flag to keep the chat plumbing test-friendly.
ENABLE_DEMO_CHAT = os.getenv("ENABLE_DEMO_CHAT", "false").lower() in ("1", "true", "yes")


def _ensure_special_users():
    """Создаёт Support (always) и Володю (только если ENABLE_DEMO_CHAT)."""
    specials = [(SUPPORT_ID, SUPPORT_NAME, "support", None)]
    if ENABLE_DEMO_CHAT:
        specials.append((VOLODYA_ID, VOLODYA_NAME, "driver", "tent"))
    with get_conn() as c:
        for uid, name, role, vtype in specials:
            exists = c.execute("SELECT 1 FROM drivers_registration WHERE id = ?", (uid,)).fetchone()
            if not exists:
                c.execute(
                    "INSERT INTO drivers_registration (id, phone, full_name, role, status, verification_level, vehicle_type) "
                    "VALUES (?, ?, ?, ?, 'approved', 3, ?)",
                    (uid, f"bot_{uid[:8]}", name, role, vtype),
                )
        # If the flag is off but Володя already exists from earlier runs,
        # rename his row to a non-public placeholder so /contacts and chat
        # listings don't show the demo persona. We deliberately do not delete
        # the row — old chat_messages.sender_id refs would orphan.
        if not ENABLE_DEMO_CHAT:
            c.execute(
                "UPDATE drivers_registration SET full_name = ?, status = 'archived' "
                "WHERE id = ?",
                ("(скрытый тестовый бот)", VOLODYA_ID),
            )


def _count_bot_messages_in_room(room_id: str, bot_id: str) -> int:
    with get_conn() as c:
        r = c.execute("SELECT COUNT(*) FROM chat_messages WHERE room_id = ? AND sender_id = ?", (room_id, bot_id)).fetchone()
    return r[0] if r else 0


def _bot_send(room_id: str, sender_id: str, text: str):
    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text) VALUES (?,?,?)",
            (room_id, sender_id, text),
        )
        c.execute("UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?",
                   (text[:50], room_id))


def _maybe_support_reply(room_id: str, user: dict):
    """Support отвечает ОДИН РАЗ — приветствие. Не перебивает живых."""
    if _count_bot_messages_in_room(room_id, SUPPORT_ID) > 0:
        return  # уже ответил — молчит
    name = user.get("full_name") or user.get("phone") or "друг"
    _bot_send(room_id, SUPPORT_ID,
        f"👋 Здравствуйте, {name}!\n\n"
        f"Я — UrTruck Support. Менеджер ответит в рабочее время (09:00-18:00 KZ).\n\n"
        f"А пока могу помочь:\n"
        f"• Как опубликовать груз?\n"
        f"• Как найти водителя?\n"
        f"• Проблема с регистрацией?\n\n"
        f"Напишите ваш вопрос — передам менеджеру."
    )


def _volodya_reply(room_id: str, user_text: str, user: dict):
    """ИИ Володя — тестовый водитель. Контекстные ответы."""
    text_lower = (user_text or "").lower()

    if "цен" in text_lower or "сколько" in text_lower or "price" in text_lower:
        reply = "🚛 Зависит от маршрута. Алматы→Москва: $3000-4000 тентом. Реф +30%. Скиньте точный маршрут — посчитаю."
    elif "маршрут" in text_lower or "откуда" in text_lower or "куда" in text_lower:
        reply = "📍 Я сейчас в Алматы. Готов выехать в направлении Астана, Москва, Ташкент. Когда загрузка?"
    elif "когда" in text_lower or "срок" in text_lower or "дата" in text_lower:
        reply = "📅 Могу выехать завтра утром. Доставка Алматы→Москва ~5-7 дней. Астана — 1 день."
    elif "привет" in text_lower or "здравст" in text_lower or "салам" in text_lower or "hello" in text_lower:
        name = user.get("full_name") or "друг"
        reply = f"👋 Привет, {name}! Я Володя, водитель-тент 22т KAMAZ. Чем могу помочь?"
    elif "груз" in text_lower or "товар" in text_lower or "загрузк" in text_lower:
        reply = "📦 Какой груз? Тент 22т, длина 13.6м. Беру всё кроме опасных. Фото кузова могу скинуть."
    elif "документ" in text_lower or "ттн" in text_lower or "cmr" in text_lower:
        reply = "📄 ТТН оформлю. CMR есть. Все документы для границы в порядке."
    elif "голос" in text_lower or "аудио" in text_lower or "voice" in text_lower:
        reply = "🎤 Получил голосовое. К сожалению, пока могу отвечать только текстом. Напишите суть — отвечу."
    else:
        reply = "✅ Понял. Уточните детали — маршрут, дату загрузки и тип груза. Посчитаю цену."

    _bot_send(room_id, VOLODYA_ID, reply)


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "chat_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()
    _ensure_special_users()

_init()


def _get_or_create_room(user1: str, user2: str, cargo_id: str = None, trip_id: str = None) -> str:
    p1, p2 = sorted([user1, user2])
    with get_conn() as c:
        row = c.execute("SELECT id FROM chat_rooms WHERE participant_1 = ? AND participant_2 = ?", (p1, p2)).fetchone()
        if row:
            return row["id"]
        rid = new_id()
        c.execute(
            "INSERT INTO chat_rooms (id, participant_1, participant_2, cargo_id, trip_id) VALUES (?,?,?,?,?)",
            (rid, p1, p2, cargo_id, trip_id),
        )
        return rid


class SendMessageIn(BaseModel):
    to_user_id: str
    text: Optional[str] = None
    photo_url: Optional[str] = None
    is_voice: bool = False
    voice_duration: Optional[int] = None
    cargo_id: Optional[str] = None
    trip_id: Optional[str] = None


@chat_router.post("/send")
def send_message(body: SendMessageIn, user=Depends(require_level(1))):
    if not body.text and not body.photo_url:
        raise HTTPException(status_code=400, detail="text или photo_url обязателен")

    room_id = _get_or_create_room(user["id"], body.to_user_id, body.cargo_id, body.trip_id)

    with get_conn() as c:
        c.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text, photo_url, is_voice, voice_duration) VALUES (?,?,?,?,?,?)",
            (room_id, user["id"], body.text, body.photo_url, 1 if body.is_voice else 0, body.voice_duration),
        )
        preview = (body.text or "📷 Фото")[:50]
        c.execute("UPDATE chat_rooms SET last_message = ?, last_at = CURRENT_TIMESTAMP WHERE id = ?", (preview, room_id))

    # Push получателю
    # PR-C2 (P0-2): kind='chat' — push_sender вычислит unread badge
    # для iOS APNs (красный кружок на иконке UrTruck на home screen).
    # data.type='chat_message' позволит фронту в onNotificationReceived
    # отличить chat push от bid push и не дублировать banner если
    # пользователь сейчас открыл эту же комнату.
    try:
        sender_name = user.get("full_name") or user.get("phone") or "Пользователь"
        send_to_user(
            body.to_user_id,
            f"💬 {sender_name}",
            preview,
            url=f"/chats/{room_id}",
            kind="chat",
            data={"type": "chat_message", "room_id": room_id},
        )
    except Exception:
        pass

    # ИИ Support: если получатель = SUPPORT_ID и менеджер офлайн → один ответ
    if body.to_user_id == SUPPORT_ID:
        _maybe_support_reply(room_id, user)

    # ИИ Володя (тестовый водитель): только если ENABLE_DEMO_CHAT.
    if body.to_user_id == VOLODYA_ID and ENABLE_DEMO_CHAT:
        _volodya_reply(room_id, body.text or "", user)

    return {"ok": True, "room_id": room_id}


@chat_router.get("/rooms")
def my_rooms(user=Depends(require_level(1))):
    uid = user["id"]
    with get_conn() as c:
        rows = c.execute("""
            SELECT r.*,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = r.id AND m.is_read = 0 AND m.sender_id != ?) as unread
            FROM chat_rooms r
            WHERE r.participant_1 = ? OR r.participant_2 = ?
            ORDER BY r.last_at DESC LIMIT 50
        """, (uid, uid, uid)).fetchall()

    rooms = []
    for r in rows:
        d = dict(r)
        other_id = d["participant_2"] if d["participant_1"] == uid else d["participant_1"]
        # Имя собеседника
        partner = c.execute("SELECT full_name, phone FROM drivers_registration WHERE id = ?", (other_id,)).fetchone() if False else None
        d["partner_id"] = other_id
        d["partner_name"] = None
        rooms.append(d)

    # Дотягиваем имена
    # PR-C2 (P0-3 "Собеседник" → real name): backend fallback chain.
    # До этого partner_name мог приходить null если у user'a full_name
    # пустой в drivers_registration. Фронт показывал «Собеседник», что
    # пользователю не понятно («кто это?»).
    # Теперь: full_name → phone-tail (последние 4 цифры) → "Пользователь
    # UrTruck". Frontend prettifyPartnerName ничего не подменяет если
    # backend дал осмысленное значение.
    def _phone_tail(phone):
        if not phone or not isinstance(phone, str):
            return None
        digits = "".join(ch for ch in phone if ch.isdigit())
        return f"+{digits[-4:]}" if len(digits) >= 4 else None
    with get_conn() as c:
        for room in rooms:
            p = c.execute("SELECT full_name, phone FROM drivers_registration WHERE id = ?", (room["partner_id"],)).fetchone()
            if p:
                full = (p["full_name"] or "").strip() if p["full_name"] else ""
                tail = _phone_tail(p["phone"])
                room["partner_name"] = full or tail or "Пользователь UrTruck"
            else:
                room["partner_name"] = "Пользователь UrTruck"
    # Hide demo bot rooms in production. Old chat history is preserved on disk
    # — we just don't surface it through /rooms unless ENABLE_DEMO_CHAT=true.
    if not ENABLE_DEMO_CHAT:
        rooms = [r for r in rooms if r.get("partner_id") != VOLODYA_ID]

    # PR2.1 — обогащение deal-context для Deal Room UI. Старые поля выше НЕ
    # трогаем (обратная совместимость). Новые поля добавляются дополнительно;
    # если данных в БД нет — null, без выдумок. Доступ уже ограничен выше
    # (WHERE participant_1/2 = uid), поэтому JOIN'ы не раскрывают чужие комнаты.
    _enrich_rooms_with_deal_context(rooms, uid)
    return {"rooms": rooms}


def _enrich_rooms_with_deal_context(rooms: list, uid: str) -> None:
    """Дотягивает deal/cargo/partner/support контекст в каждую комнату in-place.

    Источники: deals (по chat_room_id), cargos (маршрут/груз), drivers_registration
    (роль/госномер партнёра), support_escalations (статус поддержки). Все новые
    поля nullable — отсутствие данных => None, не fake.
    """
    if not rooms:
        return
    with get_conn() as c:
        for room in rooms:
            room_id = room.get("id")
            partner_id = room.get("partner_id")

            # значения по умолчанию (контракт стабилен даже без сделки)
            room.setdefault("room_id", room_id)
            room.update({
                "deal_id": None, "partner_company": None, "partner_role": None,
                "route_from": None, "route_to": None, "route_label": None,
                "cargo_title": None, "cargo_type": None, "cargo_weight": None,
                "deal_status": None, "bid_amount": None, "bid_currency": None,
                "vehicle_plate": None,
                "unread_count": room.get("unread", 0),
                "last_message_at": room.get("last_at"),
                "support_status": None, "is_support": False,
                "is_dispute": False, "priority": None,
            })

            # --- сделка по комнате ---
            deal = c.execute(
                "SELECT id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
                "from_city, to_city, amount, status FROM deals WHERE chat_room_id = ? "
                "ORDER BY created_at DESC LIMIT 1",
                (room_id,),
            ).fetchone()
            if deal:
                deal = dict(deal)
                room["deal_id"] = deal["id"]
                room["deal_status"] = deal.get("status")
                room["bid_amount"] = deal.get("amount")
                room["route_from"] = deal.get("from_city")
                room["route_to"] = deal.get("to_city")
                if deal.get("from_city") and deal.get("to_city"):
                    room["route_label"] = f"{deal['from_city']} → {deal['to_city']}"
                # роль партнёра из сделки
                if partner_id == deal.get("driver_id"):
                    room["partner_role"] = "driver"
                elif partner_id == deal.get("shipper_id"):
                    room["partner_role"] = "client"
                # груз + валюта из cargos
                if deal.get("cargo_id"):
                    cargo = c.execute(
                        "SELECT cargo_desc, cargo_type, weight_tons, currency, "
                        "from_city, to_city FROM cargos WHERE id = ?",
                        (deal["cargo_id"],),
                    ).fetchone()
                    if cargo:
                        cargo = dict(cargo)
                        room["cargo_title"] = cargo.get("cargo_desc")
                        room["cargo_type"] = cargo.get("cargo_type")
                        room["cargo_weight"] = cargo.get("weight_tons")
                        room["bid_currency"] = cargo.get("currency")
                        if not room["route_label"] and cargo.get("from_city") and cargo.get("to_city"):
                            room["route_from"] = cargo["from_city"]
                            room["route_to"] = cargo["to_city"]
                            room["route_label"] = f"{cargo['from_city']} → {cargo['to_city']}"

            # --- support / роль партнёра-бота ---
            if partner_id == SUPPORT_ID:
                room["is_support"] = True
                room["partner_role"] = "support"

            # --- партнёр: компания/госномер/роль (если не из сделки) ---
            if partner_id:
                p = c.execute(
                    "SELECT role, vehicle_plate, legal_form FROM drivers_registration WHERE id = ?",
                    (partner_id,),
                ).fetchone()
                if p:
                    p = dict(p)
                    room["vehicle_plate"] = p.get("vehicle_plate")
                    room["partner_company"] = p.get("legal_form")
                    if not room["partner_role"] and p.get("role") in ("driver", "client", "support"):
                        room["partner_role"] = p.get("role")

            # --- эскалация в поддержку (таблица из PR #60, если есть) ---
            try:
                esc = c.execute(
                    "SELECT status FROM support_escalations WHERE conversation_id = ? "
                    "ORDER BY created_at DESC LIMIT 1",
                    (room_id,),
                ).fetchone()
                if esc:
                    room["support_status"] = esc["status"]
                    if esc["status"] in ("open", "assigned"):
                        room["priority"] = "support"
            except Exception:
                # таблицы может не быть на старых БД — не критично
                pass


@chat_router.get("/messages/{room_id}")
def get_messages(room_id: str, limit: int = 100, offset: int = 0, user=Depends(require_level(1))):
    uid = user["id"]
    with get_conn() as c:
        # Проверка что юзер участник
        room = c.execute("SELECT * FROM chat_rooms WHERE id = ?", (room_id,)).fetchone()
        if not room:
            raise HTTPException(status_code=404)
        if uid not in (room["participant_1"], room["participant_2"]):
            raise HTTPException(status_code=403, detail="Вы не участник этого чата")

        rows = c.execute(
            "SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (room_id, limit, offset),
        ).fetchall()

        # Отмечаем как прочитанные
        c.execute(
            "UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ? AND is_read = 0",
            (room_id, uid),
        )

    return {"messages": [dict(r) for r in reversed(rows)], "room": dict(room)}


@chat_router.get("/contacts")
def special_contacts():
    """Список постоянных контактов. По умолчанию — только Support.
    Володя возвращается только при ENABLE_DEMO_CHAT=true."""
    contacts = [
        {"id": SUPPORT_ID, "name": SUPPORT_NAME, "role": "support", "icon": "🛡", "online": True,
         "desc": "Поддержка — ответим на любой вопрос"},
    ]
    if ENABLE_DEMO_CHAT:
        contacts.append(
            {"id": VOLODYA_ID, "name": VOLODYA_NAME, "role": "driver", "icon": "🚛", "online": True,
             "desc": "Тестовый водитель — проверьте как работает чат"},
        )
    return {"contacts": contacts}


@chat_router.get("/unread")
def unread_count(user=Depends(require_level(1))):
    uid = user["id"]
    with get_conn() as c:
        row = c.execute("""
            SELECT COUNT(*) as cnt FROM chat_messages m
            JOIN chat_rooms r ON m.room_id = r.id
            WHERE (r.participant_1 = ? OR r.participant_2 = ?)
              AND m.sender_id != ? AND m.is_read = 0
        """, (uid, uid, uid)).fetchone()
    return {"unread": row["cnt"] if row else 0}


# ── Translation ──

@chat_router.get("/translate/info")
def translate_info():
    """Debug: какой провайдер, есть ли ключ. Сам ключ НЕ показывает."""
    from services.translate_service import get_info
    return get_info()

class TranslateIn(BaseModel):
    message_id: int
    target_lang: str

@chat_router.post("/translate")
def translate_message(body: TranslateIn, user=Depends(require_level(1))):
    """Перевести сообщение чата. Кэшируется."""
    from services.translate_service import translate_text

    # Инициализация таблицы переводов
    schema = Path(__file__).resolve().parent.parent / "database" / "translations_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))

    with get_conn() as c:
        # Проверяем что сообщение существует и юзер имеет доступ
        msg = c.execute("SELECT * FROM chat_messages WHERE id = ?", (body.message_id,)).fetchone()
        if not msg:
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        room = c.execute("SELECT * FROM chat_rooms WHERE id = ?", (msg["room_id"],)).fetchone()
        if not room or user["id"] not in (room["participant_1"], room["participant_2"]):
            raise HTTPException(status_code=403)

        # Проверяем кэш
        cached = c.execute(
            "SELECT translated_text, provider FROM chat_translations WHERE message_id = ? AND target_lang = ?",
            (body.message_id, body.target_lang),
        ).fetchone()
        if cached:
            return {
                "translated_text": cached["translated_text"],
                "original_text": msg["text"],
                "target_lang": body.target_lang,
                "provider": cached["provider"],
                "cached": True,
            }

    # Переводим
    result = translate_text(msg["text"] or "", body.target_lang)

    # Сохраняем в кэш
    with get_conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO chat_translations (message_id, target_lang, translated_text, provider) VALUES (?,?,?,?)",
            (body.message_id, body.target_lang, result["translated_text"], result["provider"]),
        )

    return {
        "translated_text": result["translated_text"],
        "original_text": msg["text"],
        "target_lang": body.target_lang,
        "provider": result["provider"],
        "cached": False,
    }
