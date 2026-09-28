"""Локальный STT: только заранее установленные модели, без внешних API."""
import os
import threading
from pathlib import Path

_slot = threading.BoundedSemaphore(1)
_model = None
_model_path = None


class LocalSpeechError(RuntimeError):
    def __init__(self, code="TRANSCRIPTION_UNAVAILABLE", retryable=False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def _load_model():
    global _model, _model_path
    path = Path(os.getenv("LOCAL_WHISPER_MODEL_PATH", "")).expanduser()
    if not path.is_absolute() or not (path / "model.bin").is_file():
        raise LocalSpeechError()
    resolved = str(path.resolve())
    if _model is None or _model_path != resolved:
        from faster_whisper import WhisperModel
        # Один вызов на процесс; максимум два CPU-потока. Модель не скачивается
        # во время пользовательского запроса. Подсказка языка UI не передаётся.
        _model = WhisperModel(resolved, device="cpu", compute_type="int8",
                              cpu_threads=2, num_workers=1, local_files_only=True)
        _model_path = resolved
    return _model


def transcribe(path):
    if not _slot.acquire(blocking=False):
        raise LocalSpeechError("TRANSCRIPTION_TIMEOUT", retryable=True)
    try:
        segments, info = _load_model().transcribe(path, beam_size=5, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        language = str(info.language or "").strip()
        if not text or not language:
            raise LocalSpeechError("TRANSCRIPTION_FAILED")
        return {"transcript_text": text, "provider": "local_whisper",
                "source_lang": language, "usage": None}
    except LocalSpeechError:
        raise
    except (ImportError, OSError):
        raise LocalSpeechError() from None
    except Exception:
        # Ни содержимое аудио, ни пути моделей не попадают в публичную ошибку.
        raise LocalSpeechError("TRANSCRIPTION_FAILED") from None
    finally:
        _slot.release()
