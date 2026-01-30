import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
import UniswapV2Pair from "../pricing/AMM.js";
import { Address } from "../core/BaseTypes/Address.js";
import Token from "../pricing/Token.js";
import ChainClient from "../chain/ChainClient.js";
import MempoolMonitor from "../pricing/MempoolMonitor.js";
import Route from "../pricing/Route.js";
import PriceImpactAnalyzer from "../pricing/PriceImpactAnalyzer.js";

dotenv.config();

// Hashes configuration
secp.hashes.sha256 = (msg: Uint8Array) =>
  createHash("sha256").update(msg).digest();

secp.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = createHmac("sha256", key);
  for (const m of msgs) h.update(m);
  return h.digest();
};

// Creating wallet from environment
const wallet = WalletManager.fromEnv();

console.log(wallet.address);

//ChainClient connects to sepolia.infura.io
const cc = new ChainClient();

// const nonce = await cc.getNonce(Address.fromString(wallet.address));

// console.log(nonce);
const USDCToken = new Token("USDC", BigInt(Math.pow(10, 6)));
const ETHToken = new Token("ETH", BigInt(Math.pow(10, 18)));
const USDToken = new Token("USDT", BigInt(Math.pow(10, 6)));
const uni = new UniswapV2Pair(
  ETHToken,
  USDCToken,
  BigInt(1000 * 10 ** 18),
  BigInt(2000000 * 10 ** 6),
);
const uni1 = new UniswapV2Pair(
  USDCToken,
  USDToken,
  BigInt(2000000 * 10 ** 6),
  BigInt(2000000 * 10 ** 6),
);
console.log(
  "Amount out for 10_000 USDC: " + uni.getAmountOut(10_000, USDCToken) + " wei",
);
console.log(
  "Amount in for 1128017927007915696 wei: " +
    uni.getAmountIn(BigInt(1128017927007915696n), ETHToken),
);
console.log("Spot price of USDC: " + uni.getSpotPrice(USDCToken));
console.log(
  "Execution price of USDC: " + uni.getExecutionPrice(10_000, USDCToken),
);
console.log("Price impact: " + uni.getPriceImpact(10_000, USDCToken) + "%");

console.log("Simulated swap: ", uni.simulateSwap(10_000, USDCToken));
console.log(
  "From chain ",
  await UniswapV2Pair.fromChain(
    Address.fromString("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
    cc,
  ),
);

const price_impact_analyzer = new PriceImpactAnalyzer(uni);

console.log(price_impact_analyzer.generateImpactTable("ETH", [1, 2, 3, 4, 5]));

const route = new Route([uni, uni1], [ETHToken, USDCToken, USDToken]);
console.log(route.getOutput(1));
console.log(route.getIntermediateAmounts(1));

const monitor = new MempoolMonitor(process.env.INFURA_WS_RPC!, (swap) => {
  console.log("Swap detected:", swap);
  console.log(`Detected swap: ${swap.dex} ${swap.method}`);
  console.log(`${swap.amountIn} → min ${swap.minAmountOut}`);
  console.log(` Slippage tolerance: ${swap.slippageTolerance}`);
});

await monitor.start();
