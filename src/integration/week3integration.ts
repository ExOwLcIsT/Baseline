import ExchangeClient from "../../exchange/ExchangeClient.js";
import PnLEngine from "../../inventory/PnL.js";
import InventoryTracker from "../../inventory/Tracker.js";
import PricingEngine from "../../pricing/PricingEngine.js";
// import { Address } from "../../core/BaseTypes/Address.js";
// import UniswapV2Pair from "../../pricing/AMM.js";
// import OrderBookAnalyzer from "../../exchange/OrderBookAnalyzer.js";
// import { Decimal } from "decimal.js";
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

  //   async check(pair: string): {
  //     pair: string;
  //     timestamp: Date;
  //     dexPrice: Decimal;
  //     cexBid: Decimal;
  //     cexAsk: Decimal;
  //     gapBps: Decimal;
  //     direction: "buy_dex_sell_cex" | "buy_cex_sell_dex" | undefined;
  //     estimatedCostsBps: Decimal;
  //     estimatedNetPnlBps: Decimal;
  //     inventoryOk: boolean;
  //     executable: boolean; // gap > costs AND inventory available
  //     details: {
  //       dexPriceImpactBps: Decimal;
  //       cexSlippageBps: Decimal;
  //       cexFeeBps: Decimal;
  //       dexFeeBps: Decimal;
  //       gasCostUsd: Decimal;
  //     };
  //   } {
  //     /*
  //           Full arb check for a trading pair.

  //           Flow:
  //           1. Get DEX price from pricing_engine (Week 2)
  //           2. Get CEX order book from exchange_client (Week 3)
  //           3. Compare prices, calculate gap
  //           4. Estimate all costs (fees, gas, slippage)
  //           5. Check inventory availability
  //           6. Return opportunity assessment

  //           Returns:
  //           {
  //               'pair': 'ETH/USDT',
  //               'timestamp': datetime,
  //               'dex_price': Decimal,
  //               'cex_bid': Decimal,
  //               'cex_ask': Decimal,
  //               'gap_bps': Decimal,
  //               'direction': 'buy_dex_sell_cex' | 'buy_cex_sell_dex' | None,
  //               'estimated_costs_bps': Decimal,
  //               'estimated_net_pnl_bps': Decimal,
  //               'inventory_ok': bool,
  //               'executable': bool,        # gap > costs AND inventory available
  //               'details': {
  //                   'dex_price_impact_bps': Decimal,
  //                   'cex_slippage_bps': Decimal,
  //                   'cex_fee_bps': Decimal,
  //                   'dex_fee_bps': Decimal,
  //                   'gas_cost_usd': Decimal,
  //               },
  //           }
  //           */
  //     this.pricingEngine.loadPools([
  //       Address.fromString(
  //         "0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d",
  //       ),
  //     ]);
  //     const uniSwapPair = await UniswapV2Pair.fromChain(
  //       Address.fromString(
  //         "0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d",
  //       ),
  //       this.pricingEngine.client,
  //     );
  //     const ETHToken =
  //       uniSwapPair.token0.name === "WETH"
  //         ? uniSwapPair.token0
  //         : uniSwapPair.token1;
  //     const USDCToken =
  //       uniSwapPair.token0.name === "USDC"
  //         ? uniSwapPair.token0
  //         : uniSwapPair.token1;
  //     const dexQuote = await this.pricingEngine.getQuote(
  //       ETHToken,
  //       USDCToken,
  //       1n * ETHToken.decimals,
  //       1n,
  //       Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
  //     );
  //     const dexPrice = Decimal(dexQuote.simulatedOutput).div(USDCToken.decimals);
  //     const book = await this.exchangeClient.fetchOrderBook(pair);
  //     const analyzer = new OrderBookAnalyzer(book);
  //     const buyWalked = analyzer.walkTheBook("buy", Decimal(1));
  //     const sellWalked = analyzer.walkTheBook("sell", Decimal(1));

  //     const direction = "buy_dex_sell_cex";
  //     return {
  //       pair,
  //       timestamp: new Date(),
  //       dexPrice,
  //       cexBid: sellWalked.avgPrice,
  //       cexAsk: buyWalked.avgPrice,
  //       gapBps: book.spreadBps,
  //       direction,
  //       estimatedCostsBps: Decimal,
  //       estimatedNetPnlBps: Decimal,
  //       inventoryOk: boolean,
  //       executable: boolean, // gap > costs AND inventory available
  //       details: {
  //         dexPriceImpactBps: Decimal,
  //         cexSlippageBps: Decimal,
  //         cexFeeBps: Decimal,
  //         dexFeeBps: Decimal,
  //         gasCostUsd: Decimal,
  //       },
  //     };
  //   }
}
