# exchange/orderbook.py

from decimal import Decimal
from exchange.order_book import OrderBook


class OrderBookAnalyzer:
    """Analyze order book snapshots for trading decisions."""

    def __init__(self, order_book: OrderBook):
        self.order_book = order_book

    def walk_the_book(self, side: str, qty: Decimal) -> dict:
        """
        Simulate filling `qty` against the order book.
        side: "buy" (walks asks) or "sell" (walks bids)

        Returns:
        {
            'avg_price':       Decimal,
            'total_cost':      Decimal,  # in quote currency
            'slippage_bps':    Decimal,  # vs best price
            'levels_consumed': int,
            'fully_filled':    bool,
            'fills': [{'price': Decimal, 'qty': Decimal, 'cost': Decimal}, ...]
        }
        If insufficient liquidity, fully_filled=False and fills show what IS available.
        """
        road = self.order_book.asks if side == "buy" else self.order_book.bids
        best_order = (
            self.order_book.best_ask if side == "buy" else self.order_book.best_bid
        )

        levels = 0
        total_cost = Decimal(0)
        qty_left = qty
        fills = []

        for level in road:
            if qty_left <= 0:
                break
            order_price = level[0]
            order_qty = level[1]
            fill_qty = min(order_qty, qty_left)
            cost = order_price * fill_qty

            fills.append({"price": order_price, "qty": fill_qty, "cost": cost})
            total_cost += cost
            qty_left -= order_qty
            levels += 1

        qty_left = max(qty_left, Decimal(0))
        filled = qty - qty_left
        avg_price = total_cost / filled if filled > 0 else Decimal(0)

        slippage = avg_price - best_order[0]
        slippage_bps = round(slippage / best_order[0] * Decimal(10_000), 2)

        return {
            "avg_price": avg_price,
            "total_cost": total_cost,
            "slippage_bps": slippage_bps,
            "levels_consumed": levels,
            "fully_filled": qty_left <= 0,
            "fills": fills,
        }

    def depth_at_bps(self, side: str, bps: int) -> Decimal:
        """
        Total quantity available within `bps` basis points of best price.
        Measures how much you can trade without moving price beyond threshold.
        """
        if bps < 0:
            raise ValueError("bps must be >= 0")

        book = self.order_book.bids if side == "bid" else self.order_book.asks
        if not book:
            return Decimal(0)

        best = book[0][0]
        limit = (
            best * (1 - Decimal(bps) / 10_000)  # bids go down
            if side == "bid"
            else best * (1 + Decimal(bps) / 10_000)  # asks go up
        )

        total_qty = Decimal(0)
        for price, qty in book:
            if side == "bid" and price < limit:
                break
            if side == "ask" and price > limit:
                break
            total_qty += qty

        return total_qty

    def imbalance(self, levels: int = 10) -> float:
        """
        Order book imbalance ratio.
        Returns [-1.0, +1.0] where:
          +1.0 = all bids (buy pressure)
          -1.0 = all asks (sell pressure)
        """
        bid_volume = sum(qty for _, qty in self.order_book.bids[:levels])
        ask_volume = sum(qty for _, qty in self.order_book.asks[:levels])

        total = bid_volume + ask_volume
        if total == 0:
            return 0.0

        return float((bid_volume - ask_volume) / total)

    def effective_spread(self, qty: Decimal) -> Decimal:
        """
        Effective spread for a round-trip of size `qty` in bps.
        = (avg_ask_fill - avg_bid_fill) / mid_price * 10000
        This is the TRUE cost of immediacy for your trade size.
        """
        buy = self.walk_the_book("buy", qty)
        sell = self.walk_the_book("sell", qty)

        if not buy["fully_filled"] or not sell["fully_filled"]:
            return Decimal("Infinity")

        spread = buy["avg_price"] - sell["avg_price"]
        return round(spread / self.order_book.mid_price * Decimal(10_000), 2)
