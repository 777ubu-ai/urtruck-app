"""Synthetic RU/ZH OpenAI STT pilot; never reads chats, QA2 DB or user audio."""
import hashlib
import json
import os
import statistics
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import wave
from pathlib import Path

MODEL = "gpt-4o-mini-transcribe"
CASES = {
    "ru": ("Груз готов. Десять тонн. Нужен тент.", ("груз", "тонн", "тент")),
    "zh": ("货物准备好了。十吨。需要篷布车。", ("货", "吨", "篷布")),
}
DURATIONS = (10, 15, 20)


def synthesize(language, phrase, target, path):
    repetitions = 1
    while True:
        subprocess.run(
            ["espeak-ng", "-v", language, "-s", "145", "-w", str(path), " ".join([phrase] * repetitions)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        with wave.open(str(path)) as wav:
            seconds = wav.getnframes() / wav.getframerate()
        if seconds >= target - 1 or repetitions >= 15:
            return round(seconds, 2)
        repetitions += 1

def transcribe(path, language, key):
    boundary = uuid.uuid4().hex
    def field(name, value):
        return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").encode()
    body = field("model", MODEL) + field("language", language) + field("response_format", "json")
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fixture.wav\"\r\n"
             "Content-Type: audio/wav\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions", data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    start = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=70) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"OpenAI STT HTTP {exc.code}; response suppressed") from None
    return str(result.get("text") or "").strip(), round(time.monotonic() - start, 2)


def main():
    key = os.environ.get("QA2_OPENAI_API_KEY", "")
    if not key:
        raise SystemExit("QA2_OPENAI_STT_KEY_MISSING")
    failures = []
    latencies = {language: [] for language in CASES}
    total_audio_seconds = 0
    with tempfile.TemporaryDirectory(prefix="urtruck-stt-synthetic-") as directory:
        for language, (phrase, required) in CASES.items():
            for target in DURATIONS:
                path = Path(directory) / f"{language}-{target}.wav"
                seconds = synthesize(language, phrase, target, path)
                transcript, elapsed = transcribe(path, language, key)
                normalized = transcript.lower()
                missing = [word for word in required if word not in normalized]
                numeric = ("10", "десять") if language == "ru" else ("十", "10")
                if not any(token in normalized for token in numeric):
                    missing.append("ten_tonnes")
                latencies[language].append(elapsed)
                total_audio_seconds += seconds
                row = {"language": language, "target_seconds": target, "audio_seconds": seconds,
                       "api_seconds": elapsed, "model": MODEL, "transcript": transcript,
                       "missing_facts": missing, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                print(json.dumps(row, ensure_ascii=False), flush=True)
                if missing or not transcript:
                    failures.append((language, target))
    for language, values in latencies.items():
        ordered = sorted(values)
        print(json.dumps({"language": language, "p50_seconds": statistics.median(ordered),
                          "p95_seconds": ordered[-1], "synthetic_audio_total_seconds": round(total_audio_seconds, 2)},
                         ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(f"SYNTHETIC_STT_FACTS_FAILED: {failures}")
    print("SYNTHETIC_STT_FACTS=pass; PHYSICAL_QA2=not_tested", flush=True)


if __name__ == "__main__":
    main()
