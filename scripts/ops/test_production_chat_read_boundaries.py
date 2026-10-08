"""Безопасность read-only подготовки production read-boundaries patch."""
import ast
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("read_boundaries_ops", Path(__file__).with_name("production_chat_read_boundaries.py"))
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)

CHAT = '''def voice_text(message_id, user):
    return {"guard": "participant", "model": "keep"}
def get_messages(room_id, user):
    uid = user["id"]
    with get_conn() as c:
        rows = c.execute("SELECT * FROM chat_messages", ()).fetchall()
        c.execute(
            "UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ? AND is_read = 0",
            (room_id, uid),
        )
    try:
        mark_notifications_read_by_urls(uid, [f"/chats/{room_id}"])
    except Exception:
        pass
    return rows
'''
NOTIFICATIONS = '''def badge_count(user):
    return {"unchanged": True}
def mark_notifications_read_by_urls(user_id, urls):
    return 0
'''

class ReadOnlyPatchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "source"
        (self.root / "api").mkdir(parents=True)
        self.sources = {"api/chat.py": CHAT, "api/notifications.py": NOTIFICATIONS}
        for name, source in self.sources.items():
            (self.root / name).write_text(source)
        self.expected = {name: hashlib.sha256(source.encode()).hexdigest() for name, source in self.sources.items()}
    def tearDown(self):
        self.tmp.cleanup()
    def call(self, output=None):
        argv = ["ops", "--root", str(self.root)]
        if output is not None:
            argv += ["--output-dir", str(output)]
        buffer = io.StringIO()
        with patch.object(ops, "EXPECTED", self.expected), patch("sys.argv", argv), contextlib.redirect_stdout(buffer):
            ops.main()
        return json.loads(buffer.getvalue())
    def assert_source_unchanged(self):
        for name, source in self.sources.items():
            self.assertEqual((self.root / name).read_text(), source)
    def test_plan_has_no_writes_and_preserves_voice_and_badge_functions(self):
        result = self.call()
        self.assertFalse(result["production_written"])
        self.assertFalse(result["restart_performed"])
        self.assertEqual(set(result["files"]), set(self.expected))
        self.assert_source_unchanged()
    def test_source_guard_rejects_changed_source_before_creating_output(self):
        (self.root / "api/chat.py").write_text(CHAT + "\n# changed\n")
        output = Path(self.tmp.name) / "review"
        with self.assertRaisesRegex(ValueError, "Source guard mismatch"):
            self.call(output)
        self.assertFalse(output.exists())
    def test_private_candidate_is_separate_and_parseable(self):
        output = Path(self.tmp.name) / "review"
        self.call(output)
        self.assertEqual(output.stat().st_mode & 0o777, 0o700)
        for name in [*self.sources, "read-boundaries.diff", "manifest.json"]:
            self.assertEqual((output / name).stat().st_mode & 0o777, 0o600)
        for name in self.sources:
            compile((output / name).read_text(), name, "exec")
        self.assert_source_unchanged()
    def test_output_inside_runtime_and_symlink_escape_are_rejected(self):
        with self.assertRaises(ValueError):
            self.call(self.root / "review")
        output = Path(self.tmp.name) / "review"
        output.mkdir()
        (output / "api").symlink_to(self.root / "api", target_is_directory=True)
        with self.assertRaises(ValueError):
            self.call(output)
        self.assert_source_unchanged()

if __name__ == "__main__":
    unittest.main()
