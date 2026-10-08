import ast
import contextlib
import pathlib
import sqlite3
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SNIPPET = ROOT / "scripts/ops/production_voice_text_compat.py"

class HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        self.status_code = status_code

class VoiceCompatTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE chat_rooms(id TEXT, participant_1 TEXT, participant_2 TEXT, cargo_id TEXT, trip_id TEXT);
            CREATE TABLE chat_messages(id INTEGER, room_id TEXT, is_voice INTEGER, voice_transcript TEXT,
                voice_transcript_lang TEXT, voice_transcript_provider TEXT);
            CREATE TABLE chat_translations(message_id INTEGER, target_lang TEXT, translated_text TEXT, provider TEXT);
            INSERT INTO chat_rooms VALUES ('room','shipper','driver','cargo',NULL);
            INSERT INTO chat_messages VALUES (1,'room',1,NULL,NULL,NULL);
            INSERT INTO chat_messages VALUES (2,'room',1,'你好','zh','openai');
            INSERT INTO chat_messages VALUES (3,'room',0,NULL,NULL,NULL);
            INSERT INTO chat_translations VALUES (2,'ru','Здравствуйте','openai');
        """)
        self.accepted = True
        self.guards = []
        def guard(*args, **kwargs):
            self.guards.append((args, kwargs))
            if not self.accepted:
                raise HTTPException(403)
        ns = {
            "chat_router": types.SimpleNamespace(get=lambda path: lambda f: f),
            "Optional": __import__("typing").Optional,
            "Depends": lambda x: x, "require_level": lambda level: None,
            "_ensure_translation_schema": lambda: None,
            "_normalize_lang_code": lambda value: value.split("-")[0] if value else None,
            "get_conn": lambda: contextlib.nullcontext(self.db),
            "_assert_chat_is_accepted": guard, "HTTPException": HTTPException,
        }
        exec(compile(SNIPPET.read_text(), str(SNIPPET), "exec"), ns)
        self.read = ns["production_voice_text_compat"]

    def tearDown(self):
        self.db.close()

    def test_uncached_voice_returns_unavailable_without_inference(self):
        self.assertEqual(self.read(1, "ru", {"id":"shipper"}), {"status":"unavailable","message_id":1})
        self.assertEqual(len(self.guards), 1)

    def test_cached_voice_returns_original_and_requested_translation(self):
        result = self.read(2, "ru", {"id":"shipper"})
        self.assertEqual((result["status"],result["transcript_text"],result["translated_text"]),("ready","你好","Здравствуйте"))

    def test_missing_translation_preserves_original(self):
        result = self.read(2, "en", {"id":"driver"})
        self.assertEqual(result["transcript_text"],"你好")
        self.assertIsNone(result["translated_text"])

    def test_read_without_target_returns_original_only(self):
        result = self.read(2, None, {"id":"driver"})
        self.assertIsNone(result["target_lang"])
        self.assertIsNone(result["translated_text"])

    def assert_rejected(self, message, user, status):
        with self.assertRaises(HTTPException) as raised:
            self.read(message, "ru", {"id":user})
        self.assertEqual(raised.exception.status_code, status)

    def test_nonparticipant_denied(self):
        self.assert_rejected(2, "outsider", 403)

    def test_unaccepted_deal_denied(self):
        self.accepted = False
        self.assert_rejected(2, "shipper", 403)

    def test_nonvoice_rejected(self):
        self.assert_rejected(3, "shipper", 400)

    def test_missing_message_rejected(self):
        self.assert_rejected(999, "shipper", 404)

    def test_get_does_not_start_inference_or_modify_database(self):
        tree = ast.parse(SNIPPET.read_text())
        calls = [node.func.id for node in ast.walk(tree) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)]
        self.assertNotIn("transcribe_audio_ref",calls)
        self.assertNotIn("translate_text",calls)
        self.assertNotIn("transcribe_message",calls)
        self.assertNotIn("UPDATE",SNIPPET.read_text())
        self.assertNotIn("INSERT",SNIPPET.read_text())

if __name__ == "__main__":
    unittest.main()
