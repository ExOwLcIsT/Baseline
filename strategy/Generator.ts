import { Decimal } from "decimal.js";
import FeeStructure from "./Fees.js";
import ExchangeClient from "../exchange/ExchangeClient.js";
import PricingEngine from "../pricing/PricingEngine.js";
import InventoryTracker, { Venue } from "../inventory/Tracker.js";
import Signal, { Direction } from "./Signal.js";
import OrderBookAnalyzer from "../exchange/OrderBookAnalyzer.js";
import Token from "../pricing/Token.js";
import { Address } from "../core/BaseTypes/Address.js";

export default class SignalGenerator {
  exchange: ExchangeClient;
  pricing: PricingEngine;
  inventory: InventoryTracker;
  fees: FeeStructure;

  minSpreadBps: Decimal;
  minProfitUsd: Decimal;
  maxPositionUsd: Decimal;
  signalTtl: number;
  cooldown: number;

  lastSignalTime: { [id: string]: number };

  constructor(
    exchangeClient: ExchangeClient,
    pricingEngine: PricingEngine,
    inventoryTracker: InventoryTracker,
    feeStructure: FeeStructure,
    config: {
      minSpreadBps?: number;
      minProfitUsd?: number;
      maxPositionUsd?: number;
      signalTtlSeconds?: number;
      cooldownSeconds?: number;
    },
  ) {
    this.exchange = exchangeClient;
    this.pricing = pricingEngine;
    this.inventory = inventoryTracker;
    this.fees = feeStructure;

    this.minSpreadBps = Decimal(config.minSpreadBps ?? 50);
    this.minProfitUsd = Decimal(config.minProfitUsd ?? 5.0);
    this.maxPositionUsd = Decimal(config.maxPositionUsd ?? 10_000);
    this.signalTtl = config.signalTtlSeconds ?? 5;
    this.cooldown = config.cooldownSeconds ?? 2;

    this.lastSignalTime = {};
  }
  async generate(pair: string, size: Decimal): Promise<Signal | undefined> {
    /*
        Attempt to generate a signal for the given pair and size.
        Returns Signal if opportunity found and validated, None otherwise.
        */
    if (this.inCooldown(pair)) return undefined;

    const prices = await this.fetchPrices(pair, size);
    if (prices == undefined) return undefined;

    // Calculate spreads both directions
    const spreadA = prices.dexSell
      .sub(prices.cexAsk)
      .div(prices.cexAsk)
      .mul(10_000);
    const spreadB = prices.cexBid
      .sub(prices.dexBuy)
      .div(prices.dexBuy)
      .mul(10_000);
    let direction, spread, cexPrice, dexPrice;
    // Pick better direction
    if (spreadA > spreadB && spreadB >= this.minSpreadBps) {
      direction = Direction.BUY_CEX_SELL_DEX;
      [spread, cexPrice, dexPrice] = [spreadA, prices.cexAsk, prices.dexSell];
    } else if (spreadB >= this.minSpreadBps) {
      direction = Direction.BUY_DEX_SELL_CEX;
      [spread, cexPrice, dexPrice] = [spreadB, prices.cexBid, prices.dexBuy];
    } else return undefined;

    // Economics
    const tradeValue = cexPrice.mul(size);
    const grossPnl = spread.div(10_000).mul(tradeValue);
    const fees = this.fees.totalFeeBps(tradeValue).div(10_000).mul(tradeValue);
    const netPnl = grossPnl.sub(fees);

    if (netPnl.lt(this.minProfitUsd)) return undefined;

    // Validation
    const inventoryOk = this.checkInventory(pair, direction, size, cexPrice);
    const withinLimits = tradeValue <= this.maxPositionUsd;

    const signal = Signal.create(pair, direction, {
      cexPrice: cexPrice,
      dexPrice: dexPrice,
      spreadBps: spread,
      size: size,
      expectedGrossPnl: grossPnl,
      expectedFees: fees,
      expectedNetPnl: netPnl,
      score: 0,
      expiry: Date.now() + this.signalTtl,
      inventoryOk: inventoryOk,
      withinLimits: withinLimits,
    });

    this.lastSignalTime[pair] = Date.now();
    return signal;
  }
  inCooldown(pair: string): boolean {
    return Date.now() - this.lastSignalTime[pair] < this.cooldown;
  }
  async fetchPrices(
    pair: string,
    size: Decimal,
  ): Promise<
    | { cexBid: Decimal; cexAsk: Decimal; dexBuy: Decimal; dexSell: Decimal }
    | undefined
  > {
    try {
      const ob = await this.exchange.fetchOrderBook(pair);
      const analyzer = new OrderBookAnalyzer(ob);
      const cexBid = analyzer.walkTheBook("sell", size).avgPrice;
      const cexAsk = analyzer.walkTheBook("buy", size).avgPrice;
      const [base, quote] = pair.split("/");
      const sizeDecimals = 10n ** BigInt(size.decimalPlaces());

      const amountIn =
        BigInt(size.mul(sizeDecimals).toNumber()) *
        (Tokens[base].decimals / sizeDecimals); //Decimal places are not lost during BIGINT convertation

      const simulated = await this.pricing.getQuote(
        Tokens[base],
        Tokens[quote],
        amountIn,
        1n,
        WALLET_ADDRESS,
      );
      const dexBuy = Decimal(simulated.route.getInput(amountIn).toString())
        .div(Tokens[quote].decimals.toString())
        .div(size);

      const dexSell = Decimal(simulated.expectedOutput.toString())
        .div(Tokens[quote].decimals.toString())
        .div(size);

      return {
        cexBid: cexBid,
        cexAsk: cexAsk,
        dexBuy: dexBuy,
        dexSell: dexSell,
      };
    } catch  {
      return undefined;
    }
  }
  checkInventory(
    pair: string,
    direction: Direction,
    size: Decimal,
    price: Decimal,
  ): boolean {
    const [base, quote] = pair.split("/");
    if (direction == Direction.BUY_CEX_SELL_DEX) {
      return (
        this.inventory
          .getAvailable(Venue.BINANCE, quote)
          .gte(price.mul(size).mul(1.01)) &&
        this.inventory.getAvailable(Venue.WALLET, base).gte(size)
      );
    } else {
      return (
        this.inventory.getAvailable(Venue.BINANCE, base).gte(size) &&
        this.inventory
          .getAvailable(Venue.WALLET, quote)
          .gte(price.mul(size).mul(1.01))
      );
    }
  }
}

const Tokens: { [id: string]: Token } = {
  USDC: new Token(
    "USDC",
    10n ** 6n,
    Address.fromString("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  ),
  ETH: new Token(
    "WETH",
    10n ** 18n,
    Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  ),
  USDT: new Token(
    "USDT",
    10n ** 6n,
    Address.fromString("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
  ),
  SHIB: new Token(
    "SHIB",
    10n ** 18n,
    Address.fromString("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
  ),
};

const WALLET_ADDRESS = Address.fromString(
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
);
