"""Explicit, conservative Deals FSM decision model."""
from dataclasses import dataclass


# This is a decision table only; it does not assert new business transitions.
EXISTING_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ("accepted", "in_progress"),
    ("in_progress", "at_border"),
    ("at_border", "delivered"),
    ("delivered", "received"),
    ("received", "completed"),
})


@dataclass(frozen=True)
class TransitionDecision:
    allowed: bool
    reason: str


def decide_transition(current: str, target: str) -> TransitionDecision:
    if current == target:
        return TransitionDecision(True, "idempotent")
    if (current, target) in EXISTING_TRANSITIONS:
        return TransitionDecision(True, "allowed")
    return TransitionDecision(False, "transition_not_allowed")
