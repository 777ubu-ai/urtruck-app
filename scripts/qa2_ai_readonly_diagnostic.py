#!/usr/bin/env python3
"""Read-only QA2 local-AI measurements.

This script is intended to run on the QA2 host from the protected recovery
runner. It never writes the database, restarts a service, changes a model, or
prints tokens/secrets. It prints JSON lines with timings and safe identifiers.
"""

from __future__ import annotations

import hashlib
import json
import os
import resource
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

DB_PATH = Path(os.getenv("QA2_DB_PATH", "/home/ubuntu/urtruck-qa2/database/security.db"))
AI_ROOT = Path(os.getenv("QA2_AI_ROOT", "/home/ubuntu/urtruck-qa2-ai"))
AI_URL = "http://127.0.0.1:8003"
MESSAGE_TARGETS = {146: "zh", 147: "ru", 148: "zh"}


def emit(kind: str, **values):
    print(json.dumps({"kind": kind, **values}, ensure_ascii=False), flush=True)


def rss_bytes() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError):
        return None
    return None


def snapshot(label: str):
    usage = resource.getrusage(resource.RUSAGE_SELF)
    load = os.getloadavg()
    emit(
        "resource",
        label=label,
        rss_bytes=rss_bytes(),
        cpu_user_ms=round(usage.ru_utime * 1000, 2),
        cpu_system_ms=round(usage.ru_stime * 1000, 2),
        load_1m=round(load[0], 3),
        load_5m=round(load[1], 3),
        load_15m=round(load[2], 3),
    )


def open_db():
    uri = f"file:{DB_PATH}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def load_rows():
    with open_db() as db:
        db.row_factory = sqlite3.Row
        messages = db.execute(
            "SELECT id, text, is_voice, voice_duration, photo_url, "
            "voice_transcript, voice_transcript_lang, voice_transcript_provider "
            "FROM chat_messages WHERE id IN (146,147,148) ORDER BY id"
        ).fetchall()
        latest_voice = db.execute(
            "SELECT id, text, is_voice, voice_duration, photo_url, "
            "voice_transcript, voice_transcript_lang, voice_transcript_provider "
            "FROM chat_messages WHERE is_voice=1 ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return messages, latest_voice


def detect_source(text: str) -> str:
    if any("\u3400" <= char <= "\u9fff" for char in text):
        return "zh"
    if any("\u0400" <= char <= "\u04ff" for char in text):
        return "ru"
    return "en"


def safe_text_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def post_json(path: str, payload: dict, timeout: int = 240):
    request = urllib.request.Request(
        f"{AI_URL}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"detail": type(exc).__name__}
        return exc.code, payload


def endpoint_translate(message_id: int, text: str, target: str):
    source = detect_source(text)
    started = time.perf_counter()
    try:
        status, payload = post_json(
            "/translate",
            {"text": text, "source_lang": source, "target_lang": target},
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        detail = payload.get("detail") if isinstance(payload, dict) else None
        candidate = detail.get("candidate") if isinstance(detail, dict) else None
        emit(
            "endpoint_translation",
            message_id=message_id,
            source_lang=source,
            target_lang=target,
            http=status,
            response_ms=elapsed_ms,
            provider=payload.get("provider") if status < 400 else None,
            translated_text=payload.get("translated_text") if status < 400 else None,
            candidate_text=candidate if status == 422 else None,
            error=(detail.get("message") if isinstance(detail, dict) else detail)
            if status >= 400
            else None,
        )
    except Exception as exc:
        emit(
            "endpoint_translation",
            message_id=message_id,
            source_lang=source,
            target_lang=target,
            http=None,
            response_ms=round((time.perf_counter() - started) * 1000, 2),
            error=type(exc).__name__,
        )


def beam_benchmark(rows):
    sys.path.insert(0, str(AI_ROOT / "app"))
    from ctranslate2 import Translator
    from transformers import AutoTokenizer
    from quality import repair_logistics_translation, translation_quality_ok

    model = AI_ROOT / "models" / "nllb-200-distilled-1.3b-int8"
    tokenizer_root = AI_ROOT / "models" / "nllb-200-distilled-1.3b-tokenizer"
    tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_root), local_files_only=True)
    translator = Translator(str(model), device="cpu", compute_type="int8", inter_threads=1, intra_threads=4)
    languages = {"ru": "rus_Cyrl", "zh": "zho_Hans", "en": "eng_Latn"}
    for row in rows:
        if not row["text"] or row["id"] not in MESSAGE_TARGETS:
            continue
        source = detect_source(row["text"])
        target = MESSAGE_TARGETS[row["id"]]
        tokenizer.src_lang = languages[source]
        source_tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(row["text"]))
        target_prefix = [[languages[target]]]
        for beam_size in (5, 3, 1):
            snapshot(f"beam_{beam_size}_before_message_{row['id']}")
            started = time.perf_counter()
            result = translator.translate_batch(
                [source_tokens],
                target_prefix=target_prefix,
                beam_size=beam_size,
                max_decoding_length=512,
            )[0]
            raw = tokenizer.decode(
                tokenizer.convert_tokens_to_ids(result.hypotheses[0][1:]),
                skip_special_tokens=True,
            ).strip()
            repaired = repair_logistics_translation(row["text"], raw, source, target)
            emit(
                "beam_benchmark",
                message_id=row["id"],
                source_lang=source,
                target_lang=target,
                beam_size=beam_size,
                compute_ms=round((time.perf_counter() - started) * 1000, 2),
                raw_text=raw,
                repaired_text=repaired,
                quality_ok=translation_quality_ok(row["text"], repaired, source, target),
                output_digest=safe_text_digest(repaired),
            )
            snapshot(f"beam_{beam_size}_after_message_{row['id']}")


