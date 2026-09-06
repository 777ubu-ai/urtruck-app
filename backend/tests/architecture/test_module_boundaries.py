"""Architecture guard: domain modules expose contracts, not internals.

AC1 (2026-09-07): the previous guard only scanned backend/modules/**, which
is where almost no legacy coupling actually lives (per the independent
architecture audits of 2026-09-05/06). This guard now:

  1. Uses real AST import resolution (including relative imports), not a
     brittle line-regex, so `from ..deals.domain import X` is caught exactly
     like `from backend.modules.deals.domain import X`.
  2. Scans backend/api/**, backend/services/**, backend/scheduler/**,
     backend/database/** in addition to backend/modules/** — the layers
     previously exempt from any check at all.
  3. Distinguishes "domain internals" (`<domain>.domain`, `<domain>.infrastructure`)
     from the allowed application/public_contract boundary. Application-layer
     imports (including a concrete application implementation such as
     `modules.deals.application.service`) remain allowed — this mirrors the
     documented, still-transitional Deals V2 wiring in api/marketplace.py and
     backend/scheduler/jobs.py, which import the application layer directly
     because backend/modules/deals/application/public_contract.py is a bare
     Protocol with no runtime implementation of its own yet. Forbidding that
     today would only produce a silent allowlist covering 100% of the one
     real integration, not real enforcement.
  4. Understands ONE explicit, auditable escape hatch: a line carrying the
     literal marker `# ARCH-ALLOW:` followed by a reason. Every such line is
     collected and asserted to have a non-empty reason — an unexplained
     escape hatch is itself a violation. See AC5 legacy-adapter doc for the
     full list of what is currently allowlisted and why.
"""
import ast
import re
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[2]  # .../backend
MODULES_ROOT = BACKEND_ROOT / "modules"

# Layers considered "domain internals": everything except application/ (which
# includes the allowed public_contract.py boundary and, transitionally, the
# concrete application implementation itself).
FORBIDDEN_LAYERS = ("domain", "infrastructure")
DOMAIN_LAYER_RE = re.compile(
    r"^backend\.modules\.([A-Za-z0-9_]+)\.(" + "|".join(FORBIDDEN_LAYERS) + r")(\.|$)"
)

# Directories whose *.py files are architecturally significant: they either
# ARE a domain module, or sit in the shared/legacy layer that must not reach
# into another domain's internals. backend/infrastructure/** (top-level,
# distinct from backend/modules/<domain>/infrastructure/**) is deliberately
# NOT scanned — it is the neutral, cross-cutting outbox/feature-flag layer
# the mission explicitly names as "shared neutral infrastructure", not a
# domain-owned layer.
SCANNED_ROOTS = ("modules", "api", "services", "scheduler", "database")

ALLOW_MARKER = "ARCH-ALLOW:"


def _normalize(dotted: str) -> str:
    """`modules.x.y` and `backend.modules.x.y` must be recognized as the same
    target — the codebase imports both ways depending on whether it's invoked
    with PYTHONPATH=repo-root or PYTHONPATH=backend (see the try/except
    ImportError pattern throughout backend/api/*.py)."""
    if dotted.startswith("modules."):
        return "backend." + dotted
    return dotted


def _file_dotted_package(file_path: Path) -> tuple:
    """Dotted package path of the DIRECTORY containing file_path, rooted at
    'backend'. This is what Python actually uses as the anchor for relative
    imports out of a regular (non-__init__) module."""
    rel = file_path.resolve().relative_to(BACKEND_ROOT.parent)
    return rel.parts[:-1]


def _owner_domain(file_pkg: tuple) -> str | None:
    """If file_pkg is backend.modules.<domain>.*, that domain may reference
    its own domain/infrastructure internals freely. Anything else (api/,
    services/, scheduler/, database/, or a *different* domain) may not."""
    if len(file_pkg) >= 3 and file_pkg[0] == "backend" and file_pkg[1] == "modules":
        return file_pkg[2]
    return None


def _resolve_import_from(file_pkg: tuple, node: ast.ImportFrom) -> str:
    """Resolve the absolute dotted path an (possibly relative) ImportFrom
    references, using CPython's own relative-import algorithm for a regular
    (non-package) module: level=1 anchors at the importing module's own
    containing package (file_pkg itself); each additional level strips one
    more trailing component."""
    if node.level == 0:
        return _normalize(node.module or "")
    if node.level - 1 > 0:
        base = file_pkg[: len(file_pkg) - (node.level - 1)]
    else:
        base = file_pkg
    base_str = ".".join(base)
    if node.module:
        return _normalize(f"{base_str}.{node.module}" if base_str else node.module)
    return _normalize(base_str)


def check_import_node(file_pkg: tuple, node) -> str | None:
    """Pure function: return a violation description, or None if the import
    is allowed. Exercised directly by the negative/positive fixture tests
    below, and by the real filesystem scan."""
    owner = _owner_domain(file_pkg)
    if isinstance(node, ast.Import):
        for alias in node.names:
            dotted = _normalize(alias.name)
            match = DOMAIN_LAYER_RE.match(dotted)
            if match and match.group(1) != owner:
                return f"import {alias.name}"
        return None
    if isinstance(node, ast.ImportFrom):
        resolved = _resolve_import_from(file_pkg, node)
        match = DOMAIN_LAYER_RE.match(resolved)
        if match and match.group(1) != owner:
            dots = "." * node.level
            return f"from {dots}{node.module or ''} import ...  (resolves to {resolved})"
        return None
    return None


