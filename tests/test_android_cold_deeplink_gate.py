"""Наличие shell чата само по себе не подтверждает правильный переход."""
import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "qa/android/cold_deeplink_regression.py"
spec = importlib.util.spec_from_file_location("cold_deeplink_regression", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ColdDeeplinkGateTest(unittest.TestCase):
    def test_other_chat_does_not_match_requested_marker(self):
        state = module.workspace_state('<hierarchy><node package="com.urtruck.app.qa2" resource-id="deal-workspace-back"/><node text="Другая сделка"/></hierarchy>', "Контрольная сделка")
        self.assertTrue(state["workspace"] and not state["expected_marker"])


    def test_requested_chat_requires_workspace_and_marker(self):
        state = module.workspace_state('<hierarchy><node package="com.urtruck.app.qa2" resource-id="deal-workspace-back"/><node text="Контрольная сделка · 1 т"/></hierarchy>', "Контрольная сделка")
        self.assertTrue(state["workspace"] and state["expected_marker"] and state["app_nodes"] == 1)
        self.assertFalse(state["root_screen"])


    def test_launcher_and_empty_marker_cannot_be_chat_success(self):
        state = module.workspace_state('<hierarchy><node package="com.urtruck.app.qa2" resource-id="cargo-screen"/><node text="Контрольная сделка"/></hierarchy>', "Контрольная сделка")
        self.assertTrue(state["root_screen"] and state["expected_marker"] and not state["workspace"])
        self.assertFalse(module.workspace_state('<hierarchy><node resource-id="deal-workspace-back"/></hierarchy>', "")["expected_marker"])
