"""Regression test for scripts/verify_android_firebase_config.py.

P1 incident (26.08.2026): Android push never worked because the shipped
build had no real Firebase project wired in — the one google-services.json
committed to the repo belonged to an unrelated project ("bizchat-4d11d")
that happened to share the same Android package name. This test proves the
CI guard script (used by build-android-apk.yml and deploy-play.yml) both
rejects that exact failure mode and accepts a well-formed config, using
only synthetic, non-secret fixtures — no real Firebase project is involved.

Lives in backend/tests/ (not tests/) purely so it is picked up automatically
by .github/workflows/pr-quality-gate.yml's `find backend/tests -name
'test_*.py'` discovery loop and runs on every PR, not only on a release
build where the real secret is present.
"""
import json
import os
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPT = os.path.join(REPO_ROOT, "scripts", "verify_android_firebase_config.py")

VALID_FIXTURE = {
    "project_info": {
        "project_id": "urtruck-test-fixture-synthetic",
        "project_number": "000000000000",
    },
    "client": [
        {
            "client_info": {
                "mobilesdk_app_id": "1:000000000000:android:0000000000000000",
                "android_client_info": {"package_name": "com.urtruck.app"},
            },
            "api_key": [{"current_key": "FIXTURE-NOT-A-REAL-KEY"}],
        }
    ],
    "configuration_version": "1",
}


def _run(*args):
    result = subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout + result.stderr


def _write_json(tmp_path, data):
    path = os.path.join(tmp_path, "google-services.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return path


def test_check_source_accepts_valid_urtruck_config():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_json(tmp, VALID_FIXTURE)
        code, output = _run("--check-source", path)
        assert code == 0, output
        assert "OK" in output


def test_check_source_rejects_known_bad_bizchat_project():
    """The exact incident: right package name, wrong Firebase project."""
    bad = json.loads(json.dumps(VALID_FIXTURE))
    bad["project_info"]["project_id"] = "bizchat-4d11d"
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_json(tmp, bad)
        code, output = _run("--check-source", path)
        assert code == 1
        assert "::error::" in output
        assert "bizchat-4d11d" in output


def test_check_source_rejects_wrong_package_name():
    wrong_pkg = json.loads(json.dumps(VALID_FIXTURE))
    wrong_pkg["client"][0]["client_info"]["android_client_info"]["package_name"] = "com.other.app"
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_json(tmp, wrong_pkg)
        code, output = _run("--check-source", path)
        assert code == 1
        assert "::error::" in output
        assert "com.urtruck.app" in output


def test_check_source_rejects_missing_file():
    code, output = _run("--check-source", "/nonexistent/google-services.json")
    assert code == 1
    assert "::error::" in output


def test_check_source_rejects_invalid_json():
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "google-services.json")
        with open(path, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        code, output = _run("--check-source", path)
        assert code == 1
        assert "::error::" in output


def test_check_plugin_accepts_current_repo_android_tree():
    """The real android/build.gradle + android/app/build.gradle in this repo
    must already have the plugin wired (this is the fix itself)."""
    android_dir = os.path.join(REPO_ROOT, "android")
    code, output = _run("--check-plugin", android_dir)
    assert code == 0, output


def test_check_plugin_rejects_missing_classpath():
    with tempfile.TemporaryDirectory() as tmp:
        app_dir = os.path.join(tmp, "app")
        os.makedirs(app_dir)
        with open(os.path.join(tmp, "build.gradle"), "w", encoding="utf-8") as f:
            f.write("buildscript { dependencies { classpath('com.android.tools.build:gradle') } }\n")
        with open(os.path.join(app_dir, "build.gradle"), "w", encoding="utf-8") as f:
            f.write("apply plugin: 'com.android.application'\n")
        code, output = _run("--check-plugin", tmp)
        assert code == 1
        assert "::error::" in output


def test_check_resources_rejects_absent_firebase_values():
    with tempfile.TemporaryDirectory() as tmp:
        res_dir = os.path.join(tmp, "res")
        os.makedirs(res_dir)
        with open(os.path.join(res_dir, "strings.xml"), "w", encoding="utf-8") as f:
            f.write('<resources><string name="app_name">x</string></resources>')
        code, output = _run("--check-resources", tmp)
        assert code == 1
        assert "::error::" in output


def test_check_resources_accepts_present_firebase_values():
    with tempfile.TemporaryDirectory() as tmp:
        gen_dir = os.path.join(tmp, "generated")
        os.makedirs(gen_dir)
        with open(os.path.join(gen_dir, "values.xml"), "w", encoding="utf-8") as f:
            f.write(
                "<resources>"
                '<string name="google_app_id">1:000:android:0000</string>'
                '<string name="gcm_defaultSenderId">000000000000</string>'
                "</resources>"
            )
        code, output = _run("--check-resources", tmp)
        assert code == 0, output


def test_check_resources_rejects_missing_directory():
    code, output = _run("--check-resources", "/nonexistent/build/dir")
    assert code == 1
    assert "::error::" in output
