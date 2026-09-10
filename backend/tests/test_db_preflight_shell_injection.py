"""Production DB preflight, P1 — shell/command injection via BACKEND_DIR.

Confirmed defect: .github/workflows/production-db-preflight.yml built the
remote SSH command as `"bash -s -- '$BACKEND_DIR'"` -- a naive single-quote
wrap. `ssh user@host "<string>"` concatenates all trailing arguments into
ONE string and hands it to the remote host's default shell for parsing
(`sh -c "<string>"`). A BACKEND_DIR value (from `secrets.BACKEND_DIR`, or
anyone who can set that secret / influence its fallback) containing a
single quote closes the wrapping quote early -- anything after it becomes
a second command that executes ON THE PRODUCTION SERVER, inside a job that
already holds pinned-key SSH access to it. Manually reproduced against the
pre-fix line before fixing: a `'; touch marker; echo '` payload created the
marker file when the exact command-construction logic was run through a
real `bash -c`.

Fix: `printf '%q' "$BACKEND_DIR"` shell-escapes the value into a token that
round-trips back to the exact original string when parsed as ONE argument,
regardless of what metacharacters it contains -- the standard technique for
safely embedding an untrusted value in a command string that must cross a
process boundary (here, local runner -> ssh -> remote shell) as data, not
be re-parsed as script.

This file tests the fix by extracting the ACTUAL current script text of
the workflow's "Read-only production DB preflight" step and running it for
real via `bash -c`, with `scripts/deploy-ssh.sh` replaced by a test stub
that faithfully reproduces the one property of real `ssh` that matters for
this vulnerability class: it takes the single command-string argument and
executes it via a shell, with stdin passed straight through (mirroring ssh
forwarding the local process's stdin, i.e. the workflow's `<<'REMOTE'`
heredoc, to the remote command's stdin) -- everything else about a real SSH
session (auth, host-key pinning, network transport) is irrelevant to
whether the command-string construction is injection-safe, so the stub
deliberately doesn't reproduce it.

Deliberately dependency-free (no PyYAML): the fix scope for this track is
`.github/workflows/production-db-preflight.yml` only, and this repo's CI
installs `pip install -r requirements.txt pytest` with no YAML library --
adding one would mean touching CI/requirements files outside that scope.
Every check below parses the workflow with plain text/regex extraction
instead, which is entirely adequate for one specific, stable file.
"""
import os
import re
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "production-db-preflight.yml"

_DEPLOY_SSH_STUB = """#!/usr/bin/env bash
# Test stub for scripts/deploy-ssh.sh -- reproduces exactly the one
# property of real `ssh user@host "<command>"` that matters for this
# vulnerability class: concatenate the trailing argument(s) into a command
# string and hand it to a shell for parsing, with stdin passed through
# (mirroring ssh forwarding local stdin to the remote command's stdin).
# Everything else (auth, transport, host keys) is irrelevant to whether the
# command-string CONSTRUCTION is injection-safe.
set -euo pipefail
sub="$1"; shift
case "$sub" in
  ssh)
    exec bash -c "$1"
    ;;
  *)
    echo "unsupported stub subcommand: $sub" >&2
    exit 2
    ;;
esac
"""


def _load_step_script() -> str:
    """Extract the `run: |` block scalar body of the "Read-only production
    DB preflight" step via plain text parsing (no YAML library -- see
    module docstring for why). Relies only on standard YAML block-scalar
    indentation rules: the body is every subsequent line indented at least
    as much as the FIRST body line, dedented by that common amount, ending
    at the first line indented less (the next step, or end of steps)."""
    lines = WORKFLOW.read_text(encoding="utf-8").splitlines()
    step_idx = next(i for i, ln in enumerate(lines) if ln.strip() == "- name: Read-only production DB preflight")
    run_idx = next(i for i in range(step_idx, len(lines)) if re.match(r"^\s*run:\s*\|\s*$", lines[i]))
    base_indent = None
    body = []
    for ln in lines[run_idx + 1:]:
        if ln.strip() == "":
            body.append("")
            continue
        indent = len(ln) - len(ln.lstrip(" "))
        if base_indent is None:
            base_indent = indent
        if indent < base_indent:
            break
        body.append(ln[base_indent:])
    assert body, "failed to extract the step's run: script body"
    return "\n".join(body)


def _hostile_payloads(marker_dir: Path) -> dict[str, str]:
    return {
        "single_quote_breakout": f"/home/ubuntu/x'; touch {marker_dir}/pwned; echo '",
        "double_quote_breakout": f'/home/ubuntu/x"; touch {marker_dir}/pwned; echo "',
        "command_substitution_dollar": f"/home/ubuntu/x$(touch {marker_dir}/pwned)",
        "command_substitution_backtick": f"/home/ubuntu/x`touch {marker_dir}/pwned`",
        "semicolon_chain": f"/home/ubuntu/x; touch {marker_dir}/pwned",
        "and_chain": f"/home/ubuntu/x && touch {marker_dir}/pwned",
        "newline_injected_command": f"/home/ubuntu/x\ntouch {marker_dir}/pwned",
        "combo": f"$(echo x)`echo y`'; touch {marker_dir}/pwned; echo '",
    }


