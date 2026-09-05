"""Public Translation contract placeholder for the modular boundary."""
from typing import Protocol


class TranslationApplication(Protocol):
    def translate(self, text: str, source_language: str | None, target_language: str) -> str: ...
