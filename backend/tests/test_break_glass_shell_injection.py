"""Hardening A final repair, P0 — shell injection in the break-glass deploy
path.

Confirmed defect: .github/workflows/production-deploy-execute.yml's "Audit
trail" step (and break-glass-production-deploy.yml's "Require typed
confirmation" / "Resolve exact SHA and write audit record" steps)
interpolated `${{ inputs.break_glass_reason }}` / `${{ inputs.reason }}` /
`${{ inputs.confirm }}` directly into the `run:` script TEXT. GitHub
Actions substitutes `${{ }}` expressions before the shell ever parses the
script -- a `reason` value containing shell metacharacters becomes literal
shell source, not data, in a job (production-deploy-execute.yml's `deploy`)
that runs with `environment: production` and real SSH/deploy secrets in
scope. Fixed by passing every such value through a step-level `env:` block
and referencing it as `$VAR` in the script -- env-var expansion happens at
shell RUNTIME, so the value is always data, never re-parsed as script,
regardless of its contents.

This file tests the ACTUAL fix two ways:

1. Static: parse the YAML, confirm no `${{ inputs.<untrusted> }}` expression
   appears inside any `run:` block string anymore (only inside `env:`).
2. Dynamic / real execution: extract the exact fixed `run:` script text for
   each touched step and execute it with `bash -c` under a real subprocess,
   with the untrusted inputs supplied via `env=` exactly as GitHub Actions
   would set them -- then assert a battery of hostile payloads
   ($(...), backticks, quotes, newline, ;, &&) that WOULD have caused code
   execution against the OLD (vulnerable) script text case, verified
   directly against the real repo's pre-fix commit) never execute anything
   against the CURRENT script text, no matter which one is supplied.
"""
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML is test-only (requirements-test.txt)")

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

# Every payload here, if it ever reached real shell execution (not just a
# `$VAR` data value), would leave an observable side effect: creating a
# uniquely-named marker file under a fresh temp directory. If, after
# running a fixed step's script with the payload as an env var, that marker
# file exists, the fix failed and the payload executed as code.
def _hostile_payloads(marker_dir: Path) -> dict[str, str]:
    return {
        "command_substitution_dollar": f"legit reason $(touch {marker_dir}/dollar_sub)",
        "command_substitution_backtick": f"legit reason `touch {marker_dir}/backtick_sub`",
        "semicolon_chain": f"legit reason; touch {marker_dir}/semicolon",
        "and_chain": f"legit reason && touch {marker_dir}/and_chain",
        "double_quote_breakout": f'legit reason" ; touch {marker_dir}/dquote ; echo "',
        "single_quote_breakout": f"legit reason' ; touch {marker_dir}/squote ; echo '",
        "newline_injected_command": f"legit reason\ntouch {marker_dir}/newline_cmd",
        "backtick_and_dollar_combo": f"$(echo x)`echo y` && touch {marker_dir}/combo",
    }


def _load(name):
    with open(WORKFLOWS / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _find_step(doc, job_name, step_name):
    for step in doc["jobs"][job_name]["steps"]:
        if step.get("name") == step_name:
            return step
    raise AssertionError(f"step {step_name!r} not found in job {job_name!r}")


# ── 1. static: no untrusted ${{ }} left inside any run: block ──────────

@pytest.mark.parametrize("workflow_file,job_name,step_name,forbidden_exprs", [
    (
        "production-deploy-execute.yml", "deploy", "Audit trail — who/what/why",
        ["${{ inputs.break_glass_reason }}", "${{ inputs.break_glass }}",
         "${{ inputs.deploy_sha }}", "${{ github.actor }}",
         "${{ github.event_name }}", "${{ github.workflow }}"],
    ),
    (
        "break-glass-production-deploy.yml", "guard", "Require typed confirmation",
        ["${{ inputs.confirm }}", "${{ inputs.reason }}"],
    ),
    (
        "break-glass-production-deploy.yml", "guard", "Resolve exact SHA and write audit record",
        ["${{ inputs.reason }}", "${{ inputs.ref }}", "${{ github.actor }}"],
    ),
])
def test_no_untrusted_expression_interpolated_directly_into_run_block(
    workflow_file, job_name, step_name, forbidden_exprs,
):
    doc = _load(workflow_file)
    step = _find_step(doc, job_name, step_name)
    script = step.get("run", "")
    for expr in forbidden_exprs:
        assert expr not in script, (
            f"{workflow_file}:{job_name}/{step_name} still interpolates {expr!r} "
            f"directly into its run: script -- must be passed via env: and referenced "
            f"as a shell variable instead"
        )
    # And confirm it IS wired through env: instead (not just silently dropped).
    assert step.get("env"), f"{workflow_file}:{job_name}/{step_name} must define env: for its inputs"


# ── 2. dynamic: actually run the fixed scripts with hostile env values ──

def _run_script(script: str, env_overrides: dict, cwd: Path) -> tuple[subprocess.CompletedProcess, Path]:
    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    gh_output = marker_dir / "github_output"
    gh_summary = marker_dir / "github_step_summary"
    gh_output.touch()
    gh_summary.touch()
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "GITHUB_OUTPUT": str(gh_output),
        "GITHUB_STEP_SUMMARY": str(gh_summary),
        **env_overrides,
    }
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=str(cwd), env=env, capture_output=True, text=True, timeout=15,
    )
    return result, marker_dir