def _run_step_with_backend_dir(backend_dir: str, workdir: Path) -> subprocess.CompletedProcess:
    """Sets up a temp working directory with the stub deploy-ssh.sh at the
    relative path the real script expects (scripts/deploy-ssh.sh), then
    runs the ACTUAL extracted step script against it."""
    scripts_dir = workdir / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    stub = scripts_dir / "deploy-ssh.sh"
    stub.write_text(_DEPLOY_SSH_STUB)
    stub.chmod(0o755)

    script = _load_step_script()
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "SERVER_HOST": "test-host.invalid",
        "SERVER_USER": "test-user",
        "SERVER_SSH_KEY": "dummy-key-value",
        "SERVER_SSH_KNOWN_HOSTS": "dummy-known-hosts-value",
        "BACKEND_DIR": backend_dir,
    }
    return subprocess.run(
        ["bash", "-c", script], cwd=str(workdir), env=env,
        capture_output=True, text=True, timeout=15,
    )


@pytest.mark.parametrize("payload_name", list(_hostile_payloads(Path("/tmp/placeholder")).keys()))
def test_hostile_backend_dir_does_not_execute_commands_on_the_remote_shell(payload_name, tmp_path):
    marker_dir = tmp_path / "marker"
    marker_dir.mkdir()
    payload = _hostile_payloads(marker_dir)[payload_name]

    workdir = tmp_path / "workdir"
    workdir.mkdir()
    result = _run_step_with_backend_dir(payload, workdir)

    created = list(marker_dir.iterdir())
    assert not created, (
        f"payload {payload_name!r} ({payload!r}) executed as shell code on the "
        f"'remote' side -- created marker file(s): {created}\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )


@pytest.mark.parametrize("payload_name", list(_hostile_payloads(Path("/tmp/placeholder")).keys()))
def test_hostile_backend_dir_is_received_verbatim_as_data(payload_name, tmp_path):
    """Beyond "nothing executed" -- confirm the remote script's own `$1`
    (BACKEND_DIR) actually equals the original hostile string byte-for-byte,
    proving it crossed the local-shell -> stub-ssh -> remote-shell boundary
    as inert data, not silently mangled or truncated by the escaping."""
    marker_dir = tmp_path / "marker"
    marker_dir.mkdir()
    payload = _hostile_payloads(marker_dir)[payload_name]

    workdir = tmp_path / "workdir"
    workdir.mkdir()
    # Swap the real remote script body for a minimal probe that just proves
    # $1 arrived intact -- the real body's sqlite3/DB-discovery logic isn't
    # what this test is about (covered by other tests in this file/suite),
    # and asserting byte-equality against real SQL output would be fragile.
    real_script = _load_step_script()
    received_file = Path(tempfile.gettempdir()) / f"urtruck_test_received_probe_{payload_name}"
    probe_script = real_script.split("<<'REMOTE'", 1)[0] + \
        f"<<'REMOTE'\nprintf '%s' \"$1\" > {received_file}\nREMOTE\n"
    scripts_dir = workdir / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    stub = scripts_dir / "deploy-ssh.sh"
    stub.write_text(_DEPLOY_SSH_STUB)
    stub.chmod(0o755)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "SERVER_HOST": "test-host.invalid",
        "SERVER_USER": "test-user",
        "SERVER_SSH_KEY": "dummy-key-value",
        "SERVER_SSH_KNOWN_HOSTS": "dummy-known-hosts-value",
        "BACKEND_DIR": payload,
    }
    subprocess.run(["bash", "-c", probe_script], cwd=str(workdir), env=env, capture_output=True, text=True, timeout=15)
    try:
        assert received_file.exists(), f"probe never ran for payload {payload_name!r}"
        assert received_file.read_text() == payload, (
            f"payload {payload_name!r} was mangled in transit: got {received_file.read_text()!r}"
        )
    finally:
        received_file.unlink(missing_ok=True)
    created = list(marker_dir.iterdir())
    assert not created, f"payload {payload_name!r} also executed as code: {created}"


def test_benign_backend_dir_still_reaches_database_not_found_cleanly(tmp_path):
    """Sanity check that the fix didn't break the ordinary, non-hostile
    case -- a plausible-looking but nonexistent BACKEND_DIR should still
    reach the script's own clean "database not found" exit, not error out
    on the quoting mechanism itself."""
    workdir = tmp_path / "workdir"
    workdir.mkdir()
    result = _run_step_with_backend_dir("/home/ubuntu/urtruck-security", workdir)
    assert "DB_PREFLIGHT=BLOCKED_DATABASE_NOT_FOUND" in result.stdout, (
        f"expected a clean not-found exit for a benign nonexistent path; "
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )


