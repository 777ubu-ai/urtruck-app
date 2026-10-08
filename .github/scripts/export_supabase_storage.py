#!/usr/bin/env python3
"""Create a private, verified export of every Supabase Storage bucket."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tarfile
import time
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


PAGE_SIZE = 1000
MAX_ATTEMPTS = 3


def fail(message: str) -> None:
    print(f"Supabase storage export failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def request_bytes(url: str, headers: dict[str, str], payload: bytes | None = None) -> bytes:
    method = "POST" if payload is not None else "GET"
    request = Request(url, data=payload, headers=headers, method=method)
    for attempt in range(MAX_ATTEMPTS):
        try:
            with urlopen(request, timeout=90) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code < 500 and exc.code != 429:
                fail(f"Storage API returned HTTP {exc.code}")
            if attempt == MAX_ATTEMPTS - 1:
                fail(f"Storage API returned HTTP {exc.code} after retries")
        except (TimeoutError, URLError, OSError):
            if attempt == MAX_ATTEMPTS - 1:
                fail("Storage API request failed after retries")
        time.sleep(2**attempt)
    fail("Storage API request failed")
    raise AssertionError("unreachable")


def request_json(url: str, headers: dict[str, str], payload: dict | None = None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    raw = request_bytes(url, headers, body)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        fail("Storage API returned invalid JSON")


def safe_object_path(value: str) -> PurePosixPath:
    if not value or "\x00" in value or "\\" in value or value.startswith("/"):
        fail("Storage API returned an unsafe object path")
    path = PurePosixPath(value)
    if any(part in {"", ".", ".."} for part in path.parts):
        fail("Storage API returned an unsafe object path")
    return path


def safe_bucket_name(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        fail("Storage API returned an unsafe bucket name")
    return value


def main() -> None:
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    output_value = os.environ.get("OUTPUT_DIR", "")
    output_root = Path(output_value) if output_value else Path()
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co"):
        fail("SUPABASE_URL must target the configured HTTPS Supabase project")
    if not service_key:
        fail("required storage credential is not configured")
    if not output_value:
        fail("OUTPUT_DIR is not configured")

    output_root.mkdir(mode=0o700, parents=True, exist_ok=False)
    objects_root = output_root / "objects"
    objects_root.mkdir(mode=0o700)
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    buckets = request_json(f"{base_url}/storage/v1/bucket", headers)
    if not isinstance(buckets, list):
        fail("Storage API bucket response is not a list")

    bucket_metadata: list[dict] = []
    object_index: list[dict] = []
    actual_bytes = 0
    actual_count = 0

    for bucket in buckets:
        name = safe_bucket_name(str(bucket.get("name", "")))
        bucket_metadata.append(
            {
                key: bucket.get(key)
                for key in ("id", "name", "public", "file_size_limit", "allowed_mime_types")
            }
        )
        bucket_root = objects_root / name
        bucket_root.mkdir(mode=0o700)
        pending_prefixes = [""]
        seen_prefixes: set[str] = set()

        while pending_prefixes:
            prefix = pending_prefixes.pop()
            if prefix in seen_prefixes:
                fail("Storage API returned a repeated folder prefix")
            seen_prefixes.add(prefix)
            offset = 0
            while True:
                page = request_json(
                    f"{base_url}/storage/v1/object/list/{quote(name, safe='')}",
                    headers,
                    {
                        "prefix": prefix,
                        "limit": PAGE_SIZE,
                        "offset": offset,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                if not isinstance(page, list):
                    fail("Storage API object-list response is not a list")
                for item in page:
                    child_name = item.get("name")
                    if not isinstance(child_name, str) or not child_name:
                        fail("Storage API returned an invalid object name")
                    if child_name.startswith("/") or "\x00" in child_name or "\\" in child_name:
                        fail("Storage API returned an unsafe object name")
                    key = f"{prefix}{child_name}"
                    if item.get("id") is None:
                        folder = safe_object_path(key)
                        pending_prefixes.append(f"{folder.as_posix().rstrip('/')}/")
                        continue

                    relative = safe_object_path(key)
                    metadata = item.get("metadata") or {}
                    try:
                        declared_size = int(metadata["size"])
                    except (KeyError, TypeError, ValueError):
                        fail("Storage API omitted a valid object size")
                    if declared_size < 0:
                        fail("Storage API returned an invalid object size")

                    destination = bucket_root.joinpath(*relative.parts)
                    resolved = destination.resolve()
                    if not resolved.is_relative_to(bucket_root.resolve()):
                        fail("Storage object path escaped the private export directory")
                    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    object_url = (
                        f"{base_url}/storage/v1/object/authenticated/"
                        f"{quote(name, safe='')}/{quote(relative.as_posix(), safe='/')}"
                    )
                    payload = request_bytes(object_url, headers)
                    if len(payload) != declared_size:
                        fail("Downloaded object size did not match Storage metadata")
                    with destination.open("xb") as output_file:
                        output_file.write(payload)
                    destination.chmod(0o600)
                    digest = hashlib.sha256(payload).hexdigest()
                    object_index.append(
                        {
                            "bucket": name,
                            "name": relative.as_posix(),
                            "id": item.get("id"),
                            "created_at": item.get("created_at"),
                            "updated_at": item.get("updated_at"),
                            "last_accessed_at": item.get("last_accessed_at"),
                            "metadata": metadata,
                            "sha256": digest,
                        }
                    )
                    actual_count += 1
                    actual_bytes += len(payload)

                if len(page) < PAGE_SIZE:
                    break
                offset += len(page)

    metadata_path = output_root / "supabase-storage-metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "format": "urtruck-supabase-storage-backup-v1",
                "bucket_count": len(bucket_metadata),
                "object_count": actual_count,
                "total_bytes": actual_bytes,
                "buckets": bucket_metadata,
                "objects": object_index,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    metadata_path.chmod(0o600)

    bundle_path = output_root / "supabase-storage-backup.tar.gz"
    with tarfile.open(bundle_path, "w:gz") as archive:
        archive.add(metadata_path, arcname="supabase-storage-metadata.json")
        for bucket in bucket_metadata:
            bucket_root = objects_root / str(bucket["name"])
            archive.add(bucket_root, arcname=f"objects/{bucket['name']}")
    bundle_path.chmod(0o600)
    with tarfile.open(bundle_path, "r:gz") as archive:
        members = archive.getmembers()
        if not any(member.name == "supabase-storage-metadata.json" for member in members):
            fail("Storage archive is missing its metadata manifest")
        regular_objects = sum(
            1 for member in members if member.isfile() and member.name != "supabase-storage-metadata.json"
        )
        if regular_objects != actual_count:
            fail("Storage archive object count did not match its manifest")

    bundle_hash = hashlib.sha256(bundle_path.read_bytes()).hexdigest()
    summary = {
        "archive_path": str(bundle_path),
        "archive_bytes": bundle_path.stat().st_size,
        "archive_sha256": bundle_hash,
        "bucket_count": len(bucket_metadata),
        "object_count": actual_count,
        "total_bytes": actual_bytes,
    }
    (output_root / "summary.json").write_text(json.dumps(summary) + "\n", encoding="utf-8")
    print(
        "Supabase Storage export verified: "
        f"buckets={len(bucket_metadata)} objects={actual_count} bytes={actual_bytes} "
        f"archive_sha256={bundle_hash}"
    )


if __name__ == "__main__":
    main()
