import { Decimal } from "decimal.js";
import ExchangeClient from "../exchange/ExchangeClient.js";
import InventoryTracker from "../inventory/Tracker.js";
import PricingEngine from "../pricing/PricingEngine.js";
import Signal, { Direction } from "../strategy/Signal.js";
import CircuitBreaker from "./CircuitBreaker.js";
import ReplayProtection from "./ReplayProtection.js";
import { Tokens } from "../strategy/Generator.js";
import Order from "../exchange/Order.js";
export enum ExecutorState {
  IDLE,
  VALIDATING,
  LEG1_PENDING,
  LEG1_FILLED,
  LEG2_PENDING,
  DONE,
  FAILED,
  UNWINDING,
}

class ExecutionContext {
  signal: Signal;
  state: ExecutorState = ExecutorState.IDLE;

  leg1Venue: string = "";
  leg1OrderId?: string = undefined;
  leg1FillPrice?: Decimal = undefined;
  leg1FillSize?: Decimal = undefined;

  leg2Venue: string = "";
  leg2TxHash?: string = undefined;
  leg2FillPrice?: Decimal = undefined;
  leg2FillSize?: Decimal = undefined;

  startedAt: number;
  finishedAt?: number = undefined;
  actualNetPnl?: Decimal = undefined;
  error?: string = undefined;
  constructor(signal: Signal) {
    this.signal = signal;
    this.startedAt = Date.now();
  }
}

