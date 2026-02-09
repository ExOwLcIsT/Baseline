import ExchangeClient from "../../exchange/ExchangeClient.js";
import PnLEngine from "../../inventory/PnL.js";
import InventoryTracker, { Venue } from "../../inventory/Tracker.js";
import PricingEngine from "../../pricing/PricingEngine.js";
import { Address } from "../../core/BaseTypes/Address.js";
import UniswapV2Pair from "../../pricing/AMM.js";
import OrderBookAnalyzer from "../../exchange/OrderBookAnalyzer.js";
import { Decimal } from "decimal.js";
import ChainClient from "../../chain/ChainClient.js";
import { BINANCE_CONFIG } from "../../configs/Binance_config.js";
import * as dotenv from "dotenv";
import "dotenv/config";
function parseArg(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(flag + "="));
  return arg?.split("=")[1];
}
export default class ArbChecker {
  /*
    End-to-end arbitrage check: detect → validate → check inventory.
    Does NOT execute — just identifies opportunities.
    */
  pricingEngine: PricingEngine;
  exchangeClient: ExchangeClient;
  inventoryTracker: InventoryTracker;
  pnlEngine: PnLEngine;
  constructor(
    pricingEngine: PricingEngine,
    exchangeClient: ExchangeClient,
    inventoryTracker: InventoryTracker,
    pnlEngine: PnLEngine,
  ) {
    this.pricingEngine = pricingEngine;
    this.exchangeClient = exchangeClient;
    this.inventoryTracker = inventoryTracker;
    this.pnlEngine = pnlEngine;
  }