@pytest.mark.parametrize("payload_name", list(_hostile_payloads(Path("/tmp/urtruck-injection-marker-placeholder")).keys()))
def test_audit_trail_step_does_not_execute_hostile_break_glass_reason(payload_name):
    doc = _load("production-deploy-execute.yml")
    script = _find_step(doc, "deploy", "Audit trail — who/what/why")["run"]

    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    try:
        payload = _hostile_payloads(marker_dir)[payload_name]
        env = {
            "ACTOR": "test-actor",
            "EVENT_NAME": "workflow_dispatch",
            "WORKFLOW_NAME": "UrTruck Production Deploy (execute)",
            "DEPLOY_SHA_INPUT": "0" * 40,
            "BREAK_GLASS": "true",
            "BREAK_GLASS_REASON": payload,
        }
        result, _ = _run_script(script, env, cwd=ROOT)
        created = list(marker_dir.iterdir())
        assert not created, (
            f"payload {payload_name!r} ({payload!r}) executed as shell code -- "
            f"created marker file(s): {created}"
        )
        # The payload's first line should appear verbatim (as inert data) in
        # the warning output -- proves it was echoed as data, not executed
        # and silently replaced by whatever a command substitution produced.
        assert payload.split("\n", 1)[0] in result.stdout, (
            f"payload {payload_name!r} did not appear verbatim in output -- "
            f"stdout: {result.stdout!r}"
        )
    finally:
        for f in marker_dir.iterdir():
            f.unlink()
        marker_dir.rmdir()


@pytest.mark.parametrize("payload_name", list(_hostile_payloads(Path("/tmp/urtruck-injection-marker-placeholder")).keys()))
def test_require_confirmation_step_does_not_execute_hostile_reason_or_confirm(payload_name):
    doc = _load("break-glass-production-deploy.yml")
    script = _find_step(doc, "guard", "Require typed confirmation")["run"]

    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    try:
        payload = _hostile_payloads(marker_dir)[payload_name]
        # Exercise the payload in BOTH fields independently across the two
        # sub-cases below would double test count for little value -- the
        # confirm check runs first and exits 1 on any non-"DEPLOY" value
        # (every payload here is), which already proves it's treated as an
        # inert string compare, not executed. Also exercise it as the reason
        # with a valid confirm, to reach the second `[ -z ... ]` check.
        env_confirm = {"CONFIRM_INPUT": payload, "REASON_INPUT": "irrelevant"}
        result_confirm, _ = _run_script(script, env_confirm, cwd=ROOT)
        assert not list(marker_dir.iterdir()), (
            f"payload {payload_name!r} executed as shell code via CONFIRM_INPUT"
        )
        assert result_confirm.returncode == 1, (
            "a non-'DEPLOY' confirm value (which every hostile payload is) must be "
            "rejected with exit 1, not accidentally accepted"
        )

        env_reason = {"CONFIRM_INPUT": "DEPLOY", "REASON_INPUT": payload}
        result_reason, _ = _run_script(script, env_reason, cwd=ROOT)
        assert not list(marker_dir.iterdir()), (
            f"payload {payload_name!r} executed as shell code via REASON_INPUT"
        )
        assert result_reason.returncode == 0, (
            f"a non-empty (if hostile) reason must pass the emptiness check: "
            f"{result_reason.stdout} {result_reason.stderr}"
        )
    finally:
        for f in marker_dir.iterdir():
            f.unlink()
        marker_dir.rmdir()


