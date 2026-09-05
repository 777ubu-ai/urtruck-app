"""Transactional accept-bid use-case boundary."""
from dataclasses import dataclass
from typing import Protocol

from .public_contract import Actor, CommandContext


@dataclass(frozen=True)
class AcceptBidResult:
    bid_id: int
    deal_id: int
    created: bool


class AcceptBidTransaction(Protocol):
    def accept_bid(self, bid_id: int, actor: Actor, context: CommandContext) -> AcceptBidResult:
        """Perform bid/deal/reservation/event/outbox writes in one transaction."""
        ...


class AcceptBidUseCase:
    """Dependency-injected boundary; no legacy database access is performed here."""

    def __init__(self, transaction: AcceptBidTransaction) -> None:
        self._transaction = transaction

    def execute(self, bid_id: int, actor: Actor, context: CommandContext) -> AcceptBidResult:
        return self._transaction.accept_bid(bid_id, actor, context)