  async check(
    pair: string,
    size: number,
  ): Promise<{
    pair: string;
    timestamp: Date;
    dexPrice: Decimal;
    cexBid: Decimal;
    cexAsk: Decimal;
    gapBps: Decimal;
    direction: "buy_dex_sell_cex" | "buy_cex_sell_dex" | undefined;
    estimatedCostsBps: Decimal;
    estimatedNetPnlBps: Decimal;
    inventoryOk: boolean;
    executable: boolean; // gap > costs AND inventory available
    // gap > costs AND inventory available
    details: {
      dexPriceImpactBps: Decimal;
      cexSlippageBps: Decimal;
      cexFeeBps: Decimal;
      dexFeeBps: Decimal;
      gasCostUsd: Decimal;
      gasBps: Decimal;
    };
  }> {
    /*
            Full arb check for a trading pair.

            Flow:
            1. Get DEX price from pricing_engine (Week 2)
            2. Get CEX order book from exchange_client (Week 3)
            3. Compare prices, calculate gap
            4. Estimate all costs (fees, gas, slippage)
            5. Check inventory availability
            6. Return opportunity assessment

            Returns:
            {
                'pair': 'ETH/USDT',
                'timestamp': datetime,
                'dex_price': Decimal,
                'cex_bid': Decimal,
                'cex_ask': Decimal,
                'gap_bps': Decimal,
                'direction': 'buy_dex_sell_cex' | 'buy_cex_sell_dex' | None,
                'estimated_costs_bps': Decimal,
                'estimated_net_pnl_bps': Decimal,
                'inventory_ok': bool,
                'executable': bool,        # gap > costs AND inventory available
                'details': {
                    'dex_price_impact_bps': Decimal,
                    'cex_slippage_bps': Decimal,
                    'cex_fee_bps': Decimal,
                    'dex_fee_bps': Decimal,
                    'gas_cost_usd': Decimal,
                },
            }
            */
    this.pricingEngine.loadPools([
      Address.fromString("0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852"),
    ]);
    const uniSwapPair = await UniswapV2Pair.fromChain(
      Address.fromString("0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852"),
      this.pricingEngine.client,
    );
    const ETHToken =
      uniSwapPair.token0.name === "WETH"
        ? uniSwapPair.token0
        : uniSwapPair.token1;
    const USDTToken =
      uniSwapPair.token0.name === "USDT"
        ? uniSwapPair.token0
        : uniSwapPair.token1;
    const dexSellPrice = uniSwapPair.getAmountOut(
      BigInt(size) * ETHToken.decimals,
      ETHToken,
    );
    const dexBuyPrice = uniSwapPair.getAmountIn(
      BigInt(size) * ETHToken.decimals,
      ETHToken,
    );
    const dexQuote = await this.pricingEngine.getQuote(
      ETHToken,
      USDTToken,
      BigInt(size) * ETHToken.decimals,
      1n,
      Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
    );
    const dexGas = Decimal(
      uniSwapPair.getAmountOut(dexQuote.gasEstimate * 10n ** 9n, ETHToken),
    ).div(USDTToken.decimals);
    const book = await this.exchangeClient.fetchOrderBook(pair);
    const analyzer = new OrderBookAnalyzer(book);
    const buyWalked = analyzer.walkTheBook("buy", Decimal(size));
    const sellWalked = analyzer.walkTheBook("sell", Decimal(size));

    const gap1 = Decimal(
      uniSwapPair.getExecutionPrice(dexSellPrice, USDTToken),
    ).sub(buyWalked.avgPrice);

    const gap2 = sellWalked.avgPrice.sub(
      uniSwapPair.getExecutionPrice(dexBuyPrice, USDTToken),
    );
    let gapBps = Decimal(0);
    let cexSlippageBps = Decimal(0);
    let dexPriceImpactBps = 0;
    let gasBps = Decimal(0);
    let inventoryOk = true;
    if (gap1 > gap2) {
      gapBps = gap1.div(buyWalked.avgPrice).mul(10000);
      cexSlippageBps = buyWalked.slippageBps;
      dexPriceImpactBps =
        uniSwapPair.getPriceImpact(BigInt(size) * ETHToken.decimals, ETHToken) /
        100;
      gasBps = Decimal(dexGas)
        .div(uniSwapPair.getExecutionPrice(dexSellPrice, USDTToken))
        .mul(10000);

      inventoryOk =
        this.inventoryTracker
          .getAvailable(Venue.BINANCE, "USDT")
          .gte(buyWalked.totalCost) &&
        this.inventoryTracker.getAvailable(Venue.WALLET, "ETH").gte(size);
    } else {
      gapBps = gap2
        .div(uniSwapPair.getExecutionPrice(dexBuyPrice, USDTToken))
        .mul(10000);
      cexSlippageBps = sellWalked.slippageBps;
      dexPriceImpactBps =
        uniSwapPair.getPriceImpact(dexBuyPrice, USDTToken) / 100;
      gasBps = Decimal(dexGas)
        .div(uniSwapPair.getExecutionPrice(dexBuyPrice, USDTToken))
        .mul(10000);

      inventoryOk =
        this.inventoryTracker
          .getAvailable(Venue.WALLET, "USDT")
          .gte(dexBuyPrice) &&
        this.inventoryTracker.getAvailable(Venue.BINANCE, "ETH").gte(size);
    }
    const estimatedCostsBps = Decimal(dexPriceImpactBps)
      .add(cexSlippageBps)
      .add(10)
      .add(30)
      .add(gasBps);
    const direction =
      gapBps < estimatedCostsBps
        ? undefined
        : gap1.gt(gap2)
          ? "buy_cex_sell_dex"
          : "buy_dex_sell_cex";

    const executable = gapBps > estimatedCostsBps && inventoryOk;
    return {
      pair,
      timestamp: new Date(),
      dexPrice: Decimal(uniSwapPair.getExecutionPrice(dexBuyPrice, USDTToken)),
      cexBid: sellWalked.avgPrice,
      cexAsk: buyWalked.avgPrice,
      gapBps,
      direction,
      estimatedCostsBps,
      estimatedNetPnlBps: gapBps.sub(estimatedCostsBps),
      inventoryOk,
      executable, // gap > costs AND inventory available
      details: {
        dexPriceImpactBps: Decimal(dexPriceImpactBps),
        cexSlippageBps,
        cexFeeBps: Decimal(10),
        dexFeeBps: Decimal(30),
        gasCostUsd: dexGas,
        gasBps,
      },
    };
  }
}

