from collections import Counter
from dataclasses import dataclass, field
from time import monotonic


@dataclass
class Metrics:
    counters: Counter = field(default_factory=Counter)
    latencies_ms: list[float] = field(default_factory=list)

    def observe(self, outcome: str, started: float) -> None:
        self.counters[outcome] += 1
        self.latencies_ms.append((monotonic() - started) * 1000)

    def snapshot(self) -> dict:
        return {"counters": dict(self.counters), "latency_count": len(self.latencies_ms)}
