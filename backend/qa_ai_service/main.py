"""Private CPU inference service for the isolated UrTruck QA2 environment."""
import math
import os
import re
import tempfile
import threading
import time
from pathlib import Path

import ctranslate2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field
from transformers import AutoTokenizer

try:
    from .quality import repair_logistics_translation, stt_prompt, transcription_quality_ok, translation_quality_failures, translation_quality_ok
    from .structured_tokens import split_for_translation
    from .translation_decoding import TRANSLATE_BEAM_SIZE, translation_max_decoding_length
except ImportError:  # uvicorn runs this file as top-level main.py in QA2
    from quality import repair_logistics_translation, stt_prompt, transcription_quality_ok, translation_quality_failures, translation_quality_ok
    from structured_tokens import split_for_translation
    from translation_decoding import TRANSLATE_BEAM_SIZE, translation_max_decoding_length

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_translate_slot = threading.BoundedSemaphore(1)
_speech_slots = threading.BoundedSemaphore(1)
_translator = None
_tokenizer = None
_whisper = None

MODEL_ROOT = Path(os.getenv("QA2_AI_MODEL_ROOT", "/home/ubuntu/urtruck-qa2-ai/models"))
TRANSLATE_MODEL = MODEL_ROOT / "nllb-200-distilled-1.3b-int8"
TOKENIZER_MODEL = MODEL_ROOT / "nllb-200-distilled-1.3b-tokenizer"
WHISPER_MODEL = MODEL_ROOT / "faster-whisper-large-v3-turbo"
SUPPORTED_LANGS = {"ru", "zh", "kk", "en"}
LANG_ALIASES = {"cn": "zh", "zh-cn": "zh", "zh-hans": "zh", "kz": "kk", "kk-kz": "kk"}
NLLB_LANGS = {"ru": "rus_Cyrl", "zh": "zho_Hans", "kk": "kaz_Cyrl", "en": "eng_Latn"}
KAZAKH_MARKERS = set("әғқңөұүһіӘҒҚҢӨҰҮҺІ")
STT_MIN_WORD_CONFIDENCE = float(os.getenv("QA2_STT_MIN_WORD_CONFIDENCE", "0.50"))
SOURCE_SHA = os.getenv("QA2_AI_SOURCE_SHA", "UNKNOWN").strip() or "UNKNOWN"
# NLLB on the four-CPU QA2 host was configured with an unnecessarily costly
# five-way beam and a fixed 512-token output ceiling.  Short chat messages then
# spent tens of seconds decoding even when their valid translation is only a
# few tokens.  Keep a conservative two-way beam and size the ceiling from the
# source length; the semantic quality gate below remains mandatory.
class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    source_lang: str | None = None
    target_lang: str


def _lang(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if raw in {"", "auto", "null", "none"}:
        return None
    return LANG_ALIASES.get(raw, LANG_ALIASES.get(raw.split("-", 1)[0], raw.split("-", 1)[0]))


def _detect_lang(text: str) -> str:
    if re.search(r"[\u3400-\u9fff]", text):
        return "zh"
    if any(ch in KAZAKH_MARKERS for ch in text):
        return "kk"
    if re.search(r"[\u0400-\u04ff]", text):
        return "ru"
    return "en"


def _load_translation():
    global _translator, _tokenizer
    if _translator is None:
        if not (TRANSLATE_MODEL / "model.bin").is_file():
            raise RuntimeError("translation model missing")
        _translator = ctranslate2.Translator(str(TRANSLATE_MODEL), device="cpu", compute_type="int8", inter_threads=1, intra_threads=4)
        _tokenizer = AutoTokenizer.from_pretrained(str(TOKENIZER_MODEL), local_files_only=True)
    return _translator, _tokenizer


def _load_whisper():
    global _whisper
    if _whisper is None:
        if not (WHISPER_MODEL / "model.bin").is_file():
            raise RuntimeError("speech model missing")
        _whisper = WhisperModel(str(WHISPER_MODEL), device="cpu", compute_type="int8", cpu_threads=4, num_workers=1, local_files_only=True)
    return _whisper


def _translate_prose_piece(text: str, *, source: str, target: str, translator, tokenizer) -> str:
    """Translate one non-identifier prose piece with the loaded NLLB model."""
    if not text.strip():
        return text
    source_ids = tokenizer.encode(text.strip())
    source_tokens = tokenizer.convert_ids_to_tokens(source_ids)
    target_token = NLLB_LANGS[target]
    result = translator.translate_batch(
        [source_tokens],
        target_prefix=[[target_token]],
        beam_size=TRANSLATE_BEAM_SIZE,
        max_decoding_length=translation_max_decoding_length(len(source_tokens)),
    )[0]
    target_tokens = result.hypotheses[0][1:]
    return tokenizer.decode(
        tokenizer.convert_tokens_to_ids(target_tokens),
        skip_special_tokens=True,
    ).strip()


@app.on_event("startup")
def preload_models():
    _load_translation()
    _load_whisper()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "private": True,
        "translation_model": (TRANSLATE_MODEL / "model.bin").is_file(),
        "speech_model": (WHISPER_MODEL / "model.bin").is_file(),
        "languages": sorted(SUPPORTED_LANGS),
        "source_sha": SOURCE_SHA,
    }


