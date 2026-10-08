"""QA2 Web deploy must pass the same protected reviewer gate as QA2 backend."""
from pathlib import Path

import pytest


yaml = pytest.importorskip("yaml", reason="PyYAML is test-only")
ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "qa2-web-deploy.yml"


def test_qa2_web_deploy_is_manual_and_environment_protected():
    doc = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    triggers = doc.get(True, doc.get("on"))
    assert "workflow_dispatch" in triggers
    deploy = doc["jobs"]["deploy"]
    assert deploy["environment"]["name"] == "qa2"
    assert "DEPLOY_QA2_WEB" in str(deploy["steps"])
