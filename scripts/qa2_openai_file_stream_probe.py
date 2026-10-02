"""Measure streaming events for one completed, controlled audio file.

This is an experiment only.  It never changes the production voice queue,
never falls back to another provider, and never emits transcript/audio/key
content.  It is designed to run solely on QA2 where the existing secret is
already available.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys
import time
from typing import Any, Iterable

import httpx


MODEL = "gpt-4o-mini-transcribe"
URL = "https://api.openai.com/v1/audio/transcriptions"
_ALLOWED_SUFFIXES = {".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm"}


class StreamProbeError(RuntimeError):
    """A stable, payload-free error category for QA evidence."""


def _category(error: Exception) -> str:
    if isinstance(error, httpx.TimeoutException):
        return "timeout"
    if isinstance(error, httpx.HTTPStatusError):
        return f"http_{error.response.status_code}" if error.response is not None else "provider_error"
    if isinstance(error, httpx.HTTPError):
        return "network_error"
    return "probe_error"


def _detected_language(event: dict[str, Any]) -> str | None:
    language = event.get("language")
    if isinstance(language, str) and language.strip():
        return language.strip().lower()
    languages = event.get("languages")
    if isinstance(languages, list) and languages and isinstance(languages[0], dict):
        code = languages[0].get("code")
        if isinstance(code, str) and code.strip():
            return code.strip().lower()
    return None


def _events(lines: Iterable[str]) -> Iterable[dict[str, Any]]:
    for line in lines:
        if not line.startswith("data:"):
            continue
        raw = line[5:].strip()
        if not raw or raw == "[DONE]":
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise StreamProbeError("malformed_stream_event") from exc
        if not isinstance(event, dict):
            raise StreamProbeError("malformed_stream_event")
        yield event


def run_probe(
    audio_path: Path,
    api_key: str,
    *,
    timeout_seconds: float,
    client: httpx.Client | None = None,
    clock=time.monotonic,
) -> dict[str, Any]:
    """Return content-free timing data for the completed-file stream path."""
    if not 0 < timeout_seconds <= 10:
        raise ValueError("timeout_seconds must be in (0, 10]")
    if audio_path.suffix.lower() not in _ALLOWED_SUFFIXES or not audio_path.is_file():
        raise ValueError("controlled audio file is missing or has an unsupported format")
    started = clock()
    first_delta_ms: int | None = None
    complete_ms: int | None = None
    delta_count = 0
    detected_language: str | None = None
    owns_client = client is None
    client = client or httpx.Client()
    mime = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"
    try:
        with audio_path.open("rb") as audio_file:
            with client.stream(
                "POST",
                URL,
                headers={"Authorization": f"Bearer {api_key}"},
                data={"model": MODEL, "stream": "true"},
                files={"file": (audio_path.name, audio_file, mime)},
                timeout=timeout_seconds,
            ) as response:
                response.raise_for_status()
                for event in _events(response.iter_lines()):
                    event_type = event.get("type")
                    if event_type == "transcript.text.delta":
                        delta_count += 1
                        if first_delta_ms is None:
                            first_delta_ms = round((clock() - started) * 1000)
                    elif event_type == "transcript.text.done":
                        complete_ms = round((clock() - started) * 1000)
                        detected_language = _detected_language(event)
    except StreamProbeError:
        raise
    except Exception as exc:
        raise StreamProbeError(_category(exc)) from exc
    finally:
        if owns_client:
            client.close()
    if complete_ms is None:
        raise StreamProbeError("missing_final_event")
    return {
        "provider": "openai",
        "model": MODEL,
        "mode": "completed_file_stream",
        "audio_bytes": audio_path.stat().st_size,
        "request_to_first_delta_ms": first_delta_ms,
        "request_to_complete_ms": complete_ms,
        "delta_count": delta_count,
        "detected_language": detected_language,
        "outcome": "success",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="QA2 content-free OpenAI file-stream probe")
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--timeout-seconds", required=True, type=float)
    args = parser.parse_args()
    # QA2 uses the existing server-only secret.  No local key is created or
    # copied, and the value is never reflected in an exception or output.
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("openai_key_missing")
    try:
        print(json.dumps(run_probe(args.audio, api_key, timeout_seconds=args.timeout_seconds), sort_keys=True))
    except StreamProbeError as exc:
        print(json.dumps({"provider": "openai", "model": MODEL, "outcome": "failed", "error_category": str(exc)}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
