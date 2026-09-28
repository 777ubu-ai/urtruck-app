from .normalizer import normalize_text, normalized_slot_key
from .schemas import MatchResult, TemplateRecord


class ExactMatcher:
    def __init__(self, records: list[TemplateRecord], version: str = "tm-v1") -> None:
        self.version = version
        self._records = [record for record in records if record.status == "approved"]
        self._index: dict[str, TemplateRecord] = {}
        for record in self._records:
            for language, text in record.translations.items():
                self._index[self.key(language, record.intent, text)] = record

    def key(self, language: str, intent: str, text: str, slots: dict[str, str] | None = None) -> str:
        return f"{self.version}|{language}|{intent}|{normalize_text(text)}|{normalized_slot_key(slots or {})}"

    def find(self, source_language: str, target_language: str, intent: str, text: str, slots: dict[str, str]) -> MatchResult | None:
        # Exact template records are intentionally sparse; candidate records are never indexed.
        record = self._index.get(self.key(source_language, intent, text, slots))
        if not record or target_language not in record.translations:
            return None
        return MatchResult(record=record, slots=slots, key=self.key(source_language, intent, text, slots))
