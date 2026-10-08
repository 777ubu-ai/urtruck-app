import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch as mock_patch
import sys
import types
import unittest

spec = importlib.util.spec_from_file_location("tag_patch", Path(__file__).parents[2] / "scripts/ops/production_chat_notification_tag.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

class TagPatchTests(unittest.TestCase):
    def test_marker_guard(self):
        with self.assertRaises(ValueError):
            patch.patched("unrelated")

    def test_provider_payload_is_scoped_without_changing_badge_or_data(self):
        source = (Path(__file__).parent / "fixtures/production_fcm_send_20261008.py").read_text()
        tree = ast.parse(patch.patched(source))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "FCMProvider")
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "send")
        method.returns = None
        for arg in method.args.args:
            arg.annotation = None
        capture = []
        http = SimpleNamespace(post=lambda *args, **kw: (capture.append(kw["json"]) or SimpleNamespace(status_code=200, json=lambda: {"name": "test"})))
        env = {"FCM_PROJECT_ID": "test-project", "httpx": http, "NATIVE_PUSH_CHANNEL_ID": "urtruck_messages_v2",
               "ProviderResult": lambda *args, **kwargs: kwargs}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), "<test>", "exec"), env)
        provider = SimpleNamespace(_access_token=lambda: "test-only")
        for data, tagged in [
            ({"type": "chat_message", "room_id": "room-a"}, True),
            ({"type": "chat_attachment", "room_id": "room-a"}, True),
            ({"type": "bid_received", "room_id": "room-a"}, False),
            ({"type": "chat_message", "room_id": "bad/room"}, False),
            ({"type": "chat_message", "room_id": None}, False),
        ]:
            env["send"](provider, "test-token", "title", "body", data, 3)
            payload = capture[-1]["message"]
            self.assertEqual(payload["android"]["notification"].get("tag"), "chat:room-a" if tagged else None)
            self.assertEqual(payload["android"]["notification"]["notification_count"], 3)
            self.assertEqual(payload["notification"], {"title": "title", "body": "body"})
            self.assertEqual(payload["data"]["type"], data["type"])

    def test_badge_route_uses_authenticated_user_and_existing_native_counter(self):
        source = patch.patched_badge("notif_router = None\n")
        tree = ast.parse(source)
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef))
        guards = []
        router = SimpleNamespace(get=lambda route: (lambda f: f))
        sender = types.ModuleType("services.push_sender")
        calls = []
        sender._compute_recipient_badge = lambda uid: (calls.append(uid) or 3)
        env = {"notif_router": router, "Depends": lambda dep: dep,
               "require_level": lambda level: (guards.append(level) or "guard")}
        with mock_patch.dict(sys.modules, {"services": types.ModuleType("services"), "services.push_sender": sender}):
            exec(compile(ast.Module(body=[fn], type_ignores=[]), "<test>", "exec"), env)
            self.assertEqual(env["canonical_badge_count"]({"id": "authenticated-user"}), {"badge": 3})
        self.assertEqual(calls, ["authenticated-user"])
        self.assertEqual(guards, [1])
        with self.assertRaises(ValueError):
            patch.patched_badge(source)

if __name__ == "__main__":
    unittest.main()
