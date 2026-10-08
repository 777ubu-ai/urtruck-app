
# Production compatibility for clients using the explicit voice-text API.
@chat_router.get("/voice/{message_id}/text")
def production_voice_text_compat(message_id: int, target_lang: Optional[str] = None,
                                 user=Depends(require_level(1))):
    """Read only cached text; an explicit client tap can use /transcribe next."""
    _ensure_translation_schema()
    target = _normalize_lang_code(target_lang)
    with get_conn() as c:
        msg = c.execute("SELECT * FROM chat_messages WHERE id = ?", (message_id,)).fetchone()
        if not msg:
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        if not msg["is_voice"]:
            raise HTTPException(status_code=400, detail="Это не голосовое сообщение")
        room = c.execute("SELECT * FROM chat_rooms WHERE id = ?", (msg["room_id"],)).fetchone()
        if not room or user["id"] not in (room["participant_1"], room["participant_2"]):
            raise HTTPException(status_code=403)
        partner = room["participant_2"] if room["participant_1"] == user["id"] else room["participant_1"]
        _assert_chat_is_accepted(user["id"], partner, room_id=room["id"],
                                cargo_id=room["cargo_id"], trip_id=room["trip_id"])
        text = (msg["voice_transcript"] or "").strip()
        if not text:
            return {"status": "unavailable", "message_id": message_id}
        translation = c.execute(
            "SELECT translated_text, provider FROM chat_translations WHERE message_id = ? AND target_lang = ?",
            (message_id, target),
        ).fetchone() if target else None
        return {
            "status": "ready", "message_id": message_id,
            "transcript_text": text, "source_lang": msg["voice_transcript_lang"],
            "provider": msg["voice_transcript_provider"],
            "translated_text": translation["translated_text"] if translation else None,
            "translation_provider": translation["provider"] if translation else None,
            "target_lang": target,
        }
