import sqlite3

from api import chat
from services import translate_service


def _conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    schema = (chat.Path(__file__).resolve().parent.parent / "database" / "translations_schema.sql")
    c.executescript(schema.read_text(encoding="utf-8"))
    return c


def test_shared_exact_translation_reused_without_source_text_storage(monkeypatch):
    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("TRANSLATE_MODEL", "gpt-4o-mini")
    c = _conn()
    chat._translation_memory_store(c, "  Привет  ", "ru", "zh", "你好", "openai")

    row = chat._translation_memory_lookup(c, "Привет", "ru", "zh")
    assert row["translated_text"] == "你好"
    stored = c.execute("SELECT source_hash, hit_count FROM translation_memory").fetchone()
    assert stored["source_hash"] != "Привет"
    assert stored["hit_count"] == 1


def test_shared_translation_isolated_by_target_model_and_prompt(monkeypatch):
    monkeypatch.setenv("TRANSLATE_PROVIDER", "openai")
    monkeypatch.setenv("TRANSLATE_MODEL", "gpt-4o-mini")
    c = _conn()
    chat._translation_memory_store(c, "Привет", "ru", "zh", "你好", "openai")

    assert chat._translation_memory_lookup(c, "Привет", "ru", "en") is None
    monkeypatch.setenv("TRANSLATE_MODEL", "gpt-transcribe")
    assert chat._translation_memory_lookup(c, "Привет", "ru", "zh") is None


def test_failed_or_stub_translation_is_never_cached(monkeypatch):
    monkeypatch.setenv("TRANSLATE_PROVIDER", "stub")
    c = _conn()
    chat._translation_memory_store(c, "Привет", "ru", "zh", "Привет", "stub")
    assert c.execute("SELECT COUNT(*) FROM translation_memory").fetchone()[0] == 0
