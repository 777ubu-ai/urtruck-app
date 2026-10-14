import re

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
            record = None
        if record:
            return MatchResult(record=record, slots=slots, key=self.key(source_language, intent, text, slots))

        # Slot templates use an anchored pattern, never fuzzy similarity. The
        # captured value is only accepted when the complete normalized source
        # string matches the record's language template.
        normalized = normalize_text(text)
        for candidate in self._records:
            if candidate.intent != intent or target_language not in candidate.translations:
                continue
            template = candidate.translations.get(source_language)
            if not template or "{" not in template:
                continue
            pieces = re.split(r"(\{[a-z][a-z0-9_]*\})", normalize_text(template))
            pattern = []
            names: list[str] = []
            for piece in pieces:
                match = re.fullmatch(r"\{([a-z][a-z0-9_]*)\}", piece)
                if match:
                    name = match.group(1)
                    names.append(name)
                    pattern.append(r"(?P<" + name + r">.+?)")
                else:
                    pattern.append(re.escape(piece))
            found = re.fullmatch("".join(pattern), normalized)
            if not found:
                continue
            captured = dict(slots)
            captured.update({name: value.strip() for name, value in found.groupdict().items()})
            specs = {slot.name: slot.type for slot in candidate.slots}
            valid_capture = True
            for name, value in found.groupdict().items():
                slot_type = specs.get(name, name)
                if slot_type in {"weight", "amount", "volume", "percentage"} and not re.fullmatch(r"\d+(?:[.,]\d+)?", value.strip()):
                    valid_capture = False
                if slot_type.endswith("_unit") and not re.fullmatch(r"[^\s,.!?]+", value.strip()):
                    valid_capture = False
                if slot_type == "time" and not re.fullmatch(r"(?:[01]?\d|2[0-3]):[0-5]\d", value.strip()):
                    valid_capture = False
            if not valid_capture:
                continue
            return MatchResult(candidate, captured, self.key(source_language, intent, normalized, captured))
        return None
