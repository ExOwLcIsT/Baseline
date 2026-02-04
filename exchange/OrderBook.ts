import { Num } from "ccxt";

export default class OrderBook {
  symbol: string;
  timestamp: number;
  bids: [number, number][];
  asks: [number, number][];
  bestBid: [number, number];
  bestAsk: [number, number];
  midPrice: number;
  spreadBps: number;
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
      .sort((a, b) => b[0] - a[0]);
    this.asks = asks
      .map((value) => [Number(value[0]), Number(value[1])] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    this.bestBid = this.bids[0];
    this.bestAsk = this.asks[0];
    this.midPrice = (this.bestBid[0] + this.bestAsk[0]) / 2;
    const spread = this.bestAsk[0] - this.bestBid[0];
    this.spreadBps = (spread / this.midPrice) * 10_000;
  }
}
