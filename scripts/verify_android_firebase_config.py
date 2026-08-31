#!/usr/bin/env python3
"""Fail-closed guard for Android Firebase/FCM build configuration.

P1 incident (26.08.2026): production Android push has *never* worked
(native_android=0 in /push/info) because the Android build shipped with no
real Firebase project wired in at all — no google-services Gradle plugin
applied, no generated google_app_id/gcm_defaultSenderId anywhere in the
build output. The one google-services.json that WAS committed to this repo
silently belonged to an unrelated Firebase project ("bizchat-4d11d") that
merely happened to share the same Android package name (com.urtruck.app) —
which is exactly why a naive "does the file exist" check is not enough and
this script checks project identity, not just presence.

This script is called at three points from both release workflows
(.github/workflows/build-android-apk.yml, .github/workflows/deploy-play.yml)
so a broken/missing/wrong-project config fails LOUDLY and EARLY instead of
silently shipping an Android build that can never receive a push:

  --check-source <path-to-google-services.json>
      Run BEFORE expo prebuild / before the Gradle build starts. Verifies
      the file exists, is valid JSON, belongs to a real (non-placeholder)
      Firebase project, is not the known-bad BizChat project, and lists
      com.urtruck.app among its Android clients.

  --check-plugin <android-dir>
      Run AFTER expo prebuild (or against the committed android/ tree for
      the no-prebuild deploy-play.yml path). Verifies the Google Services
      Gradle plugin is actually wired: the classpath in the top-level
      build.gradle and the `apply plugin` in app/build.gradle.

  --check-resources <app-build-dir>
      Run AFTER a Gradle task that generates/merges Android resources
      (e.g. processReleaseManifest, assembleRelease, bundleRelease).
      Verifies google_app_id and gcm_defaultSenderId actually appear
      somewhere in the compiled output — proof the plugin didn't just
      apply syntactically but genuinely processed a real config and
      produced real Firebase runtime values.

Exit code 0 = PASS. Any failure prints a clear ::error:: line (GitHub
Actions annotation format) and exits 1. Never prints secret file contents.
"""
import argparse
import json
import os
import sys

# The exact Firebase project this incident found wrongly committed to this
# repo. A config identifying as this project is REJECTED even if it is
# otherwise well-formed and lists the right package name — that combination
# (right package, wrong project) is precisely what caused native_android=0
# to go unnoticed for as long as it did.
KNOWN_BAD_PROJECT_IDS = {"bizchat-4d11d"}

DEFAULT_EXPECTED_PACKAGE = "com.urtruck.app"


def expected_package():
    return os.getenv("URTRUCK_APPLICATION_ID") or DEFAULT_EXPECTED_PACKAGE


def fail(message):
    print(f"::error::{message}", flush=True)
    sys.exit(1)


def ok(message):
    print(f"[verify-android-firebase-config] OK: {message}", flush=True)


def check_source(path):
    if not os.path.isfile(path):
        fail(
            f"Android Firebase config not found at {path}. This build cannot "
            f"register for FCM without it. Populate the "
            f"ANDROID_GOOGLE_SERVICES_JSON_BASE64 repository secret with the "
            f"real UrTruck Firebase Android app's google-services.json "
            f"(base64-encoded), for package {expected_package()}."
        )

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"Android Firebase config at {path} is not valid JSON: {exc}")

    project_id = data.get("project_info", {}).get("project_id")
    if not project_id:
        fail(
            f"Android Firebase config at {path} has no project_info.project_id "
            f"— not a valid google-services.json."
        )

    if project_id in KNOWN_BAD_PROJECT_IDS:
        fail(
            f"Android Firebase config at {path} belongs to project "
            f"'{project_id}', which is a KNOWN-WRONG project for this repo "
            f"(a leftover from an unrelated app, previously committed by "
            f"mistake — see docs/release/android-firebase-config.md). This is "
            f"NOT the real UrTruck Firebase project even though it may list "
            f"the right package name. Replace the "
            f"ANDROID_GOOGLE_SERVICES_JSON_BASE64 secret with the real "
            f"UrTruck project's config."
        )

    clients = data.get("client", [])
    package_names = {
        c.get("client_info", {}).get("android_client_info", {}).get("package_name")
        for c in clients
    }
    expected = expected_package()
    if expected not in package_names:
        fail(
            f"Android Firebase config at {path} (project '{project_id}') does "
            f"not list package '{expected}' among its Android clients "
            f"(found: {sorted(p for p in package_names if p)}). Wrong Firebase "
            f"Android app."
        )

    ok(f"source config valid — project_id='{project_id}', package matches {expected}")


def check_plugin(android_dir):
    root_gradle = os.path.join(android_dir, "build.gradle")
    app_gradle = os.path.join(android_dir, "app", "build.gradle")

    for path in (root_gradle, app_gradle):
        if not os.path.isfile(path):
            fail(f"Expected Gradle file not found: {path}")

    root_src = open(root_gradle, "r", encoding="utf-8").read()
    if "com.google.gms:google-services" not in root_src:
        fail(
            f"{root_gradle} does not declare the com.google.gms:google-services "
            f"classpath — the Google Services Gradle plugin cannot be applied. "
            f"See docs/release/android-firebase-config.md."
        )

    app_src = open(app_gradle, "r", encoding="utf-8").read()
    if "com.google.gms.google-services" not in app_src:
        fail(
            f"{app_gradle} does not apply the com.google.gms.google-services "
            f"plugin — Firebase config will not be processed into build "
            f"resources even if google-services.json is present. See "
            f"docs/release/android-firebase-config.md."
        )

    ok("google-services Gradle plugin is wired (classpath + apply)")


def check_resources(app_build_dir):
    if not os.path.isdir(app_build_dir):
        fail(
            f"{app_build_dir} does not exist — did the Gradle build run "
            f"before this check?"
        )

    found_app_id = False
    found_sender_id = False
    for dirpath, _dirnames, filenames in os.walk(app_build_dir):
        for name in filenames:
            if not name.endswith((".xml", ".txt", ".properties")):
                continue
            full = os.path.join(dirpath, name)
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except OSError:
                continue
            if "google_app_id" in content:
                found_app_id = True
            if "gcm_defaultSenderId" in content:
                found_sender_id = True
            if found_app_id and found_sender_id:
                break
        if found_app_id and found_sender_id:
            break

    if not found_app_id or not found_sender_id:
        fail(
            f"Real Firebase runtime resources were not found anywhere under "
            f"{app_build_dir} (google_app_id present={found_app_id}, "
            f"gcm_defaultSenderId present={found_sender_id}). The "
            f"google-services plugin ran but did not generate real config — "
            f"this is exactly the P1 symptom this guard exists to catch. "
            f"Verify the ANDROID_GOOGLE_SERVICES_JSON_BASE64 secret decodes "
            f"to a genuine google-services.json."
        )

    ok("google_app_id and gcm_defaultSenderId are present in the real build output")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check-source", metavar="PATH")
    group.add_argument("--check-plugin", metavar="ANDROID_DIR")
    group.add_argument("--check-resources", metavar="APP_BUILD_DIR")
    args = parser.parse_args()

    if args.check_source:
        check_source(args.check_source)
    elif args.check_plugin:
        check_plugin(args.check_plugin)
    elif args.check_resources:
        check_resources(args.check_resources)


if __name__ == "__main__":
    main()