@app.post("/translate")
def translate(body: TranslateRequest):
    source = _lang(body.source_lang) or _detect_lang(body.text)
    target = _lang(body.target_lang)
    if source not in SUPPORTED_LANGS or target not in SUPPORTED_LANGS:
        raise HTTPException(status_code=422, detail="unsupported language")
    if source == target:
        raise HTTPException(status_code=422, detail="same language")
    if not _translate_slot.acquire(timeout=75):
        raise HTTPException(status_code=503, detail="busy")
    try:
        translator, tokenizer = _load_translation()
        tokenizer.src_lang = NLLB_LANGS[source]
        # Opaque values are never given to NLLB.  This avoids both the old
        # plate-corruption bug and the newly observed marker-drop failure;
        # identifiers are copied only by this deterministic local operation.
        translated = "".join(
            value if is_identifier else _translate_prose_piece(
                value, source=source, target=target, translator=translator, tokenizer=tokenizer
            )
            for is_identifier, value in split_for_translation(body.text)
        ).strip()
        translated = repair_logistics_translation(body.text, translated, source, target)
        if not translated:
            raise RuntimeError("empty translation")
        gate_failures = translation_quality_failures(body.text, translated, source, target)
        if gate_failures:
            raise HTTPException(
                status_code=422,
                # The candidate may contain private chat/voice text. Return
                # only stable machine-readable quality reasons across the
                # loopback boundary; callers can safely expose these codes.
                detail={"message": "translation confidence too low", "reason_codes": gate_failures},
            )
        return {
            "translated_text": translated,
            "source_lang": source,
            "target_lang": target,
            "provider": "local_nllb_1_3b",
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[qa2-ai] translation failed: {type(exc).__name__}", flush=True)
        raise HTTPException(status_code=500, detail="translation failed") from exc
    finally:
        _translate_slot.release()


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), language: str | None = Form(default=None)):
    # A synchronous endpoint runs in FastAPI's worker pool, allowing the two
    # bounded CTranslate2 workers to serve the two QA phones concurrently.
    request_started = time.perf_counter()
    read_started = time.perf_counter()
    data = file.file.read(32 * 1024 * 1024 + 1)
    file_read_ms = (time.perf_counter() - read_started) * 1000
    if not data or len(data) > 32 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="invalid audio size")
    language_hint = _lang(language)
    if language_hint and language_hint not in SUPPORTED_LANGS:
        raise HTTPException(status_code=422, detail="unsupported language")
    slot_started = time.perf_counter()
    if not _speech_slots.acquire(timeout=150):
        raise HTTPException(status_code=503, detail="busy")
    slot_wait_ms = (time.perf_counter() - slot_started) * 1000
    suffix = Path(file.filename or "voice.m4a").suffix[:10] or ".m4a"
    temp_path = None
    try:
        write_started = time.perf_counter()
        with tempfile.NamedTemporaryFile(prefix="qa2-voice-", suffix=suffix, delete=False) as handle:
            handle.write(data)
            temp_path = handle.name
        file_write_ms = (time.perf_counter() - write_started) * 1000
        whisper_started = time.perf_counter()
        segments_iter, info = _load_whisper().transcribe(
            temp_path,
            language=language_hint,
            initial_prompt=stt_prompt(language_hint or ""),
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 250},
            condition_on_previous_text=False,
            word_timestamps=False,
        )
        segments = list(segments_iter)
        whisper_ms = (time.perf_counter() - whisper_started) * 1000
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        detected_language = _lang(info.language)
        source_language = language_hint or detected_language
        segment_confidences = [
            math.exp(min(0.0, float(segment.avg_logprob)))
            for segment in segments
            if segment.avg_logprob is not None
        ]
        confidence = (
            sum(segment_confidences) / len(segment_confidences)
            if segment_confidences
            else float(getattr(info, "language_probability", 0.0) or 0.0)
        )
        if not transcript or not source_language:
            raise ValueError("empty transcript")
        quality_started = time.perf_counter()
        quality_ok = transcription_quality_ok(
            transcript,
            source_language,
            confidence,
            minimum_confidence=STT_MIN_WORD_CONFIDENCE,
        )
        quality_ms = (time.perf_counter() - quality_started) * 1000
        if not quality_ok:
            cyrillic = len(re.findall(r"[\u0400-\u04ff]", transcript))
            han = len(re.findall(r"[\u3400-\u9fff]", transcript))
            if confidence < STT_MIN_WORD_CONFIDENCE:
                reason = "low_confidence"
            elif source_language in {"ru", "kk"} and cyrillic == 0:
                reason = "source_script_missing"
            elif source_language in {"ru", "kk"} and han / max(cyrillic + han, 1) > 0.25:
                reason = "unexpected_han_ratio"
            elif source_language == "zh" and han / max(cyrillic + han + len(re.findall(r"[A-Za-z]", transcript)), 1) < 0.50:
                reason = "unexpected_non_han_ratio"
            else:
                reason = "quality_gate"
            print(
                "[qa2-ai] transcription rejected "
                f"reason={reason} bytes={len(data)} segments={len(segments)} "
                f"confidence={confidence:.4f} file_read_ms={file_read_ms:.2f} "
                f"slot_wait_ms={slot_wait_ms:.2f} file_write_ms={file_write_ms:.2f} "
                f"whisper_ms={whisper_ms:.2f} quality_ms={quality_ms:.2f} "
                f"total_ms={(time.perf_counter() - request_started) * 1000:.2f}",
                flush=True,
            )
            raise HTTPException(
                status_code=422,
                detail={"message": "transcription quality too low", "reason": reason},
            )
        print(
            "[qa2-ai] transcription accepted "
            f"bytes={len(data)} segments={len(segments)} confidence={confidence:.4f} "
            f"file_read_ms={file_read_ms:.2f} slot_wait_ms={slot_wait_ms:.2f} "
            f"file_write_ms={file_write_ms:.2f} whisper_ms={whisper_ms:.2f} "
            f"quality_ms={quality_ms:.2f} total_ms={(time.perf_counter() - request_started) * 1000:.2f}",
            flush=True,
        )
        return {
            "transcript_text": transcript,
            "source_lang": source_language,
            "provider": "local_faster_whisper_large_v3_turbo",
            "model": WHISPER_MODEL.name,
            "confidence": round(confidence, 4),
        }
    except HTTPException:
        raise
    except ValueError as exc:
        print("[qa2-ai] transcription rejected: no speech detected", flush=True)
        raise HTTPException(status_code=422, detail="no speech detected") from exc
    except RuntimeError as exc:
        print("[qa2-ai] transcription failed: audio decode or inference runtime", flush=True)
        raise HTTPException(status_code=422, detail="audio could not be decoded") from exc
    except Exception as exc:
        print(f"[qa2-ai] transcription failed: {type(exc).__name__}", flush=True)
        raise HTTPException(status_code=500, detail="transcription failed") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        _speech_slots.release()
