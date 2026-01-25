import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
import ChainClient from "../chain/ChainClient.js";
import { Address } from "../core/BaseTypes/Address.js";
import TokenAmount from "../core/BaseTypes/TokenAmount.js";
import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest.js";

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

// ChainClient connects to sepolia.infura.io
const cc = new ChainClient();

// Check balance
const balance = await cc.getBalance(Address.fromString(wallet.address));
console.log("Balance: " + balance + " ETH");

const testAddress = "0x6fd2Dc35ABb024E713fce658f9B811705106e461";

const nonce = await cc.getNonce(Address.fromString(wallet.address));
const gasPrice = await cc.getGasPrice();
console.log("Nonce: " + nonce);
console.log("GasPrice: " + gasPrice);
const txParams = {
  to: Address.fromString(testAddress),
  value: TokenAmount.fromRaw(BigInt(1), 18, "."),
  data: new Uint8Array([]),
  nonce: nonce,
  gasLimit: 21000,
  maxFeePerGas: gasPrice.getMaxFee(),
  maxPriorityFee: gasPrice.priorityFeeHigh,
  chainId: 11155111,
};
const tx = new CustomTransactionRequest(txParams);

const estimatedGas = await cc.estimateGas(tx);
console.log("Estimated gas: " + estimatedGas);

const signedTx = await wallet.signTransaction(tx);

const txHash = await cc.sendTransaction(signedTx);

const receipt = await cc.waitForReceipt(txHash);

console.log(receipt);
