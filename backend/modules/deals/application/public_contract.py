"""Public Deals application contract.

The first implementation is intentionally abstract. REST adapters must call
this boundary instead of importing Deals internals once DEALS_V2 is enabled.
"""
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class Actor:
    user_id: int
    role: str


@dataclass(frozen=True)
class CommandContext:
    operation_id: str
    correlation_id: str
    idempotency_key: str | None = None


class DealsApplication(Protocol):
    def create_deal_from_accepted_bid(self, bid_id: int, actor: Actor, context: CommandContext) -> Any: ...

    def transition_deal(self, deal_id: int, command: str, actor: Actor, context: CommandContext) -> Any: ...

    def cancel_deal(self, deal_id: int, actor: Actor, context: CommandContext) -> Any: ...

    def get_deal(self, deal_id: int, actor: Actor, context: CommandContext) -> Any: ...
