from __future__ import annotations
from typing import Any
import json
from eth_hash.auto import keccak


class CanonicalSerializer:
    """
    Produces deterministic JSON for signing.

    Rules:
    - Keys sorted alphabetically (recursive)
    - No whitespace
    - Numbers as-is (but prefer string amounts in trading data)
    - Consistent unicode handling
    """

    @staticmethod
    def _sort_object(value: Any) -> Any:
        if isinstance(value, list):
            return [CanonicalSerializer._sort_object(v) for v in value]

        if isinstance(value, dict):
            return {
                k: CanonicalSerializer._sort_object(value[k])
                for k in sorted(value.keys())
            }

        return value

    @staticmethod
    def serialize(obj: Any) -> bytes:
        """Returns canonical bytes representation."""
        sorted_obj = CanonicalSerializer._sort_object(obj)

        json_str = json.dumps(
            sorted_obj,
            ensure_ascii=False,  # unicode stable
            separators=(",", ":"),  # remove whitespace
        )

        return json_str.encode("utf-8")

    @staticmethod
    def hash(obj: Any) -> bytes:
        """Returns keccak256 of canonical serialization."""
        serialized = CanonicalSerializer.serialize(obj)
        return keccak(serialized)

    @staticmethod
    def verify_determinism(obj: Any, iterations: int = 100) -> bool:
        """Verifies serialization is deterministic over N iterations."""
        first = CanonicalSerializer.hash(obj)

        for _ in range(iterations - 1):
            if CanonicalSerializer.hash(obj) != first:
                return False

        return True
