"""Idempotency contract shared by critical mutation adapters."""
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class IdempotencyRequest:
    key: str
    operation: str
    payload_fingerprint: str


@dataclass(frozen=True)
class StoredResult:
    operation: str
    payload_fingerprint: str
    result: Any


class IdempotencyStore(Protocol):
    def get(self, request: IdempotencyRequest) -> StoredResult | None: ...
    def reserve(self, request: IdempotencyRequest) -> StoredResult | None: ...
    def complete(self, request: IdempotencyRequest, result: Any) -> None: ...


class IdempotencyConflict(Exception):
    """Same key was reused for a different operation or payload."""
