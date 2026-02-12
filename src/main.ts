import * as dotenv from "dotenv";
import "dotenv/config";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
// import ExchangeClient from "../exchange/ExchangeClient.js";
// import OrderBookAnalyzer from "../exchange/OrderBookAnalyzer.js";
// import { BINANCE_CONFIG } from "../configs/Binance_config.js";
// import InventoryTracker, { Venue } from "../inventory/Tracker.js";
import PricingEngine from "../pricing/PricingEngine.js";
import { Address } from "../core/BaseTypes/Address.js";
import Token from "../pricing/Token.js";
import ChainClient from "../chain/ChainClient.js";
import { Decimal } from "decimal.js";
dotenv.config();

// Hashes configuration
export function initCrypto() {
  secp.hashes.sha256 = (msg) => createHash("sha256").update(msg).digest();

  secp.hashes.hmacSha256 = (key, ...msgs) => {
    const h = createHmac("sha256", key);
    for (const m of msgs) h.update(m);
    return h.digest();
  };
}
initCrypto();
// Creating wallet from environment
//const wallet = WalletManager.fromEnv();
//console.log(wallet.address);
//ChainClient connects to sepolia.infura.io
const cc = new ChainClient();

// const nonce = await cc.getNonce(Address.fromString(wallet.address));

// console.log(nonce);
const USDCToken = new Token(
  "USDC",
  10n ** 6n,
  Address.fromString("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
);
const ETHToken = new Token(
  "WETH",
  10n ** 18n,
  Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
);
// const USDToken = new Token(
//   "USDT",
//   10n ** 6n,
//   Address.fromString("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
// );
// const SHIB = new Token(
//   "SHIB",
//   10n ** 18n,
//   Address.fromString("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
// );

// const uni = new UniswapV2Pair(
//   ETHToken,
//   USDToken,
//   BigInt(1000 * 10 ** 18),
//   BigInt(2000000 * 10 ** 6),
// );
// const uni1 = new UniswapV2Pair(
//   USDCToken,
//   USDToken,
//   BigInt(2000000 * 10 ** 6),
//   BigInt(2000000 * 10 ** 6),
// );
// console.log(
//   "Amount out for 10_000 USDC: " +
//     uni.getAmountOut(10_000n * 10n ** 6n, USDCToken) +
//     " wei",
// );
// console.log(
//   "Amount in for 1128017927007915696 wei: " +
//     uni.getAmountIn(1128017927007915696n, ETHToken),
// );
// console.log("Spot price of USDC: " + uni.getSpotPrice(USDCToken));
// console.log(
//   "Execution price of USDC: " +
//     uni.getExecutionPrice(10_000n * 10n ** 6n, USDCToken),
// );
// console.log(
//   "Price impact: " + uni.getPriceImpact(10_000n * 10n ** 6n, USDCToken) + "%",
// );

// console.log(
//   "Simulated swap: ",
//   uni.simulateSwap(10_000n * 10n ** 6n, USDCToken),
// );
// console.log(
//   "From chain ",
//   await UniswapV2Pair.fromChain(
//     Address.fromString("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
//     cc,
//   ),
// );

//const price_impact_analyzer = new PriceImpactAnalyzer(uni);

//console.log(price_impact_analyzer.generateImpactTable("ETH", [1, 2, 3, 4, 5]));

// const route = new Route([uni, uni1], [ETHToken, USDCToken, USDToken]);
// console.log("Route out: " + route.getOutput(1n * 10n ** 18n));
// console.log(
//   "Route imtermediate outs: " + route.getIntermediateAmounts(1n * 10n ** 18n),
// );

// const monitor = new MempoolMonitor(process.env.INFURA_WS_RPC!, (swap) => {
//   console.log("Swap detected:", swap);
//   console.log(`Detected swap: ${swap.dex} ${swap.method}`);
//   console.log(`${swap.amountIn} → min ${swap.minAmountOut}`);
//   console.log(` Slippage tolerance: ${swap.slippageTolerance}`);
// });

// await monitor.start();

const engine = new PricingEngine(
  cc,
  "http://127.0.0.1:8545",
  process.env["INFURA_WS_RPC"]!,
  Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
);
await engine.loadPools([
  Address.fromString("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"), // WETH/USDC
  //Address.fromString("0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852"), //WETH/USDT
  Address.fromString("0x3041cbd36888becc7bbcbc0045e3b1f144466f5f"), // USDC/USDT
]);

await engine.swap(new Decimal(0.1), ETHToken, USDCToken);
//const quote = await engine.getQuote(ETHToken, USDToken, 2n * 10n ** 18n, 0n);

// const quote = await engine.getQuote(
//   ETHToken,
//   USDToken,
//   1_000_000_000_000n,
//   0n,
//   Address.fromString("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
// );
// console.log(quote);

//engine.monitor.start();

// const cl = await ExchangeClient.fromConfig(BINANCE_CONFIG);
// const book = await cl.fetchOrderBook("ETH/USDT");
// const analyzer = new OrderBookAnalyzer(book);
// //console.log(analyzer.walkTheBook("buy", new Decimal(110)));
// const balance = await cl.fetchBalance();
// analyzer.imbalance();
// const it = new InventoryTracker();
// it.updateFromCex(Venue.BINANCE, balance);
// console.log(it.snapshot());
