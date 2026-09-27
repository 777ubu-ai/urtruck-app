"""Static guard for the protected QA2-only FCM configuration workflow.

The live QA2 diagnosis showed that the backend uses the direct FCM gateway,
but its isolated ``.env`` has no service account.  A deploy must never solve
that by copying the repository-wide (possibly production) credentials.  This
test pins the narrow operator path: QA2 environment secrets, an Android app
identity check, an isolated rollback and a production fingerprint.
"""
from pathlib import Path

import pytest


yaml = pytest.importorskip("yaml", reason="PyYAML is test-only")

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "configure-qa2-fcm.yml"


def _workflow():
    assert WORKFLOW.exists(), "QA2 FCM configuration must use a protected workflow"
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_qa2_fcm_workflow_is_manual_and_environment_protected():
    doc = _workflow()
    triggers = doc.get(True, doc.get("on"))
    assert "workflow_dispatch" in triggers
    deploy = doc["jobs"]["configure"]
    assert deploy["environment"]["name"] == "qa2"
    assert "CONFIGURE_QA2_FCM" in str(deploy["steps"])


def test_qa2_fcm_workflow_never_reuses_generic_fcm_secrets():
    raw = WORKFLOW.read_text(encoding="utf-8")
    assert "secrets.QA2_FCM_PROJECT_ID" in raw
    assert "secrets.QA2_FCM_SERVICE_ACCOUNT_JSON" in raw
    assert "secrets.FCM_PROJECT_ID" not in raw
    assert "secrets.FCM_SERVICE_ACCOUNT_JSON" not in raw


def test_qa2_fcm_workflow_validates_android_project_and_rolls_back():
    raw = WORKFLOW.read_text(encoding="utf-8")
    assert "com.urtruck.app.qa2" in raw
    assert "QA2_ANDROID_GOOGLE_SERVICES_JSON_BASE64" in raw
    assert "Firebase project IDs differ" in raw
    assert "qa2-fcm.env" in raw
    assert "QA2_FCM_ROLLBACK" in raw
    assert "PRODUCTION_AFTER=healthy-unchanged" in raw
