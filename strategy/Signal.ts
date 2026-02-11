import { bytesToHex } from "@noble/hashes/utils";
import { Decimal } from "decimal.js";
import { randomBytes } from "ethers";
export enum Direction {
  BUY_CEX_SELL_DEX = "buy_cex_sell_dex",
  BUY_DEX_SELL_CEX = "buy_dex_sell_cex",
}

type SignalParams = {
  cexPrice: Decimal;
  dexPrice: Decimal;
  spreadBps: Decimal;
  size: Decimal;

  expectedGrossPnl: Decimal;
  expectedFees: Decimal;
  expectedNetPnl: Decimal;

  score: number;
  expiry: number;

  inventoryOk: boolean;
  withinLimits: boolean;
};

export default class Signal {
  // A validated arbitrage opportunity ready for execution.
  signalId: string;
  pair: string;
  direction: Direction;

  cexPrice: Decimal;
  dexPrice: Decimal;
  spreadBps: Decimal;
  size: Decimal;

  expectedGrossPnl: Decimal;
  expectedFees: Decimal;
  expectedNetPnl: Decimal;

  score: number;
  timestamp: number;
  expiry: number;

  inventoryOk: boolean;
  withinLimits: boolean;
  private constructor(
    id: string,
    pair: string,
    direction: Direction,
    timestamp: number,
    params: SignalParams,
  ) {
    this.signalId = id;
    this.pair = pair;
    this.direction = direction;
    this.timestamp = timestamp;

    this.cexPrice = params.cexPrice;
    this.dexPrice = params.dexPrice;
    this.spreadBps = params.spreadBps;
    this.size = params.size;

    this.expectedGrossPnl = params.expectedGrossPnl;
    this.expectedFees = params.expectedFees;
    this.expectedNetPnl = params.expectedNetPnl;

    this.score = params.score;
    this.expiry = params.expiry;

    this.inventoryOk = params.inventoryOk;
    this.withinLimits = params.withinLimits;
  }
  static create(
    pair: string,
    direction: Direction,
    params: SignalParams,
  ): Signal {
    return new Signal(
      `${pair.replace("/", "")}_${bytesToHex(randomBytes(4))}`,
      pair,
      direction,
      Date.now(),
      params,
    );
  }
  isValid(): boolean {
    return (
      Date.now() < this.expiry &&
      this.inventoryOk &&
      this.withinLimits &&
      this.expectedNetPnl.gt(0) &&
      this.score > 0
    );
  }
  ageSeconds(): number {
    return Date.now() - this.timestamp;
  }
}
