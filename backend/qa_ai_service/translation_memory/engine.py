import os
from time import monotonic

from .entity_extractor import extract_slots
from .matcher import ExactMatcher
from .metrics import Metrics
from .renderer import render
from .schemas import TemplateRecord, TranslationMemoryResult
from .validators import validate_facts


class TranslationMemory:
    """Opt-in exact TM. Candidate data is never eligible for user responses."""

    def __init__(self, records: list[TemplateRecord] | None = None, version: str = "tm-v1") -> None:
        self.matcher = ExactMatcher(records or [], version)
        self.metrics = Metrics()
        self.enabled = os.getenv("TRANSLATION_MEMORY_ENABLED", "false").casefold() == "true"
        self.shadow_mode = os.getenv("TRANSLATION_MEMORY_SHADOW_MODE", "true").casefold() == "true"

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
