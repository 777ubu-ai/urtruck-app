"""Shared, non-mutating auth-override helper for backend tests.

Root cause this replaces (2026-09-08 integration audit, confirmed by direct
reproduction — see the audit report, not re-derived here): 13+ test files
independently did

    from api import verification_gate
    verification_gate.require_level = fake_require_level

at MODULE level. pytest fully collects (imports) every test module before
running any test, so by the time the first test executes,
``verification_gate.require_level`` is permanently bound to whichever of
those 13 files' fake happened to be imported last — every OTHER file's
tests then get served a mismatched user (or no user), depending on which
file's module-level assignment "won", producing order-dependent 401/403
failures. Two independent minimal repros are in the audit report.

Fix: use FastAPI's own ``app.dependency_overrides`` instead of mutating the
production ``api.verification_gate`` module. This is app-scoped (each test
file already builds its own isolated ``FastAPI()`` instance) and resolved
per-request by FastAPI's dependency-injection machinery, so it can never
leak into another file's app or into the real production app.

The one wrinkle: ``verification_gate.require_level(min_level)`` is a
*factory* — every call returns a brand-new closure, even for the same
``min_level``. ``Depends(require_level(1))`` used at N different route
definitions therefore produces N distinct callables, none of which is
``require_level`` itself — so a single ``app.dependency_overrides[require_level]
= fake`` entry cannot cover them by identity. ``override_require_level``
below walks the app's actual built dependency tree and overrides every
concrete instance it finds, so it works regardless of how many times
``require_level`` was called or with what levels.

Usage (replaces the single harmful ``verification_gate.require_level = ...``
line — nothing else about a file's existing fake/contextvar/``as_user``
helper needs to change):

    app = FastAPI()
    app.include_router(mp_router, prefix="/api/v1/market")
    override_require_level(app, fake_require_level(1))  # level arg is ignored by the fake, kept for call-site familiarity
    client = TestClient(app)
"""
from api import verification_gate


def override_require_level(app, dependency_fn):
    """Point every require_level(...)-produced dependency actually wired
    into ``app``'s routes at ``dependency_fn`` via ``app.dependency_overrides``.

    Returns the set of original callables that were overridden (mostly
    useful for tests-of-the-harness-itself / debugging; normal callers can
    ignore the return value).
    """

    def _collect(dependant, seen):
        call = getattr(dependant, "call", None)
        if call is not None and getattr(call, "__module__", None) == verification_gate.__name__:
            seen.add(call)
        for sub in getattr(dependant, "dependencies", ()):
            _collect(sub, seen)

    calls = set()
    for route in app.routes:
        dependant = getattr(route, "dependant", None)
        if dependant is not None:
            _collect(dependant, calls)

    for call in calls:
        app.dependency_overrides[call] = dependency_fn

    return calls
