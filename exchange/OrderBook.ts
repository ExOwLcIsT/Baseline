import { Num } from "ccxt";
import { Decimal } from "decimal.js";

export default class OrderBook {
  symbol: string;
  timestamp: number;
  bids: [Decimal, Decimal][];
  asks: [Decimal, Decimal][];
  bestBid: [Decimal, Decimal];
  bestAsk: [Decimal, Decimal];
  midPrice: Decimal;
  spread: Decimal;
  spreadBps: Decimal;
  /**
   *
   */
  constructor(
    symbol: string,
    timestamp: number,
    bids: [Num, Num][],
    asks: [Num, Num][],
  ) {
    this.symbol = symbol;
    this.timestamp = timestamp;

    this.bids = bids
      .map((value) => [Number(value[0]), Number(value[1])] as [number, number])
      .sort((a, b) => b[0] - a[0])
      .map((value) => [new Decimal(value[0]), new Decimal(value[1])]);
    this.asks = asks
      .map((value) => [Number(value[0]), Number(value[1])] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .map((value) => [new Decimal(value[0]), new Decimal(value[1])]);
    this.bestBid = this.bids[0];
    this.bestAsk = this.asks[0];
    this.midPrice = this.bestBid[0].add(this.bestAsk[0]).div(2);
    this.spread = this.bestAsk[0].sub(this.bestBid[0]).toDecimalPlaces(2);
    this.spreadBps = this.spread
      .div(this.midPrice)
      .mul(10_000)
      .toDecimalPlaces(2);
  }
  
}