async function main() {
  dotenv.config();
  const size = Number.parseFloat(parseArg("--size")!);
  const cc = new ChainClient("http://127.0.0.1:8545");
  const pe = new PricingEngine(
    cc,
    "http://127.0.0.1:8545",
    process.env.INFURA_WS_RPC!,
  );
  const exchangeClient = await ExchangeClient.fromConfig(BINANCE_CONFIG);
  const inventoryTracker = new InventoryTracker();
  const pnlEngine = new PnLEngine();
  const arbChecker = new ArbChecker(
    pe,
    exchangeClient,
    inventoryTracker,
    pnlEngine,
  );
  const checked = await arbChecker.check("ETH/USDT", size);
  if (checked.direction === undefined) {
    console.log("No profitable price gap found");
    return;
  }
  console.log(`═`.repeat(65));
  console.log(`ARB CHECK: $ETH/USDT (size: ${size} ETH)`);
  console.log(`═`.repeat(65));
  console.log("Prices:");

  if (checked.direction === "buy_cex_sell_dex") {
    console.log(
      `   Binance ask:      $${checked.cexAsk.toDecimalPlaces(2)} (buy ${size} ETH)`,
    );
    console.log(`   Uniswap V2:      $${checked.dexPrice.toDecimalPlaces(2)}`);

    console.log(
      `Gap: $${checked.dexPrice.sub(checked.cexAsk).toDecimalPlaces(2)} (${checked.gapBps.toDecimalPlaces(2)} bps)`,
    );
  } else {
    console.log(
      `   Uniswap V2:      $${checked.dexPrice.toDecimalPlaces(2)} (buy ${size} ETH)`,
    );
    console.log(`   Binance bid:      $${checked.cexBid.toDecimalPlaces(2)}`);
    console.log(
      `Gap: $${checked.cexBid.sub(checked.dexPrice).toDecimalPlaces(2)} (${checked.gapBps.toDecimalPlaces(2)} bps)`,
    );
  }

  console.log("Costs:");
  console.log(` DEX fee:           ${checked.details.dexFeeBps} bps`);
  console.log(` DEX price impact:  ${checked.details.dexPriceImpactBps} bps`);
  console.log(` CEX fee:           ${checked.details.cexFeeBps} bps`);
  console.log(` CEX slippage:      ${checked.details.cexSlippageBps} bps`);
  console.log(
    ` Gas:               $${checked.details.gasCostUsd} (${checked.details.gasBps.toDecimalPlaces(2)} bps)`,
  );
  console.log("─".repeat(65));
  console.log(`   Total costs:       ${checked.estimatedCostsBps} bps`);

  console.log(
    `Net PnL estimate: ${checked.estimatedNetPnlBps.toDecimalPlaces(2)} bps ${checked.estimatedNetPnlBps.gt(0) ? "✅ Profitable" : "❌ NOT PROFITABLE"}`,
  );

  console.log("Inventory:");
  if (checked.direction === "buy_dex_sell_cex") {
    console.log(
      `Wallet USDT:  ${arbChecker.inventoryTracker.getAvailable(Venue.WALLET, "USDT")} (need ~${checked.dexPrice.mul(size).toDecimalPlaces(2)}) ${arbChecker.inventoryTracker.getAvailable(Venue.WALLET, "USDT").gt(checked.dexPrice.mul(size)) ? "✅" : "❌"}`,
    );

    console.log(
      `BINANCE ETH:  ${arbChecker.inventoryTracker.getAvailable(Venue.BINANCE, "ETH")} (need ${size}) ${arbChecker.inventoryTracker.getAvailable(Venue.BINANCE, "ETH").gte(size) ? "✅" : "❌"}`,
    );
  } else {
    console.log(
      `BINANCE USDT:  ${arbChecker.inventoryTracker.getAvailable(Venue.BINANCE, "USDT")} (need ~${checked.cexAsk.mul(size).toDecimalPlaces(2)}) ${arbChecker.inventoryTracker.getAvailable(Venue.BINANCE, "USDT").gt(checked.dexPrice.mul(size)) ? "✅" : "❌"}`,
    );
    console.log(
      `WALLET ETH:  ${arbChecker.inventoryTracker.getAvailable(Venue.WALLET, "ETH")} (need ${size}) ${arbChecker.inventoryTracker.getAvailable(Venue.WALLET, "ETH").gte(size) ? "✅" : "❌"}`,
    );
  }

  console.log(`Verdict: ${checked.executable ? "Execute" : "SKIP"}`);
  console.log("═".repeat(65));
}
main().catch((err) => console.error(err));
