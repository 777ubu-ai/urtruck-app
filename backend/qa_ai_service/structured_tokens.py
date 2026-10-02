"""Protect opaque logistics identifiers while NLLB translates surrounding prose.

NLLB is allowed to translate words around a licence/document identifier, but it
must not rewrite the identifier itself.  A missing or changed placeholder is a
quality failure, never an opportunity to guess a replacement value.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable


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


def split_for_translation(text: str) -> tuple[tuple[bool, str], ...]:
    """Split text into ordinary prose and opaque identifiers.

    NLLB is not reliable at copying long synthetic ASCII markers: the
    QA2 EN→ZH smoke showed it dropping ``URTRUCKPROTECTEDTOKEN0X``.  Passing
    the original identifier to NLLB is not safe either, because it previously
    rewrote ``A123AA01``.  Callers therefore translate only the prose pieces
    and splice identifier pieces back byte-for-byte.

    The boolean is true only for an identifier recognised by ``_IDENTIFIER``.
    Empty prose pieces are deliberately retained so callers preserve the
    original token boundaries without guessing their position.
    """
    pieces: list[tuple[bool, str]] = []
    cursor = 0
    for match in _IDENTIFIER.finditer(text):
        pieces.append((False, text[cursor:match.start()]))
        pieces.append((True, match.group(0)))
        cursor = match.end()
    pieces.append((False, text[cursor:]))
    return tuple(pieces)


def translate_preserving_identifiers(text: str, translate_prose: Callable[[str], str]) -> str:
    """Translate prose only; splice recognised identifiers back unchanged."""
    return "".join(
        value if is_identifier else translate_prose(value)
        for is_identifier, value in split_for_translation(text)
    )


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