def local_audio_path(photo_url: str | None) -> Path | None:
    value = str(photo_url or "")
    if value.startswith("/security/storage/"):
        return Path("/home/ubuntu/urtruck-qa2/storage") / value.removeprefix("/security/storage/")
    if value.startswith("/qa2/storage/"):
        return Path("/home/ubuntu/urtruck-qa2/storage") / value.removeprefix("/qa2/storage/")
    return None


def voice_measurement(row):
    if row is None:
        emit("voice", status="not_found")
        return
    path = local_audio_path(row["photo_url"])
    emit(
        "voice_source",
        message_id=row["id"],
        duration_sec=row["voice_duration"],
        transcript_present=bool(row["voice_transcript"]),
        storage_kind="local" if path else "remote_or_unresolved",
        file_present=bool(path and path.is_file()),
    )
    if not path or not path.is_file():
        return
    started = time.perf_counter()
    boundary = f"----qa2diagnostic{uuid.uuid4().hex}"
    audio = path.read_bytes()
    fields = [
        ("language", row["voice_transcript_lang"] or "ru", None),
        ("file", path.name, audio),
    ]
    body = bytearray()
    for name, value, content in fields:
        body.extend(f"--{boundary}\r\n".encode())
        if content is None:
            body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        else:
            body.extend(
                f'Content-Disposition: form-data; name="{name}"; filename="{value}"\r\n'
                "Content-Type: application/octet-stream\r\n\r\n".encode()
            )
            body.extend(content)
            body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        f"{AI_URL}/transcribe",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            status = response.status
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        status = exc.code
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"detail": type(exc).__name__}
    emit(
        "voice_transcription",
        message_id=row["id"],
        http=status,
        response_ms=round((time.perf_counter() - started) * 1000, 2),
        transcript_text=payload.get("transcript_text") if status < 400 else None,
        source_lang=payload.get("source_lang") if status < 400 else None,
        provider=payload.get("provider") if status < 400 else None,
        confidence=payload.get("confidence") if status < 400 else None,
        error=payload.get("detail") if status >= 400 else None,
    )


def main():
    snapshot("start")
    rows, latest_voice = load_rows()
    emit("database", path=str(DB_PATH), messages_found=[row["id"] for row in rows], latest_voice_id=latest_voice["id"] if latest_voice else None)
    for row in rows:
        if row["id"] in MESSAGE_TARGETS and row["text"]:
            endpoint_translate(row["id"], row["text"], MESSAGE_TARGETS[row["id"]])
    snapshot("after_endpoint_translation")
    beam_benchmark(rows)
    snapshot("after_beam_benchmark")
    voice_measurement(latest_voice)
    snapshot("finish")


if __name__ == "__main__":
    main()
