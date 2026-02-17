# exchange/rate_limiter.py

import time
from typing import List, Tuple


class RateLimiter:
    """
    Simple sliding-window rate limiter for exchange API requests.
    """

    def __init__(self, max_weight_per_min: int = 5000):
        # 5000, not 6000 — safety margin
        self.window: List[Tuple[float, int]] = []  # list of (timestamp, weight)
        self.max_weight: int = max_weight_per_min

    def can_request(self, weight: int = 1) -> bool:
        now = time.time()
        # Remove entries older than 60 seconds
        self.window = [(ts, w) for ts, w in self.window if ts >= now - 60]

        current_weight = sum(w for ts, w in self.window)
        return current_weight + weight <= self.max_weight

    def record(self, weight: int = 1):
        self.window.append((time.time(), weight))
