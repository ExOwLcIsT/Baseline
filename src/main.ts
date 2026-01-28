import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
import { UniswapV2Pair } from "../pricing/AMM.js";
import { Address } from "../core/BaseTypes/Address.js";
import { Token } from "../pricing/Token.js";

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

// ChainClient connects to sepolia.infura.io
// const cc = new ChainClient();

// const nonce = await cc.getNonce(Address.fromString(wallet.address));

// console.log(nonce);
const USDCToken = new Token("USDC", BigInt(Math.pow(10, 6)));
const ETHToken = new Token("ETH", BigInt(Math.pow(10, 18)));
const uni = new UniswapV2Pair(
  Address.fromString(wallet.address),
  ETHToken,
  USDCToken,
  BigInt(1000),
  BigInt(2_000_000),
);
console.log(uni.getAmountOut(10_000, USDCToken));
console.log(uni.getAmountIn(BigInt(4960273038901078125n), ETHToken));
console.log(uni.getSpotPrice(USDCToken));
console.log(uni.getExecutionPrice(10_000, USDCToken));
console.log(uni.getPriceImpact(10_000, USDCToken));

console.log(uni.simulateSwap(10_000, USDCToken));
