"""Private CPU inference service for the isolated UrTruck QA2 environment."""
import os
import re
import tempfile
import threading
from pathlib import Path

import ctranslate2
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field
from transformers import AutoTokenizer

try:
    from .quality import repair_logistics_translation, translation_quality_ok
except ImportError:  # uvicorn runs this file as top-level main.py in QA2
    from quality import repair_logistics_translation, translation_quality_ok

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_translate_slot = threading.BoundedSemaphore(1)
_speech_slots = threading.BoundedSemaphore(2)
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
STT_MIN_WORD_CONFIDENCE = float(os.getenv("QA2_STT_MIN_WORD_CONFIDENCE", "0.55"))
LOGISTICS_PROMPTS = {
    "ru": "Груз, склад, загрузка, разгрузка, водитель, машина, прицеп, таможня, граница, документы, маршрут, доставка. Алматы, Астана, Москва, Пекин, Хоргос, Достык.",
    "zh": "货物，仓库，装货，卸货，司机，车辆，挂车，海关，边境，文件，路线，交付。阿拉木图，阿斯塔纳，莫斯科，北京，霍尔果斯，多斯特克。",
    "kk": "Жүк, қойма, тиеу, түсіру, жүргізуші, көлік, тіркеме, кеден, шекара, құжаттар, бағыт, жеткізу. Алматы, Астана, Мәскеу, Бейжің, Қорғас, Достық.",
    "en": "Cargo, warehouse, loading, unloading, driver, truck, trailer, customs, border, documents, route, delivery. Almaty, Astana, Moscow, Beijing, Khorgos, Dostyk.",
}


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    source_lang: str | None = None
    target_lang: str


def _lang(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
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
        _whisper = WhisperModel(str(WHISPER_MODEL), device="cpu", compute_type="int8", cpu_threads=4, num_workers=2, local_files_only=True)
    return _whisper


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
        source_ids = tokenizer.encode(body.text.strip())
        source_tokens = tokenizer.convert_ids_to_tokens(source_ids)
        target_token = NLLB_LANGS[target]
        result = translator.translate_batch(
            [source_tokens],
            target_prefix=[[target_token]],
            beam_size=5,
            max_decoding_length=512,
        )[0]
        target_tokens = result.hypotheses[0][1:]
        translated = tokenizer.decode(
            tokenizer.convert_tokens_to_ids(target_tokens),
            skip_special_tokens=True,
        ).strip()
        translated = repair_logistics_translation(body.text, translated, source, target)
        if not translated:
            raise RuntimeError("empty translation")
        if not translation_quality_ok(body.text, translated, source, target):
            raise HTTPException(
                status_code=422,
                detail={"message": "translation confidence too low", "candidate": translated},
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
    data = file.file.read(32 * 1024 * 1024 + 1)
    if not data or len(data) > 32 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="invalid audio size")
    language_hint = _lang(language)
    if language_hint and language_hint not in SUPPORTED_LANGS:
        raise HTTPException(status_code=422, detail="unsupported language")
    if not _speech_slots.acquire(timeout=150):
        raise HTTPException(status_code=503, detail="busy")
    suffix = Path(file.filename or "voice.m4a").suffix[:10] or ".m4a"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="qa2-voice-", suffix=suffix, delete=False) as handle:
            handle.write(data)
            temp_path = handle.name
        segments_iter, info = _load_whisper().transcribe(
            temp_path,
            language=language_hint,
            initial_prompt=LOGISTICS_PROMPTS.get(language_hint or ""),
            beam_size=3,
            best_of=3,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 250},
            condition_on_previous_text=False,
            word_timestamps=True,
        )
        segments = list(segments_iter)
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        detected_language = _lang(info.language)
        source_language = language_hint or detected_language
        probabilities = [
            float(word.probability)
            for segment in segments
            for word in (segment.words or [])
            if word.probability is not None
        ]
        confidence = (
            sum(probabilities) / len(probabilities)
            if probabilities
            else float(getattr(info, "language_probability", 0.0) or 0.0)
        )
        if not transcript or not source_language:
            raise ValueError("empty transcript")
        if confidence < STT_MIN_WORD_CONFIDENCE:
            raise HTTPException(status_code=422, detail="transcription confidence too low")
        return {
            "transcript_text": transcript,
            "source_lang": source_language,
            "provider": "local_faster_whisper_large_v3_turbo",
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
