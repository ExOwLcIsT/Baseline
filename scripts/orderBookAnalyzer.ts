import { Decimal } from "decimal.js";
import { BINANCE_CONFIG } from "../configs/Binance_config.js";
import ExchangeClient from "../exchange/ExchangeClient.js";
import OrderBookAnalyzer from "../exchange/OrderBookAnalyzer.js";

function parseArg(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(flag + "="));
  return arg?.split("=")[1];
}
async function main() {
  const symbol = process.argv[2];
  const depth = Number(parseArg("--depth"));

  const client = await ExchangeClient.fromConfig(BINANCE_CONFIG);
  const orderBook = await client.fetchOrderBook(symbol, depth);
  if (!orderBook) return;
  const analyzer = new OrderBookAnalyzer(orderBook);

  console.log("=".repeat(65));
  console.log(symbol + " Order Book Analyzer");
  const today = new Date();
  console.log(
    "Timestamp: " +
      (!isNaN(orderBook.timestamp) ? orderBook.timestamp : today.toISOString()),
  );
  console.log("=".repeat(65));
  const asset = symbol.split("/")[0];
  console.log(
    "Best Bid: $" +
      orderBook.bestBid[0] +
      " x " +
      orderBook.bestBid[1] +
      " " +
      asset,
  );
  console.log(
    "Best Ask: $" +
      orderBook.bestAsk[0] +
      " x " +
      orderBook.bestAsk[1] +
      " " +
      asset,
  );
  console.log("Mid Price: $" + orderBook.midPrice);
  console.log(
    "Spread:    $" + orderBook.spread + ` (${orderBook.spreadBps}bps)`,
  );

  console.log("=".repeat(65));

  console.log("Depth (within 10 bps):");
  const bids = analyzer.depthAtBps("bid", 10);
  const bidsCost = analyzer.walkTheBook("sell", bids);
  console.log(`    Bids: ${bids} ${asset} ($${bidsCost.totalCost})`);
  const asks = analyzer.depthAtBps("bid", 10);
  const asksCost = analyzer.walkTheBook("buy", bids);
  console.log(`    Asks: ${asks}  ${asset} ($${asksCost.totalCost})`);
  const imbalance = analyzer.imbalance(10);
  console.log(
    `Imbalance: ${imbalance} (${imbalance === 0 ? "no" : "slight " + (imbalance > 0 ? "bid" : "ask")} pressure)`,
  );

  console.log("=".repeat(65));

  console.log("BUY 2");
  const buy2 = analyzer.walkTheBook("buy", new Decimal(2));

  console.log(`Avg price:  $${buy2.avgPrice}`);
  console.log(`Slippage:   ${buy2.slippageBps} bps`);
  console.log(`Levels:     ${buy2.levelsConsumed}`);

  console.log("BUY 10");
  const buy10 = analyzer.walkTheBook("buy", new Decimal(10));

  console.log(`Avg price:  $${buy10.avgPrice}`);
  console.log(`Slippage:   ${buy10.slippageBps} bps`);
  console.log(`Levels:     ${buy10.levelsConsumed}`);

  console.log("=".repeat(65));

  console.log(
    `Effective spread (2): ${analyzer.effectiveSpread(new Decimal(2))}bps`,
  );
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
