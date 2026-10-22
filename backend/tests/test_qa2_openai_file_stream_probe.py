"""Pure unit contracts for the completed-file streaming experiment."""
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("qa2_openai_file_stream_probe", ROOT / "scripts/qa2_openai_file_stream_probe.py")
probe = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(probe)


class _Response:
    def __init__(self, lines):
        self._lines = lines

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self):
        return iter(self._lines)


class _Client:
    def __init__(self, lines):
        self.lines = lines
        self.calls = []

    def stream(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return _Response(self.lines)


def test_completed_file_stream_records_only_safe_event_metrics(tmp_path):
    audio = tmp_path / "controlled.wav"
    audio.write_bytes(b"controlled")
    private_delta = "do not export transcript content"
    lines = [
        f"data: {json.dumps({'type': 'transcript.text.delta', 'delta': private_delta})}",
        f"data: {json.dumps({'type': 'transcript.text.done', 'text': private_delta, 'languages': [{'code': 'ru'}]})}",
    ]
    ticks = iter((100.0, 100.25, 100.75))
    client = _Client(lines)
    result = probe.run_probe(audio, "test-key", timeout_seconds=8, client=client, clock=lambda: next(ticks))
    assert result == {
        "provider": "openai", "model": "gpt-4o-mini-transcribe", "mode": "completed_file_stream",
        "audio_bytes": 10, "request_to_first_delta_ms": 250, "request_to_complete_ms": 750,
        "delta_count": 1, "detected_language": "ru", "outcome": "success",
    }
    _args, kwargs = client.calls[0]
    assert kwargs["data"] == {"model": "gpt-4o-mini-transcribe", "stream": "true"}
    assert private_delta not in repr(result)


def test_changed_or_missing_final_event_is_not_reported_as_success(tmp_path):
    audio = tmp_path / "controlled.wav"
    audio.write_bytes(b"test")
    try:
        probe.run_probe(audio, "test-key", timeout_seconds=8, client=_Client(["data: {bad json"]), clock=lambda: 0)
        assert False
    except probe.StreamProbeError as error:
        assert str(error) == "malformed_stream_event"
    try:
        probe.run_probe(audio, "test-key", timeout_seconds=8, client=_Client([]), clock=lambda: 0)
        assert False
    except probe.StreamProbeError as error:
        assert str(error) == "missing_final_event"


def test_probe_requires_bounded_timeout_and_exact_model(tmp_path):
    audio = tmp_path / "controlled.wav"
    audio.write_bytes(b"test")
    try:
        probe.run_probe(audio, "test-key", timeout_seconds=11, client=_Client([]), clock=lambda: 0)
        assert False
    except ValueError:
        pass
    assert probe.MODEL == "gpt-4o-mini-transcribe"
