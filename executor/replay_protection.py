import time
from strategy.signal import Signal


class ReplayProtection:
    def __init__(self, ttl_seconds: float = 60):
        self.executed: dict[str, float] = {}
        self.ttl = ttl_seconds

    def is_duplicate(self, signal: Signal) -> bool:
        self._cleanup()
        return signal.signal_id in self.executed

    def mark_executed(self, signal: Signal):
        self.executed[signal.signal_id] = time.time()

    def _cleanup(self):
        cutoff = time.time() - self.ttl
        self.executed = {k: v for k, v in self.executed.items() if v > cutoff}