@pytest.mark.parametrize("payload_name", list(_hostile_payloads(Path("/tmp/urtruck-injection-marker-placeholder")).keys()))
def test_resolve_sha_step_does_not_execute_hostile_reason(payload_name):
    doc = _load("break-glass-production-deploy.yml")
    script = _find_step(doc, "guard", "Resolve exact SHA and write audit record")["run"]

    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    try:
        payload = _hostile_payloads(marker_dir)[payload_name]
        env = {
            "ACTOR": "test-actor",
            "REF_INPUT": "main",
            "REASON_INPUT": payload,
        }
        result, _ = _run_script(script, env, cwd=ROOT)
        created = list(marker_dir.iterdir())
        assert not created, (
            f"payload {payload_name!r} ({payload!r}) executed as shell code -- "
            f"created marker file(s): {created}"
        )
        assert result.returncode == 0, f"script must still succeed: {result.stdout} {result.stderr}"
    finally:
        for f in marker_dir.iterdir():
            f.unlink()
        marker_dir.rmdir()


def test_resolve_sha_step_writes_the_reason_verbatim_as_inert_data():
    """Distinct from the hostile-payload battery above: confirm a BENIGN
    reason (no metacharacters) still ends up in the step summary and
    warning line as expected -- proves the env:/$VAR fix didn't silently
    break the audit-trail feature itself while closing the injection."""
    doc = _load("break-glass-production-deploy.yml")
    script = _find_step(doc, "guard", "Resolve exact SHA and write audit record")["run"]

    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    try:
        gh_summary = marker_dir / "github_step_summary"
        gh_summary.touch()
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "GITHUB_OUTPUT": str(marker_dir / "github_output"),
            "GITHUB_STEP_SUMMARY": str(gh_summary),
            "ACTOR": "alice",
            "REF_INPUT": "main",
            "REASON_INPUT": "urgent OTP outage, rolling back a bad push notification config",
        }
        (marker_dir / "github_output").touch()
        result = subprocess.run(
            ["bash", "-c", script], cwd=str(ROOT), env=env,
            capture_output=True, text=True, timeout=15,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        summary = gh_summary.read_text()
        assert "urgent OTP outage" in summary
        assert "alice" in summary
        assert "::warning::" in result.stdout
        assert "urgent OTP outage" in result.stdout
    finally:
        for f in marker_dir.iterdir():
            f.unlink()
        marker_dir.rmdir()


def test_newline_in_reason_is_collapsed_not_left_as_a_literal_break():
    """Defense-in-depth check (not code-execution, log/annotation spoofing):
    a reason containing an embedded newline must not produce a literal line
    break in the step summary table row or the ::warning:: annotation --
    both would be broken/spoofable otherwise."""
    doc = _load("break-glass-production-deploy.yml")
    script = _find_step(doc, "guard", "Resolve exact SHA and write audit record")["run"]

    marker_dir = Path(tempfile.mkdtemp(prefix="urtruck-injection-test-"))
    try:
        gh_summary = marker_dir / "github_step_summary"
        gh_output = marker_dir / "github_output"
        gh_summary.touch()
        gh_output.touch()
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "GITHUB_OUTPUT": str(gh_output),
            "GITHUB_STEP_SUMMARY": str(gh_summary),
            "ACTOR": "bob",
            "REF_INPUT": "main",
            "REASON_INPUT": "legit reason\n::error::fake spoofed annotation",
        }
        result = subprocess.run(
            ["bash", "-c", script], cwd=str(ROOT), env=env,
            capture_output=True, text=True, timeout=15,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        # The warning line must be a SINGLE line -- the fake ::error:: text
        # must appear as trailing text on that same line, not its own line.
        warning_lines = [ln for ln in result.stdout.splitlines() if ln.startswith("::warning::")]
        assert len(warning_lines) == 1
        assert "::error::fake spoofed annotation" in warning_lines[0], (
            "the injected fake annotation must be neutralized as trailing text on the "
            "legitimate warning line, not allowed to start its own log line"
        )
        error_lines = [ln for ln in result.stdout.splitlines() if ln.startswith("::error::")]
        assert not error_lines, f"a spoofed ::error:: annotation leaked onto its own line: {error_lines}"
    finally:
        for f in marker_dir.iterdir():
            f.unlink()
        marker_dir.rmdir()


if __name__ == "__main__":
    import sys
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
