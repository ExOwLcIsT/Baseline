import ExchangeClient from "../exchange/ExchangeClient";
import { BINANCE_CONFIG } from "../configs/Binance_config";
import { describe, expect, test, beforeAll } from "vitest";
import { Decimal } from "decimal.js";
import OrderBook from "../exchange/OrderBook";
describe("ExchangeClient", () => {
  let client: ExchangeClient;
  let book: OrderBook;
  let assets: {
    [id: string]: {
      free: Decimal;
      total: Decimal;
      used: Decimal;
    };
  };
  beforeAll(async () => {
    client = await ExchangeClient.fromConfig(BINANCE_CONFIG);
    book = await client.fetchOrderBook("ETH/USDT", 20);

    assets = await client.fetchBalance();
  });

  test("Bids sorted highest to lowest.", async () => {
    for (let i = 0; i < book.bids.length - 1; i++) {
      const [price] = book.bids[i];
      const [nextPrice] = book.bids[i + 1];
      expect(price.gte(nextPrice)).toBe(true);
    }
  });

  test("Asks sorted lowest to highest.", async () => {
    for (let i = 0; i < book.asks.length - 1; i++) {
      const [price, qty] = book.asks[i];
      const [nextPrice, nextQty] = book.asks[i + 1];
      expect(price.lte(nextPrice)).toBe(true);
    }
  });

  test("Spread = best_ask - best_bid, in bps", async () => {
    const bestAsk = book.bestAsk[0];
    const bestBid = book.bestBid[0];
    const spread = bestAsk.sub(bestBid);
    const midPrice = bestBid.add(bestAsk).div(2);
    const spreadBps = spread.div(midPrice).mul(10000).toDecimalPlaces(2);
    expect(spreadBps.eq(book.spreadBps)).toBe(true);
  });

  test("Zero-balance assets excluded from result", async () => {
    for (const asset in assets) {
      expect(assets[asset].total.greaterThan(0)).toBe(true);
    }
  });

  test("IOC order returns fill qty, avg price, fees", async () => {
    const order = await client.createLimitIocOrder(
      "ETH/USDT",
      "buy",
      0.5,
      2100.5,
    );
    expect(order.amountFilled).toBeDefined();
    expect(order.avgFillPrice).toBeDefined();
    expect(order.fee).toBeDefined();
  });

  test("Requests blocked when weight limit reached", () => {

  });
});
