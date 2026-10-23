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


def test_static_release_gate_is_blocking_after_final_design_integration():
    """The final design branch fixed the release-static contract.

    The release gate must therefore be a real blocking dependency. Pin the
    absence of `continue-on-error` so a future workflow edit cannot silently
    restore the temporary bypass.
    """
    doc = _load("quality-gate-reusable.yml")
    steps = doc["jobs"]["frontend-quality"]["steps"]
    gate_step = next(s for s in steps if s.get("name") == "Static release gate")
    assert "continue-on-error" not in gate_step
    assert gate_step.get("run") == "bash scripts/release_static_gate.sh"
    raw = (WORKFLOWS / "quality-gate-reusable.yml").read_text(encoding="utf-8")
    assert "continue-on-error: true" not in raw


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


def test_deploy_push_ignores_only_the_reviewed_push_mode_operations_files():
    doc = _load("deploy.yml")
    push = doc[True]["push"] if True in doc else doc["on"]["push"]
    ignored = set(push.get("paths-ignore", []))
    expected = {
        ".github/workflows/deploy.yml",
        ".github/workflows/testflight-rc.yml",
        ".github/workflows/submit-android-qa2-internal.yml",
        ".github/workflows/production-deploy-execute.yml",
        ".github/workflows/sync-production-push-mode.yml",
        "backend/tests/test_deploy_workflow_static_validation.py",
        "backend/tests/test_production_push_mode_sync_contract.py",
        "backend/tests/test_remote_health_check_push_mode.py",
        "docs/qa/production-push-mode-sync-20261014.md",
        "scripts/ops/production_push_mode_sync_preflight.py",
        "scripts/remote_health_check.sh",
        ".github/workflows/quality-gate-reusable.yml",
        ".gitattributes",
        "package.json",
        "package-lock.json",
        "docs/npm-audit-triage.md",
        "docs/qa/dependency-audit-remediation-20261014.md",
        "docs/qa/qa2-native-patch-gate-20261018.md",
        "patches/node-forge+1.4.0.patch",
        "scripts/security-*.mjs",
        "security/sbom/braces-3.0.4-28d440b.spdx.json",
        "tests/security/*.mjs",
        "tests/frontend/qa2_play_internal_workflow.test.mjs",
        "tests/frontend/test_qa2_live_build_contract.mjs",
        "vendor/braces-3.0.4-28d440b/**",
        "backend/tests/test_production_push_mode_backup.py",
        "scripts/ops/production_push_mode_backup.py",
    }
    assert ignored == expected
    # Model every path currently changed by PR #533. GitHub's paths-ignore
    # suppresses the production push workflow only if every changed path
    # matches; product/backend files therefore still enter the release gate.
    pr533_paths = {
        ".gitattributes", ".github/workflows/deploy.yml",
        ".github/workflows/production-deploy-execute.yml",
        ".github/workflows/quality-gate-reusable.yml",
        ".github/workflows/sync-production-push-mode.yml",
        "backend/tests/test_deploy_workflow_static_validation.py",
        "backend/tests/test_production_push_mode_sync_contract.py",
        "backend/tests/test_remote_health_check_push_mode.py",
        "backend/tests/test_production_push_mode_backup.py",
        "docs/npm-audit-triage.md",
        "docs/qa/dependency-audit-remediation-20261014.md",
        "docs/qa/production-push-mode-sync-20261014.md",
        "package-lock.json", "package.json",
        "patches/node-forge+1.4.0.patch",
        "scripts/ops/production_push_mode_sync_preflight.py",
        "scripts/ops/production_push_mode_backup.py",
        "scripts/remote_health_check.sh",
        "scripts/security-check-braces-upstream.mjs",
        "scripts/security-node-forge-audit-gate.mjs",
        "security/sbom/braces-3.0.4-28d440b.spdx.json",
        "tests/security/braces_cve_2026_93687.test.mjs",
        "tests/security/braces_upstream_monitor.test.mjs",
        "tests/security/braces_vendor_provenance.test.mjs",
        "tests/security/node_forge_cve_2026_85393.test.mjs",
        "tests/security/security_node_forge_audit_gate.test.mjs",
        "tests/security/shell_quote_advisory.test.mjs",
        "vendor/braces-3.0.4-28d440b/LICENSE",
        "vendor/braces-3.0.4-28d440b/PROVENANCE.md",
        "vendor/braces-3.0.4-28d440b/UPSTREAM-SOURCE-SHA256SUMS",
        "vendor/braces-3.0.4-28d440b/index.js",
        "vendor/braces-3.0.4-28d440b/lib/compile.js",
        "vendor/braces-3.0.4-28d440b/lib/constants.js",
        "vendor/braces-3.0.4-28d440b/lib/expand.js",
        "vendor/braces-3.0.4-28d440b/lib/parse.js",
        "vendor/braces-3.0.4-28d440b/lib/stringify.js",
        "vendor/braces-3.0.4-28d440b/lib/utils.js",
        "vendor/braces-3.0.4-28d440b/package.json",
    }
    import fnmatch
    assert all(any(fnmatch.fnmatchcase(path, pattern) for pattern in ignored) for path in pr533_paths)
    pr563_paths = {
        ".github/workflows/testflight-rc.yml",
        ".github/workflows/submit-android-qa2-internal.yml",
        ".github/workflows/deploy.yml",
        "docs/qa/qa2-native-patch-gate-20261018.md",
        "tests/frontend/qa2_play_internal_workflow.test.mjs",
        "tests/frontend/test_qa2_live_build_contract.mjs",
    }
    assert all(any(fnmatch.fnmatchcase(path, pattern) for pattern in ignored) for path in pr563_paths)
    assert not any(fnmatch.fnmatchcase("backend/api/push.py", pattern) for pattern in ignored)


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
        "777ubu-ai/urtruck-app/.github/workflows/production-deploy-execute.yml@main"
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


def test_only_the_normal_caller_uses_local_executor_and_sync_is_pinned_to_main():
    callers = []
    for f in WORKFLOWS.glob("*.yml"):
        if f.name == "production-deploy-execute.yml":
            continue
        doc = _load(f.name)
        for job in doc.get("jobs", {}).values():
            if job.get("uses") == "./.github/workflows/production-deploy-execute.yml":
                callers.append(f.name)
    assert callers == ["secure-production-deploy.yml"], (
        "only the normal deploy caller may resolve the executor locally; the mode-sync caller must use protected main"
    )
    sync = _load("sync-production-push-mode.yml")
    sync_uses = sync["jobs"]["sync"].get("uses", "")
    assert sync_uses == (
        "777ubu-ai/urtruck-app/.github/workflows/production-deploy-execute.yml@main"
    )

    mode_caller = _load("sync-production-push-mode.yml")
    assert mode_caller["jobs"]["sync"]["with"]["operation"] == "sync_push_mode"
    assert mode_caller["jobs"]["sync"]["with"]["deploy_sha"] == "${{ github.sha }}"
    executor = _load("production-deploy-execute.yml")
    assert executor["jobs"]["sync_push_mode"]["if"] == "${{ inputs.operation == 'sync_push_mode' && inputs.deploy_scope == 'full' }}"
    assert executor["jobs"]["deploy"]["if"] == "${{ inputs.operation == 'deploy' && inputs.deploy_scope == 'full' }}"


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
