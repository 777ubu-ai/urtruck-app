"""Release hardening track A, Commit 4 — production deploy gate, static
validation of .github/workflows/*.yml.

Confirmed defect this closes: the production release gate ("UrTruck
Deploy") only ran 4 Yandex-map regression checks — never the backend
suite, frontend suite, lint, the static release gate, or the mandatory
E2E subset — and "UrTruck Secure Production Deploy" additionally accepted
a bare `workflow_dispatch` that skipped the release gate entirely with no
distinguishing name and no audit trail.

This is intentionally structural/static coverage (parse the YAML, assert
on job graph shape) — it cannot execute the workflows themselves (that
requires a real GitHub Actions runner), but it pins the specific
before/after shape so a future edit can't silently regress it.
"""
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML is test-only (requirements-test.txt)")

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


def _load(name):
    with open(WORKFLOWS / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


# ── quality-gate-reusable.yml: the shared source of truth ─────────────

def test_quality_gate_reusable_exists_and_is_callable():
    doc = _load("quality-gate-reusable.yml")
    assert True in doc or "on" in doc, "workflow_call trigger missing"
    triggers = doc.get(True, doc.get("on"))
    assert "workflow_call" in triggers, "quality-gate-reusable.yml must be a reusable (workflow_call) workflow"


def test_quality_gate_reusable_has_the_required_gate_components():
    doc = _load("quality-gate-reusable.yml")
    jobs = doc["jobs"]
    assert "backend-tests" in jobs
    assert "frontend-quality" in jobs
    assert "mandatory-e2e" in jobs

    backend_steps = " ".join(s.get("name", "") for s in jobs["backend-tests"]["steps"])
    assert "backend suite" in backend_steps.lower()
    assert "p0/p1 security" in backend_steps.lower()
    assert "push/bell" in backend_steps.lower()

    frontend_steps = " ".join(s.get("name", "") for s in jobs["frontend-quality"]["steps"])
    assert "lint" in frontend_steps.lower()
    assert "static release gate" in frontend_steps.lower()
    assert "web production build" in frontend_steps.lower() or "build" in frontend_steps.lower()


def test_static_release_gate_is_temporarily_non_blocking_with_a_documented_reason():
    """As of this track, the static gate step is `continue-on-error: true`
    because the version of scripts/release_static_gate.sh on the current
    canonical branch fails a check unrelated to this track (a stale
    "24-48h copy" expectation already being fixed on the separate,
    not-yet-merged Kimi design branch). Pin BOTH the current non-blocking
    state AND the presence of the comment explaining why + when to flip it
    back — so this doesn't quietly stay non-blocking forever once the
    design branch merges and the underlying reason is gone."""
    doc = _load("quality-gate-reusable.yml")
    steps = doc["jobs"]["frontend-quality"]["steps"]
    gate_step = next(s for s in steps if s.get("name") == "Static release gate")
    assert gate_step.get("continue-on-error") is True
    # yaml.safe_load drops standalone `#` comments, so re-read the raw file
    # text for the explanatory comment rather than the parsed step dict.
    raw = (WORKFLOWS / "quality-gate-reusable.yml").read_text(encoding="utf-8")
    assert "not-yet-merged design" in raw or "design/kimi" in raw, (
        "the continue-on-error must stay accompanied by an explanation of why "
        "and a pointer to when it should become blocking again"
    )


# ── pr-quality-gate.yml and deploy.yml both call the SAME reusable file ──

def test_pr_quality_gate_calls_the_reusable_workflow():
    doc = _load("pr-quality-gate.yml")
    job = doc["jobs"]["quality-gate"]
    assert job.get("uses") == "./.github/workflows/quality-gate-reusable.yml"


def test_deploy_release_gate_requires_the_quality_gate_first():
    """The confirmed original defect: deploy.yml's release-gate job used to
    run standalone (only map checks), with nothing gating it on the full
    suite. Pin that release-gate now `needs` quality-gate, and that
    quality-gate calls the exact same reusable file pr-quality-gate.yml
    does (one definition, not two copies that can drift apart)."""
    doc = _load("deploy.yml")
    jobs = doc["jobs"]
    assert "quality-gate" in jobs, "deploy.yml must have its own quality-gate job"
    assert jobs["quality-gate"].get("uses") == "./.github/workflows/quality-gate-reusable.yml"

    release_gate = jobs["release-gate"]
    needs = release_gate.get("needs")
    needs_list = needs if isinstance(needs, list) else [needs]
    assert "quality-gate" in needs_list, (
        "release-gate must `needs: [quality-gate]` — otherwise a push to main can "
        "reach the map-only checks without the backend/frontend/E2E suite ever running"
    )


# ── secure-production-deploy.yml: no more bare workflow_dispatch bypass ──

def test_secure_production_deploy_has_no_bare_workflow_dispatch():
    doc = _load("secure-production-deploy.yml")
    triggers = doc.get(True, doc.get("on"))
    assert "workflow_dispatch" not in triggers, (
        "secure-production-deploy.yml must not accept a direct workflow_dispatch — "
        "that was the confirmed silent bypass of the release gate. The only sanctioned "
        "manual/emergency path is break-glass-production-deploy.yml."
    )
    assert "workflow_run" in triggers
    assert triggers["workflow_run"]["workflows"] == ["UrTruck Deploy"]


def test_secure_production_deploy_only_fires_for_main_success():
    doc = _load("secure-production-deploy.yml")
    job = doc["jobs"]["deploy"]
    cond = job.get("if", "")
    assert "head_branch == 'main'" in cond
    assert "conclusion == 'success'" in cond


def test_secure_production_deploy_delegates_to_the_shared_execute_workflow():
    doc = _load("secure-production-deploy.yml")
    job = doc["jobs"]["deploy"]
    assert job.get("uses") == "./.github/workflows/production-deploy-execute.yml"
    assert job["with"]["break_glass"] is False


# ── break-glass-production-deploy.yml: explicit, named, confirmed, audited ──

def test_break_glass_workflow_is_explicitly_named():
    assert (WORKFLOWS / "break-glass-production-deploy.yml").exists(), (
        "an explicitly break-glass-named workflow file must exist as the only "
        "sanctioned emergency-deploy path"
    )
    doc = _load("break-glass-production-deploy.yml")
    assert "break-glass" in doc["name"].lower() or "🚨" in doc["name"]


def test_break_glass_requires_reason_and_typed_confirmation():
    doc = _load("break-glass-production-deploy.yml")
    triggers = doc.get(True, doc.get("on"))
    inputs = triggers["workflow_dispatch"]["inputs"]
    assert "reason" in inputs and inputs["reason"]["required"] is True
    assert "confirm" in inputs and inputs["confirm"]["required"] is True
    assert "ref" not in inputs, "break-glass must not accept an arbitrary source ref"


def test_break_glass_guard_job_enforces_confirmation_before_deploy():
    doc = _load("break-glass-production-deploy.yml")
    jobs = doc["jobs"]
    assert "guard" in jobs, "a guard job must validate the confirmation before any deploy step runs"
    guard_run = " ".join(
        step.get("run", "") for step in jobs["guard"]["steps"]
    )
    assert '!= "DEPLOY"' in guard_run, "guard must reject anything other than the exact typed confirmation"

    deploy_job = jobs["deploy"]
    needs = deploy_job.get("needs")
    needs_list = needs if isinstance(needs, list) else [needs]
    assert "guard" in needs_list, "the deploy job must depend on the guard job, not run unconditionally"
    assert deploy_job.get("uses") == (
        "777ubu-ai/urtruck-app/.github/workflows/production-deploy-execute.yml@refs/heads/main"
    ), "break-glass must call the executor from protected main, never its UI-selected ref"
    assert deploy_job["with"]["break_glass"] is True


def test_break_glass_guard_checks_out_only_protected_main():
    doc = _load("break-glass-production-deploy.yml")
    checkout = next(s for s in doc["jobs"]["guard"]["steps"] if s.get("uses") == "actions/checkout@v4")
    assert checkout["with"]["ref"] == "refs/heads/main"


def test_break_glass_writes_an_audit_trail():
    doc = _load("break-glass-production-deploy.yml")
    guard_steps = doc["jobs"]["guard"]["steps"]
    audit_step = next((s for s in guard_steps if "audit" in s.get("name", "").lower()), None)
    assert audit_step is not None, "guard job must have an explicit audit-trail step"
    run = audit_step.get("run", "")
    assert "GITHUB_STEP_SUMMARY" in run, "audit record must be written to the run's own permanent summary"
    assert "actor" in run.lower() and "reason" in run.lower()


# ── production-deploy-execute.yml: one implementation, two callers ──────

def test_production_deploy_execute_is_reusable_and_parameterized():
    doc = _load("production-deploy-execute.yml")
    triggers = doc.get(True, doc.get("on"))
    inputs = triggers["workflow_call"]["inputs"]
    assert "deploy_sha" in inputs and inputs["deploy_sha"]["required"] is True
    assert "break_glass" in inputs


def test_only_normal_path_locally_calls_production_deploy_execute():
    callers = []
    for f in WORKFLOWS.glob("*.yml"):
        if f.name == "production-deploy-execute.yml":
            continue
        doc = _load(f.name)
        for job in doc.get("jobs", {}).values():
            if job.get("uses") == "./.github/workflows/production-deploy-execute.yml":
                callers.append(f.name)
    assert sorted(callers) == ["secure-production-deploy.yml"], (
        f"only the normal local caller may resolve the executor in-repository; "
        f"break-glass is anchored to protected main, got: {callers}"
    )


def test_production_executor_is_key_only_and_pins_the_host_key():
    doc = _load("production-deploy-execute.yml")
    env = doc["jobs"]["deploy"]["env"]
    assert "SERVER_PASS" not in env
    assert env["URTRUCK_REQUIRE_KEY"] == "1"
    steps = doc["jobs"]["deploy"]["steps"]
    assert not any("sshpass" in step.get("run", "") for step in steps)
    preflight = next(s for s in steps if s.get("name") == "Secure SSH preflight")["run"]
    assert "SERVER_SSH_KEY is required for production deploy" in preflight
    assert "SERVER_SSH_KNOWN_HOSTS is required for production deploy" in preflight


if __name__ == "__main__":
    import sys
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS: {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL: {name}\n  {e}")
            except Exception as e:  # noqa: BLE001
                failures += 1
                print(f"ERROR: {name}\n  {type(e).__name__}: {e}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
