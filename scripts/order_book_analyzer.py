# scripts/analyze_order_book.py

import sys
from decimal import Decimal
from datetime import datetime

from configs.config import BINANCE_CONFIG
from exchange.exchange_client import ExchangeClient
from exchange.order_book_analyzer import OrderBookAnalyzer


def parse_arg(flag: str) -> str | None:
    prefix = flag + "="
    arg = next((a for a in sys.argv if a.startswith(prefix)), None)
    return arg.split("=")[1] if arg else None


def main():
    if len(sys.argv) < 3:
        print("Usage: analyze_order_book.py <SYMBOL> [--depth=N]")
        sys.exit(1)

    symbol = sys.argv[1]
    depth = int(parse_arg("--depth") or 20)

    client = ExchangeClient(BINANCE_CONFIG)
    order_book = client.fetch_order_book_rest(symbol, depth)
    if not order_book:
        return

    analyzer = OrderBookAnalyzer(order_book)
    asset = symbol.split("/")[0]
    timestamp = (
        order_book.timestamp
        if order_book.timestamp
        else datetime.now().isoformat()
    )

    print("=" * 65)
    print(f"{symbol} Order Book Analyzer")
    print(f"Timestamp: {timestamp}")
    print("=" * 65)

    print(
        f"Best Bid: ${order_book.best_bid[0]} x {order_book.best_bid[1]} {asset}")
    print(
        f"Best Ask: ${order_book.best_ask[0]} x {order_book.best_ask[1]} {asset}")
    print(f"Mid Price: ${order_book.mid_price}")
    print(f"Spread:    ${order_book.spread} ({order_book.spread_bps}bps)")

    print("=" * 65)

    print("Depth (within 10 bps):")
    bids = analyzer.depth_at_bps("bid", 10)
    bids_cost = analyzer.walk_the_book("sell", bids)
    print(f"    Bids: {bids} {asset} (${bids_cost['total_cost']})")

    asks = analyzer.depth_at_bps("ask", 10)       # ← bug fix: "ask" not "bid"
    asks_cost = analyzer.walk_the_book(
        "buy", asks)    # ← bug fix: asks not bids
    print(f"    Asks: {asks} {asset} (${asks_cost['total_cost']})")

    imbalance = analyzer.imbalance(10)
    if imbalance == 0:
        pressure = "no"
    elif imbalance > 0:
        pressure = "bid"
    else:
        pressure = "ask"
    print(f"Imbalance: {imbalance} ({pressure} pressure)")

    print("=" * 65)

    print("BUY 2")
    buy2 = analyzer.walk_the_book("buy", Decimal(2))
    print(f"Avg price:  ${buy2['avg_price']}")
    print(f"Slippage:   {buy2['slippage_bps']} bps")
    print(f"Levels:     {buy2['levels_consumed']}")

    print("BUY 10")
    buy10 = analyzer.walk_the_book("buy", Decimal(10))
    print(f"Avg price:  ${buy10['avg_price']}")
    print(f"Slippage:   {buy10['slippage_bps']} bps")
    print(f"Levels:     {buy10['levels_consumed']}")

    print("=" * 65)
    print(f"Effective spread (2): {analyzer.effective_spread(Decimal(2))}bps")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(err, file=sys.stderr)
        sys.exit(1)