export class ExecutorConfig {
  leg1Timeout: number = 5.0;
  leg2Timeout: number = 60.0;
  minFillRatio: Decimal = Decimal(0.8);
  useFlashbots: boolean = true;
  simulationMode: boolean = true;
}
export default class Executor {
  // Execute arbitrage trades across CEX and DEX.
  exchange: ExchangeClient;
  pricing: PricingEngine;
  inventory: InventoryTracker;
  config: ExecutorConfig;
  circuitBreaker: CircuitBreaker;
  replayProtection: ReplayProtection;
  constructor(
    exchangeClient: ExchangeClient,
    pricingModule: PricingEngine,
    inventoryTracker: InventoryTracker,
    config?: ExecutorConfig,
  ) {
    this.exchange = exchangeClient;
    this.pricing = pricingModule;
    this.inventory = inventoryTracker;
    this.config = config ?? new ExecutorConfig();

    this.circuitBreaker = new CircuitBreaker();
    this.replayProtection = new ReplayProtection();
  }
  async execute(signal: Signal): Promise<ExecutionContext> {
    let ctx = new ExecutionContext(signal);

    // Pre-flight checks
    if (this.circuitBreaker.isOpen()) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "Circuit breaker open";
      return ctx;
    }
    if (this.replayProtection.isDuplicate(signal)) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "Duplicate signal";
      return ctx;
    }
    ctx.state = ExecutorState.VALIDATING;
    if (!signal.isValid()) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "Signal invalid";
      return ctx;
    }
    // Execute based on leg order strategy
    if (this.config.useFlashbots) {
      ctx = await this.executeDexFirst(ctx);
    } else {
      ctx = await this.executeCexFirst(ctx);
    }
    // Record result
    this.replayProtection.markExecuted(signal);
    if (ctx.state == ExecutorState.DONE) {
      this.circuitBreaker.recordSuccess();
    } else {
      this.circuitBreaker.recordFailure();
    }
    ctx.finishedAt = Date.now();
    return ctx;
  }
  async executeCexFirst(ctx: ExecutionContext): Promise<ExecutionContext> {
    // CEX leg first (default for non-Flashbots).
    const signal = ctx.signal;

    // Leg 1: CEX
    ctx.state = ExecutorState.LEG1_PENDING;
    ctx.leg1Venue = "cex";
    let leg1;
    try {
      leg1 = await Promise.race([
        this.executeCexLeg(signal),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            this.config.leg1Timeout * 1000,
          ),
        ),
      ]);
    } catch {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "CEX timeout";
      return ctx;
    }
    if (!leg1.success) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = leg1.get("error", "CEX rejected");
      return ctx;
    }
    if (leg1.filled.div(signal.size).lt(this.config.minFillRatio)) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "Partial fill below threshold";
      return ctx;
    }
    ctx.leg1FillPrice = leg1.price;
    ctx.leg1FillSize = leg1.filled;
    ctx.state = ExecutorState.LEG1_FILLED;

    // Leg 2: DEX
    ctx.state = ExecutorState.LEG2_PENDING;
    ctx.leg2Venue = "dex";
    let leg2: any;
    try {
      leg2 = await Promise.race([
        this.executeDexLeg(signal, signal.size),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            this.config.leg2Timeout * 1000,
          ),
        ),
      ]);
    } catch {
      ctx.state = ExecutorState.UNWINDING;
      await this.unwind(ctx);
      ctx.state = ExecutorState.FAILED;
      ctx.error = "DEX timeout - unwound";
      return ctx;
    }
    if (!leg2.success) {
      ctx.state = ExecutorState.UNWINDING;
      await this.unwind(ctx);
      ctx.state = ExecutorState.FAILED;
      ctx.error = "DEX failed - unwound";
      return ctx;
    }
    ctx.leg2FillPrice = leg2.price;
    ctx.leg2FillSize = leg2.filled;
    ctx.actualNetPnl = this.calculatePnl(ctx);
    ctx.state = ExecutorState.DONE;
    return ctx;
  }
  async executeDexFirst(ctx: ExecutionContext): Promise<ExecutionContext> {
    // DEX leg first (when using Flashbots - failed tx = no cost).
    const signal = ctx.signal;

    // Leg 1: DEX
    ctx.state = ExecutorState.LEG1_PENDING;
    ctx.leg1Venue = "dex";
    let leg1: any;
    try {
      leg1 = await Promise.race([
        this.executeDexLeg(signal, signal.size),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            this.config.leg1Timeout * 1000,
          ),
        ),
      ]);
    } catch {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "DEX timeout";
      return ctx;
    }
    if (!leg1?.success) {
      ctx.state = ExecutorState.FAILED;
      ctx.error = "DEX failed (no cost via Flashbots)";
      return ctx;
    }
    ctx.leg1FillPrice = leg1.price;
    ctx.leg1FillSize = leg1.filled;
    ctx.state = ExecutorState.LEG1_FILLED;

    // Leg 2: CEX
    ctx.state = ExecutorState.LEG2_PENDING;
    ctx.leg2Venue = "cex";
    let leg2;
    try {
      leg2 = await Promise.race([
        this.executeCexLeg(signal),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("timeout")),
            this.config.leg2Timeout * 1000,
          ),
        ),
      ]);
    } catch {
      ctx.state = ExecutorState.UNWINDING;
      await this.unwind(ctx);
      ctx.state = ExecutorState.FAILED;
      ctx.error = "CEX timeout after DEX - unwound";
      return ctx;
    }
    if (!leg2.success) {
      ctx.state = ExecutorState.UNWINDING;
      await this.unwind(ctx);
      ctx.state = ExecutorState.FAILED;
      ctx.error = "CEX failed after DEX - unwound";
      return ctx;
    }
    ctx.leg2FillPrice = leg2.price;
    ctx.leg2FillSize = leg2.filled;
    ctx.actualNetPnl = this.calculatePnl(ctx);
    ctx.state = ExecutorState.DONE;
    return ctx;
  }
  async executeCexLeg(signal: Signal, size?: Decimal): Promise<any> {
    const actualSize = size ?? signal.size;
    if (this.config.simulationMode) {
      await setTimeout(() => {}, 500);
      return {
        success: true,
        price: signal.cexPrice.mul(1.0001),
        filled: actualSize,
      };
    }
    // Real execution via exchange client
    const side =
      signal.direction == Direction.BUY_CEX_SELL_DEX ? "buy" : "sell";
    const result = await this.exchange.createLimitIocOrder(
      signal.pair,
      side,
      actualSize,
      signal.cexPrice.mul(1.001),
    );
    return {
      success: result.status == "filled",
      price: result.avgFillPrice,
      filled: result.amountFilled,
      error: result.status,
    };
  }
  async executeDexLeg(signal: Signal, size: Decimal) {
    if (this.config.simulationMode) {
      setTimeout(() => {}, 500);
      return {
        success: true,
        price: signal.dexPrice.mul(0.9998),
        filled: size,
      };
    }
    const [base, quote] = signal.pair.split("/");

    const tokenIn = Tokens[base];
    const tokenOut = Tokens[quote];
    await this.pricing.swap(size, tokenIn, tokenOut);
  }

  async unwind(ctx: ExecutionContext) {
    // Market sell to flatten stuck position.
    if (this.config.simulationMode) {
      setTimeout(() => {}, 100);
      return;
    }
    if (ctx.leg1FillSize == undefined || ctx.leg1FillSize.eq(0))
      return { status: "nothing_to_unwind" };

    const signal = ctx.signal;

    let unwindSide, unwindVenue, unwindSize;
    // Determine what we're stuck with
    if (signal.direction == Direction.BUY_CEX_SELL_DEX) {
      // We bought on CEX — sell it back
      unwindSide = "sell";
      unwindVenue = "cex";
      unwindSize = ctx.leg1FillSize;
    } else {
      // We sold on CEX — buy it back
      unwindSide = "buy";
      unwindVenue = "cex";
      unwindSize = ctx.leg1FillSize;
    }
    console.warn(
      `UNWINDING: ${unwindSide} ${unwindSize} ${signal.pair} on ${unwindVenue}`,
    );

    // Execute unwind as market order (accept slippage, need to get out)

    try {
      const result = await this.exchange.createMarketOrder(
        signal.pair,
        unwindSide,
        unwindSize,
      );

      const unwindPnl = this.calculateUnwindPnl(ctx, result);
      return {
        status: "unwound",
        fillPrice: result.avgFillPrice,
        pnl: unwindPnl,
      };
    } catch (err) {
      console.log(`Unwind failed: ${err}`);
      return {
        status: "unwindFailed",
        error: err,
        manual_action_required: true,
      };
    }
  }

  calculateUnwindPnl(ctx: ExecutionContext, unwindResult: Order): Decimal {
    // Calculate loss from unwinding.

    const signal = ctx.signal;
    let gross: Decimal;
    if (signal.direction == Direction.BUY_CEX_SELL_DEX) {
      // Bought at leg1_fill_price, sold at unwind_price
      gross = Decimal(unwindResult.avgFillPrice)
        .sub(ctx.leg1FillPrice!)
        .mul(ctx.leg1FillSize!);
    } else {
      // Sold at leg1_fill_price, bought back at unwind_price
      gross = ctx
        .leg1FillPrice!.sub(unwindResult.avgFillPrice)
        .mul(ctx.leg1FillSize!);
    }
    // Subtract both trade fees
    const fees = ctx.leg1FillSize!.mul(ctx.leg1FillPrice!).mul(0.001).add(
      // Leg 1 fee

      ctx.leg1FillSize!.mul(unwindResult.avgFillPrice).mul(0.001), // Unwind fee
    );

    return gross.sub(fees); // Usually negative
  }
  calculatePnl(ctx: ExecutionContext): Decimal {
    const signal = ctx.signal;
    let gross;
    if (signal.direction == Direction.BUY_CEX_SELL_DEX) {
      gross = ctx.leg2FillPrice!.sub(ctx.leg1FillPrice!).mul(ctx.leg1FillSize!);
    } else {
      gross = ctx.leg1FillPrice!.sub(ctx.leg2FillPrice!).mul(ctx.leg1FillSize!);
    }
    const fees = ctx.leg1FillSize!.mul(ctx.leg1FillPrice!).mul(0.004); // ~40 bps
    return gross.sub(fees);
  }
}
