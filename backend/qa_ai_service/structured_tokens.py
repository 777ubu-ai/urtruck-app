"""Protect opaque logistics identifiers while NLLB translates surrounding prose.

NLLB is allowed to translate words around a licence/document identifier, but it
must not rewrite the identifier itself.  A missing or changed placeholder is a
quality failure, never an opportunity to guess a replacement value.
"""
from __future__ import annotations

from dataclasses import dataclass
import re


# Confirmed QA2 regression: ``A123AA01`` was returned as ``123A01``.  Each
# alternative is a known logistics identifier shape; intentionally do not add
# a generic alphanumeric-word pattern, which would mask ordinary chat text.
_IDENTIFIER = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"[A-Z]{4}\d{7}"                          # ISO 6346 container: MSCU1234567
    r"|[A-Z]{1,3}\s+\d{1,4}\s+[A-Z]{1,4}(?:\s+\d{1,2})?"  # KZ 777 ABC 02
    r"|[A-Z]\d{3}[A-Z]{2}\d{2}"              # A123AA01
    r"|(?:20|40)(?:GP|HC)"                     # container type
    r"|[A-Z]{2,8}-\d{2,8}(?:-\d{1,8})*"       # CMR-2026-001
    r")(?![A-Za-z0-9])",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ProtectedTokens:
    text: str
    replacements: tuple[tuple[str, str], ...]


def protect(text: str) -> ProtectedTokens:
    """Replace each opaque identifier with a deterministic ASCII placeholder."""
    replacements: list[tuple[str, str]] = []

    def replace(match: re.Match[str]) -> str:
        placeholder = f"URTRUCKPROTECTEDTOKEN{len(replacements)}X"
        replacements.append((placeholder, match.group(0)))
        return placeholder

    return ProtectedTokens(_IDENTIFIER.sub(replace, text), tuple(replacements))


def restore(translated: str, protected: ProtectedTokens) -> str | None:
    """Restore original identifiers, or fail closed if NLLB changed a marker."""
    restored = translated
    for placeholder, original in protected.replacements:
        # A marker must occur exactly once.  Zero means NLLB altered/dropped
        # it; more than one would duplicate a private identifier.
        if restored.count(placeholder) != 1:
            return None
        restored = restored.replace(placeholder, original, 1)
    return restored
