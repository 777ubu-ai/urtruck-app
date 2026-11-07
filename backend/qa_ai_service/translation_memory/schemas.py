from dataclasses import dataclass, field
from typing import Any

STATUSES = {"candidate", "approved", "rejected", "deprecated"}


@dataclass(frozen=True)
class SlotSpec:
    name: str
    type: str
    required: bool = True


@dataclass(frozen=True)
class TemplateRecord:
    template_id: str
    category: str
    version: int
    status: str
    intent: str
    slots: tuple[SlotSpec, ...]
    translations: dict[str, str]
    constraints: dict[str, Any] = field(default_factory=dict)
    review: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ValueError(f"unknown template status: {self.status}")


@dataclass(frozen=True)
class MatchResult:
    record: TemplateRecord
    slots: dict[str, str]
    key: str


@dataclass(frozen=True)
class TranslationMemoryResult:
    text: str | None
    hit: bool
    validation_passed: bool
    reason: str | None = None
    template_id: str | None = None
    fallback_required: bool = True

