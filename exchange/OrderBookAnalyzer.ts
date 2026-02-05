import { Decimal } from "decimal.js";
import OrderBook from "./OrderBook.js";

export default class OrderBookAnalyzer {
  /*
    Analyze order book snapshots for trading decisions.
    */
  orderBook: OrderBook;
  constructor(orderbook: OrderBook) {
    /*
        Initialize with order book from ExchangeClient.fetch_order_book().
        */
    this.orderBook = orderbook;
  }

  walkTheBook(
    side: "buy" | "sell", // "buy" (walk asks) or "sell" (walk bids)
    qty: Decimal, // Amount of base asset
  ): {
    avgPrice: Decimal;
    totalCost: Decimal; // In quote currency
    slippageBps: Decimal; // vs best price
    levelsConsumed: number; // How deep we went
    fullyFilled: boolean;
    fills: { price: Decimal; qty: Decimal; cost: Decimal }[];
  } {
    /*
        Simulate filling `qty` against the order book.

        Returns:
        {
            'avg_price': Decimal,
            'total_cost': Decimal,     # In quote currency
            'slippage_bps': Decimal,   # vs best price
            'levels_consumed': int,    # How deep we went
            'fully_filled': bool,
            'fills': [
                {'price': Decimal, 'qty': Decimal, 'cost': Decimal},
                ...
            ]
        }

        If insufficient liquidity, fully_filled=False and fills show what IS available.
        */

    const road = side === "buy" ? this.orderBook.asks : this.orderBook.bids;
    const bestOrder =
      side === "buy" ? this.orderBook.bestAsk : this.orderBook.bestBid;
    let levels = 0;
    let totalCost = new Decimal(0);
    let qtyLeft = qty;
    const fills: { price: Decimal; qty: Decimal; cost: Decimal }[] = [];
    for (; levels < road.length && qtyLeft.gt(0); levels++) {
      const orderPrice = road[levels][0];
      const orderQty = road[levels][1];

      const cost = orderPrice.mul(Decimal.min(orderQty, qtyLeft));
      fills.push({
        price: orderPrice,
        qty: Decimal.min(orderQty, qtyLeft),
        cost: cost,
      });
      totalCost = totalCost.add(cost);
      qtyLeft = qtyLeft.sub(orderQty);
    }
    qtyLeft = Decimal.max(qtyLeft, 0);
    const avgPrice = totalCost.div(qty.sub(qtyLeft));
    const slippage = avgPrice.sub(bestOrder[0]);
    const slippageBps = slippage.div(bestOrder[0]).mul(10_000);
    const result = {
      avgPrice,
      totalCost, // In quote currency
      slippageBps, // vs best price
      levelsConsumed: levels + 1, // How deep we went
      fullyFilled: qtyLeft.lte(0),
      fills: fills,
    };
    return result;
  }

  depthAtBps(
    side: "bid" | "ask", // "bid" or "ask"
    bps: number, // How deep (e.g., 10 = within 10 bps of best)
  ): Decimal {
    /*
          Total quantity available within `bps` basis points of best price.
          Measures how much you can trade without moving price beyond threshold.
          */
    if (bps < 0) {
      throw new Error("bps must be >= 0");
    }

    const book = side === "bid" ? this.orderBook.bids : this.orderBook.asks;

    if (!book.length) return new Decimal(0);

    const best = book[0][0];

    // price limits
    const limit =
      side === "bid"
        ? best.mul(1 - bps / 10_000) // bids go down
        : best.mul(1 + bps / 10_000); // asks go up

    let totalQty = new Decimal(0);

    for (const [price, qty] of book) {
      if (side === "bid") {
        if (price < limit) break;
      } else {
        if (price > limit) break;
      }

      totalQty = totalQty.add(qty);
    }

    return totalQty;
  }

  imbalance(levels: number = 10): number {
    /*
          Order book imbalance ratio.
          Returns [-1.0, +1.0] where:
            +1.0 = all bids (buy pressure)
            -1.0 = all asks (sell pressure)
          */
    const bidVolume = this.orderBook.bids
      .slice(0, levels)
      .reduce((partialSum, a) => partialSum.add(a[1]), new Decimal(0));
    const askVolume = this.orderBook.asks
      .slice(0, levels)
      .reduce((partialSum, a) => partialSum.add(a[1]), new Decimal(0));

    const total = bidVolume.add(askVolume);
    if (total.eq(0)) return 0.0;

    const imbalance = bidVolume.sub(askVolume).div(total).toNumber();
    return imbalance;
  }

  effectiveSpread(qty: Decimal): Decimal {
    /*
          Effective spread for a round-trip of size `qty`.
          = (avg_ask_fill - avg_bid_fill) / mid_price * 10000 (bps)

          This is the TRUE cost of immediacy for your trade size.
          Different from quoted spread which only considers best levels.
          */
    const buy = this.walkTheBook("buy", qty);
    const sell = this.walkTheBook("sell", qty);

    if (!buy.fullyFilled || !sell.fullyFilled) {
      return new Decimal(Infinity);
    }

    const spread = new Decimal(buy.avgPrice.sub(sell.avgPrice));

    return spread.div(this.orderBook.midPrice).mul(10_000);
  }
}
