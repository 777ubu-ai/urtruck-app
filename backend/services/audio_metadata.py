"""Безопасное извлечение длительности загруженного аудио.

Длительность, показанная recorder UI, — лишь локальная оценка. Для
сохранённого chat message источником истины служит уже загруженный аудиофайл.
Ни storage ref, ни signed URL, ни вывод ffprobe здесь не логируются.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from services import storage_service as storage


def duration_seconds_from_ref(audio_ref: str) -> Optional[int]:
    """Return rounded duration from the stored file, or ``None`` safely.

    A missing/unsupported metadata parser must never replace an actual audio
    duration with a client-provided timer. The caller can show an unknown
    duration until native playback reports it.
    """
    suffix = Path(str(audio_ref or "voice.m4a")).suffix or ".m4a"
    try:
        with storage.materialize_for_processing(audio_ref, suffix=suffix) as path:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(path),
                ],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
        if result.returncode != 0:
            return None
        value = float((result.stdout or "").strip())
        if value < 0 or value > 24 * 60 * 60:
            return None
        return max(0, int(round(value)))
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
