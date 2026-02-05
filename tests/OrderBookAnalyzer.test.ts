import { describe, test, expect, beforeAll } from "vitest";
import Decimal from "decimal.js";
import OrderBook from "../exchange/OrderBook";
import OrderBookAnalyzer from "../exchange/OrderBookAnalyzer";

describe("OrderBook", () => {
  let analyzer: OrderBookAnalyzer;
  beforeAll(() => {
    const book = new OrderBook(
      "ETH/USDT",
      Date.now(),
      [
        [99, 5],
        [100, 5],
        [98, 5],
      ],
      [
        [102, 5],
        [101, 5],
        [103, 5],
      ],
    );
    analyzer = new OrderBookAnalyzer(book);
  });

  test("test_walk_the_book_exact_fill", () => {
    const res = analyzer.walkTheBook("buy", new Decimal(5));

    expect(res.fullyFilled).toBe(true);
    expect(res.levelsConsumed).toBe(2);
    expect(res.avgPrice.eq(101)).toBe(true);
    expect(res.totalCost.eq(505)).toBe(true);
  });

  test("test_walk_the_book_multiple_levels", () => {
    const res = analyzer.walkTheBook("buy", new Decimal(8));

    const expectedCost = new Decimal(5).mul(101).add(new Decimal(3).mul(102));
    const expectedAvg = expectedCost.div(8);

    expect(res.fullyFilled).toBe(true);
    expect(res.avgPrice.eq(expectedAvg)).toBe(true);
    expect(res.fills.length).toBe(2);
  });

  test("test_walk_the_book_insufficient_liquidity", () => {
    const res = analyzer.walkTheBook("buy", new Decimal(20));

    expect(res.fullyFilled).toBe(false);
    expect(res.totalCost.gt(0)).toBe(true);
    expect(res.fills.length).toBe(3);
  });

  test("test_depth_at_bps_correct", () => {
    const depth = analyzer.depthAtBps("ask", 10);

    expect(depth.eq(5)).toBe(true);
  });

  test("test_imbalance_range", () => {
    const imbalance = analyzer.imbalance(3);

    expect(imbalance).toBeGreaterThanOrEqual(-1);
    expect(imbalance).toBeLessThanOrEqual(1);
  });

  test("test_effective_spread_greater_than_quoted", () => {
    const eff = analyzer.effectiveSpread(new Decimal(3));
    const quoted = analyzer.orderBook.spreadBps;

    expect(eff.greaterThanOrEqualTo(quoted)).toBe(true);
  });
});
