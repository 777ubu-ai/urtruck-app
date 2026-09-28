import os
import json
from pathlib import Path
from time import monotonic

from .entity_extractor import extract_slots
from .matcher import ExactMatcher
from .metrics import Metrics
from .renderer import render
from .schemas import SlotSpec, TemplateRecord, TranslationMemoryResult
from .validators import validate_facts


class TranslationMemory:
    """Opt-in exact TM. Candidate data is never eligible for user responses."""

    def __init__(self, records: list[TemplateRecord] | None = None, version: str = "tm-v1") -> None:
        self.matcher = ExactMatcher(records or [], version)
        self.metrics = Metrics()
        self.enabled = os.getenv("TRANSLATION_MEMORY_ENABLED", "false").casefold() == "true"
        self.shadow_mode = os.getenv("TRANSLATION_MEMORY_SHADOW_MODE", "true").casefold() == "true"

    @classmethod
    def from_jsonl(cls, directory: str | os.PathLike[str], version: str = "tm-v1") -> "TranslationMemory":
        records: list[TemplateRecord] = []
        for path in sorted(Path(directory).glob("*.jsonl")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                raw = json.loads(line)
                if "template_id" not in raw:
                    continue
                records.append(TemplateRecord(
                    template_id=raw["template_id"], category=raw.get("category", ""),
                    version=int(raw.get("version", 1)), status=raw["status"],
                    intent=raw["intent"],
                    slots=tuple(SlotSpec(**slot) for slot in raw.get("slots", [])),
                    translations=dict(raw.get("translations", {})),
                    constraints=dict(raw.get("constraints", {})), review=dict(raw.get("review", {})),
                ))
        return cls(records, version)

    def translate(self, text: str, source_language: str, target_language: str, intent: str) -> TranslationMemoryResult:
        started = monotonic()
        slots = extract_slots(text, source_language)
        match = self.matcher.find(source_language, target_language, intent, text, slots)
        if not match:
            self.metrics.observe("tm_miss", started)
            return TranslationMemoryResult(None, False, False, "no_exact_match")
        target_template = match.record.translations.get(target_language)
        output = render(target_template or "", slots)
        if not output:
            self.metrics.observe("validation_fail", started)
            return TranslationMemoryResult(None, True, False, "render_failed", match.record.template_id)
        valid, reasons = validate_facts(text, output, source_language, target_language)
        if not valid:
            self.metrics.observe("validation_fail", started)
            return TranslationMemoryResult(None, True, False, ",".join(reasons), match.record.template_id)
        self.metrics.observe("tm_hit", started)
        if not self.enabled:
            return TranslationMemoryResult(None, True, True, "disabled_shadow", match.record.template_id)
        return TranslationMemoryResult(output, True, True, None, match.record.template_id, False)
