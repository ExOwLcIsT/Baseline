import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
import CanonicalSerializer from "../core/CanonicalSerializer.js";
import ChainClient from "../chain/ChainClient.js";
import Address from "../core/BaseTypes/Address.js";

dotenv.config();

secp.hashes.sha256 = (msg: Uint8Array) =>
  createHash("sha256").update(msg).digest();

secp.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = createHmac("sha256", key);
  for (const m of msgs) h.update(m);
  return h.digest();
};
const wallet = WalletManager.from_env();

console.log(wallet);

//console.log(wallet.sign_message("Hello eth!"));

console.log(CanonicalSerializer.verify_determinism(wallet, 100000));

const cc = new ChainClient();

const balance = await cc.get_balance(Address.fromString(wallet.address));
const nonce = await cc.get_nonce(Address.fromString(wallet.address));
const gasPrice = await cc.get_gas_price();
console.log("Balance: " + balance + " ETH");
console.log("Nonce: " + nonce);
console.log("GasPrice: " + gasPrice);
