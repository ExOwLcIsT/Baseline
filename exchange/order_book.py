# exchange/order_book.py

from decimal import Decimal
from typing import List, Tuple


class OrderBook:
    """
    Normalized order book representation.
    """

    def __init__(
        self,
        symbol: str,
        timestamp: int,
        bids: List[Tuple[Decimal, Decimal]],
        asks: List[Tuple[Decimal, Decimal]],
    ):
        self.symbol = symbol
        self.timestamp = timestamp

        # Convert all entries to Decimal and sort
        self.bids: List[Tuple[Decimal, Decimal]] = sorted(
            [(Decimal(str(price)), Decimal(str(qty))) for price, qty in bids],
            key=lambda x: x[0],
            reverse=True,
        )
        self.asks: List[Tuple[Decimal, Decimal]] = sorted(
            [(Decimal(str(price)), Decimal(str(qty))) for price, qty in asks],
            key=lambda x: x[0],
        )

        # Best bid / ask
        self.best_bid: Tuple[Decimal, Decimal] = (
            self.bids[0] if self.bids else (Decimal(0), Decimal(0))
        )
        self.best_ask: Tuple[Decimal, Decimal] = (
            self.asks[0] if self.asks else (Decimal(0), Decimal(0))
        )

        # Mid price and spread
        self.mid_price: Decimal = (
            (self.best_bid[0] + self.best_ask[0]) / Decimal(2)
            if self.best_bid[0] and self.best_ask[0]
            else Decimal(0)
        )
        self.spread: Decimal = (
            (self.best_ask[0] - self.best_bid[0]).quantize(Decimal("0.01"))
            if self.best_bid[0] and self.best_ask[0]
            else Decimal(0)
        )
        self.spread_bps: Decimal = (
            (self.spread / self.mid_price * Decimal(10_000)).quantize(Decimal("0.01"))
            if self.mid_price != 0
            else Decimal(0)
        )