def _iter_py_files():
    for root_name in SCANNED_ROOTS:
        root = BACKEND_ROOT / root_name
        if not root.is_dir():
            continue
        for source in root.glob("**/*.py"):
            if "/tests/" in str(source) or source.parts[-2:-1] == ("tests",):
                continue
            yield source


def _line_has_allow_marker(source_lines: list, lineno: int) -> bool:
    idx = lineno - 1
    if 0 <= idx < len(source_lines) and ALLOW_MARKER in source_lines[idx]:
        return True
    return False


def test_cross_module_internal_imports_are_forbidden():
    """Real filesystem scan across modules/api/services/scheduler/database."""
    violations: list = []
    allow_lines_without_reason: list = []
    for source in _iter_py_files():
        text = source.read_text()
        lines = text.splitlines()
        try:
            tree = ast.parse(text, filename=str(source))
        except SyntaxError:
            continue
        file_pkg = _file_dotted_package(source)
        for node in ast.walk(tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            violation = check_import_node(file_pkg, node)
            if violation is None:
                continue
            lineno = getattr(node, "lineno", 0)
            if _line_has_allow_marker(lines, lineno):
                marker_line = lines[lineno - 1]
                reason = marker_line.split(ALLOW_MARKER, 1)[1].strip()
                if not reason:
                    allow_lines_without_reason.append(f"{source}:{lineno}")
                continue
            violations.append(f"{source}:{lineno}: {violation}")
    assert not allow_lines_without_reason, (
        "ARCH-ALLOW markers must carry a non-empty reason:\n"
        + "\n".join(allow_lines_without_reason)
    )
    assert not violations, "Forbidden cross-domain internal imports:\n" + "\n".join(violations)


# ─── negative/positive fixtures required by AC1 (checked as pure AST, no
# real files planted under backend/modules/ — the checker function itself is
# what's under test, not the filesystem walk) ───

CHAT_APPLICATION_PKG = ("backend", "modules", "chat", "application")  # inside chat's own domain
CHAT_MODULE_ROOT_PKG = ("backend", "modules", "chat")  # a file directly under modules/chat/
LEGACY_API_PKG = ("backend", "api")  # a foreign, non-domain legacy file (e.g. marketplace.py)


def _parse_one_import(source: str):
    tree = ast.parse(source)
    return tree.body[0]


@pytest.mark.parametrize(
    "source, importer_pkg",
    [
        # A foreign legacy file (backend/api/*) reaching into another
        # domain's internals — the primary case this guard exists for.
        ("from backend.modules.deals.domain import X", LEGACY_API_PKG),
        ("from modules.deals.domain import X", LEGACY_API_PKG),
        ("from ..deals.domain import X", CHAT_MODULE_ROOT_PKG),
        ("from backend.modules.chat.infrastructure import Y", LEGACY_API_PKG),
        ("import backend.modules.deals.domain.fsm", LEGACY_API_PKG),
        # Cross-domain: chat reaching into deals' internals is just as
        # forbidden as legacy code reaching into it.
        ("from backend.modules.deals.infrastructure import preflight", CHAT_APPLICATION_PKG),
    ],
)
def test_foreign_domain_internal_imports_are_rejected(source, importer_pkg):
    node = _parse_one_import(source)
    assert check_import_node(importer_pkg, node) is not None, (
        f"expected a violation for: {source} (importer={importer_pkg})"
    )


@pytest.mark.parametrize(
    "source, importer_pkg",
    [
        ("from backend.modules.deals.application.public_contract import Z", LEGACY_API_PKG),
        # A domain referencing its OWN domain/infrastructure layer is fine.
        ("from backend.modules.chat.domain import OwnDomainThing", CHAT_APPLICATION_PKG),
        ("from backend.modules.chat.infrastructure import OwnInfra", CHAT_APPLICATION_PKG),
        # Transitional: the concrete application implementation (not just
        # the Protocol contract) is the only real runtime wiring that exists
        # today (see module docstring) — allowed from legacy callers.
        ("from backend.modules.deals.application.service import DealsBidsService", LEGACY_API_PKG),
        ("import os", LEGACY_API_PKG),
        ("from database.db import get_conn", LEGACY_API_PKG),
    ],
)
def test_allowed_imports_are_not_flagged(source, importer_pkg):
    node = _parse_one_import(source)
    assert check_import_node(importer_pkg, node) is None, (
        f"unexpected violation for: {source} (importer={importer_pkg})"
    )


def test_all_domains_have_public_contract():
    expected = {"auth", "users", "cargo", "trips", "bids", "deals", "chat", "translation", "notifications", "tracking", "documents", "borders"}
    actual = {path.parent.parent.name for path in MODULES_ROOT.glob("*/application/public_contract.py")}
    assert actual == expected


def test_backend_harness_order_regression_guards_are_present():
    harness = Path(__file__).parents[1] / "conftest.py"
    source = harness.read_text()
    assert "def pytest_collection_modifyitems" in source
    assert "def pytest_runtest_setup" in source
    assert "_scoreboard_service.cgr_settings = _cgr_settings.cgr_settings" in source
    assert 'request.module.__name__.endswith("test_social_auth")' in source
