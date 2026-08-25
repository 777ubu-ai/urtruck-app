"""#279: BETA_MODE hardening — verify that beta bypass is scoped.

Level 3 (driver_verified) must NEVER be bypassed even when BETA_MODE=true.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from api.verification_gate import require_level, _BETA_BYPASS_MAX_LEVEL
from fastapi import HTTPException
import pytest


# Save and restore original BETA_MODE around tests.
_original = config.BETA_MODE


def setup_function():
    config.BETA_MODE = True
    # Re-import won't re-evaluate the module constant, so patch directly.
    import api.verification_gate as vg
    vg.BETA_MODE = True


def teardown_function():
    config.BETA_MODE = _original
    import api.verification_gate as vg
    vg.BETA_MODE = _original


def _make_user(level: int) -> dict:
    return {"id": "test-gate", "full_name": "Test", "phone": "+70000000000",
            "verification_level": level}


def test_beta_bypass_max_is_2():
    """Порог бета-обхода — уровень 2, не выше."""
    assert _BETA_BYPASS_MAX_LEVEL == 2


def test_beta_bypasses_level_1_for_unverified():
    """BETA_MODE=true: уровень 0 проходит require_level(1)."""
    dep = require_level(1)
    # Simulate FastAPI dependency injection by calling with a header string
    # that resolves to a level-0 user. We monkey-patch _extract_driver.
    import api.verification_gate as vg
    original_extract = vg._extract_driver
    vg._extract_driver = lambda auth: _make_user(0)
    try:
        result = dep(authorization="Bearer test-token")
        assert result["id"] == "test-gate"
    finally:
        vg._extract_driver = original_extract


def test_beta_bypasses_level_2_for_level1():
    """BETA_MODE=true: уровень 1 проходит require_level(2)."""
    dep = require_level(2)
    import api.verification_gate as vg
    original_extract = vg._extract_driver
    vg._extract_driver = lambda auth: _make_user(1)
    try:
        result = dep(authorization="Bearer test-token")
        assert result["id"] == "test-gate"
    finally:
        vg._extract_driver = original_extract


def test_beta_does_NOT_bypass_level_3():
    """BETA_MODE=true: уровень 0 НЕ проходит require_level(3)."""
    dep = require_level(3)
    import api.verification_gate as vg
    original_extract = vg._extract_driver
    vg._extract_driver = lambda auth: _make_user(0)
    try:
        with pytest.raises(HTTPException) as exc_info:
            dep(authorization="Bearer test-token")
        assert exc_info.value.status_code == 403
        detail = exc_info.value.detail
        assert detail["required_level"] == 3
    finally:
        vg._extract_driver = original_extract


def test_no_beta_enforces_all_levels():
    """BETA_MODE=false: require_level(1) блокирует уровень 0."""
    import api.verification_gate as vg
    vg.BETA_MODE = False
    dep = require_level(1)
    original_extract = vg._extract_driver
    vg._extract_driver = lambda auth: _make_user(0)
    try:
        with pytest.raises(HTTPException) as exc_info:
            dep(authorization="Bearer test-token")
        assert exc_info.value.status_code == 403
    finally:
        vg._extract_driver = original_extract