def test_workflow_no_longer_uses_the_naive_single_quote_wrap():
    script = _load_step_script()
    assert "\"bash -s -- '$BACKEND_DIR'\"" not in script, (
        "the naive, injection-unsafe single-quote wrap of BACKEND_DIR must not return"
    )
    assert "printf '%q'" in script, "expected the printf %q shell-escaping fix to be present"
    assert "BACKEND_DIR_Q" in script, "expected BACKEND_DIR to be routed through the escaped variable"


# ── structural safety properties (regression pins for the full checklist) ──

def _raw() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


def test_checkout_is_pinned_to_an_immutable_commit_sha_not_a_mutable_tag():
    raw = _raw()
    m = re.search(r"uses:\s*actions/checkout@(\S+)", raw)
    assert m, "no actions/checkout step found"
    ref = m.group(1)
    assert re.fullmatch(r"[0-9a-f]{40}", ref), (
        f"actions/checkout must be pinned to a 40-char immutable commit SHA, not a "
        f"mutable tag/branch; got: {ref!r}"
    )
    # And no OTHER `uses:` line anywhere in the file falls back to a mutable
    # ref (e.g. a second action added later that isn't pinned the same way).
    for line in raw.splitlines():
        um = re.search(r"uses:\s*([^\s#]+)@(\S+)", line)
        if um:
            ref = um.group(2)
            assert re.fullmatch(r"[0-9a-f]{40}", ref), f"unpinned action reference: {line.strip()!r}"


def test_workflow_dispatch_only_trigger():
    raw = _raw()
    on_block = re.search(r"(?m)^on:\n((?:[ \t]+.*\n?)*)", raw)
    assert on_block, "no top-level `on:` block found"
    trigger_keys = re.findall(r"(?m)^  (\w[\w-]*):", on_block.group(1))
    assert trigger_keys == ["workflow_dispatch"], (
        f"this workflow must only be triggerable manually; got triggers: {trigger_keys}"
    )


def test_environment_is_production():
    raw = _raw()
    assert re.search(r"(?m)^\s*environment:\s*production\s*$", raw), (
        "the job must run under the protected 'production' GitHub environment "
        "so its branch/reviewer protection rules gate the SSH secrets"
    )


def test_permissions_are_contents_read_only():
    raw = _raw()
    perm_block = re.search(r"(?m)^permissions:\n((?:[ \t]+.*\n?)*)", raw)
    assert perm_block, "no top-level `permissions:` block found"
    perms = dict(re.findall(r"(?m)^  (\w+):\s*(\w+)", perm_block.group(1)))
    assert perms == {"contents": "read"}, (
        f"this workflow must request no permissions beyond read-only repo checkout; got: {perms}"
    )


def test_only_ssh_key_transport_pinned_known_hosts_no_password_fallback():
    raw = _raw()
    assert "SERVER_SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}" in raw
    assert "SERVER_SSH_KNOWN_HOSTS: ${{ secrets.SERVER_SSH_KNOWN_HOSTS }}" in raw
    assert "SERVER_PASS" not in raw, (
        "this workflow must not reference SERVER_PASS at all -- it must always use "
        "the pinned-key transport, never fall back to the legacy password mode"
    )
    assert 'test -n "$SERVER_SSH_KEY"' in raw, "the script must hard-require the SSH key be present"
    assert 'test -n "$SERVER_SSH_KNOWN_HOSTS"' in raw, "the script must hard-require pinned known_hosts be present"


def test_no_scp_deploy_restart_or_pm2_mutation():
    raw = _raw().lower()
    for forbidden in ("deploy-ssh.sh scp", "pm2 restart", "pm2 reload", "pm2 stop",
                       "systemctl restart", "npm run build", "scp "):
        assert forbidden not in raw, f"found forbidden operation {forbidden!r} in a diagnostic-only workflow"


def test_sql_is_read_only_and_aggregate_only():
    raw = _raw()
    assert "sqlite3 -readonly" in raw, "sqlite3 must be opened with -readonly"
    assert "PRAGMA query_only = ON" in raw, "the connection must also set PRAGMA query_only = ON"
    for forbidden in ("INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "CREATE ", "ATTACH "):
        assert forbidden not in raw, f"found a mutating/schema SQL keyword {forbidden!r} -- must be SELECT-only"
    assert "SELECT *" not in raw
    for leak_prone in ("owner_id", "driver_id", "shipper_id", "phone", "cargo_id", "trip_id"):
        for line in raw.splitlines():
            if "SELECT" in line and leak_prone in line and "COUNT(" not in line and "CASE" not in line:
                raise AssertionError(f"possible row-level data leak in SQL line: {line.strip()!r}")


if __name__ == "__main__":
    import sys
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-v"]))
