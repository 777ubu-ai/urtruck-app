#!/usr/bin/env python3
"""Restore tracked UrTruck Kotlin classes that Expo prebuild clears from android/."""

from __future__ import annotations

import argparse
import hashlib
import subprocess
from pathlib import Path


SOURCE_FILES = (
    "UrTruckBadgePolicy.kt",
    "UrTruckFirebaseMessagingService.kt",
    "UrTruckNotificationBadgeModule.kt",
    "UrTruckNotificationBadgePackage.kt",
    "UrTruckNotificationBadgeStore.kt",
    "UrTruckSystemBarsModule.kt",
    "UrTruckSystemBarsPackage.kt",
)
SOURCE_DIR = "android/app/src/main/java/com/urtruck/app"


def restore_sources(repo: Path, expected_sha: str) -> dict[str, str]:
    actual_sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=repo, text=True
    ).strip()
    if actual_sha != expected_sha:
        raise ValueError(f"expected source {expected_sha}, checked out {actual_sha}")

    destination = repo / SOURCE_DIR
    destination.mkdir(parents=True, exist_ok=True)
    checksums: dict[str, str] = {}
    for filename in SOURCE_FILES:
        source = f"{expected_sha}:{SOURCE_DIR}/{filename}"
        content = subprocess.check_output(["git", "show", source], cwd=repo)
        (destination / filename).write_bytes(content)
        checksums[filename] = hashlib.sha256(content).hexdigest()
    return checksums


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    for filename, checksum in restore_sources(args.repo.resolve(), args.expected_sha).items():
        print(f"restored={filename} sha256={checksum}")


if __name__ == "__main__":
    main()
