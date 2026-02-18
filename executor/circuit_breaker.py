# executor/recovery.py

from dataclasses import dataclass
import logging
import time
from typing import Optional


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 3
    window_seconds: float = 300
    cooldown_seconds: float = 600


class CircuitBreaker:
    def __init__(self, config: CircuitBreakerConfig = None):
        self.config = config or CircuitBreakerConfig()
        self.failures: list[float] = []
        self.tripped_at: Optional[float] = None

    def record_failure(self):
        now = time.time()
        self.failures.append(now)
        cutoff = now - self.config.window_seconds
        self.failures = [t for t in self.failures if t > cutoff]

        if len(self.failures) >= self.config.failure_threshold:
            self.trip()

    def record_success(self):
        self.trippedAt = None
        self.failures = []

    def trip(self):
        self.tripped_at = time.time()
        logging.critical(f"CIRCUIT BREAKER TRIPPED")

    def is_open(self) -> bool:
        if self.tripped_at is None:
            return False
        if time.time() - self.tripped_at > self.config.cooldown_seconds:
            self.tripped_at = None
            self.failures = []
            return False
        return True

    def time_until_reset(self) -> float:
        if self.tripped_at is None:
            return 0
        return max(0, self.config.cooldown_seconds - (time.time() - self.tripped_at))
