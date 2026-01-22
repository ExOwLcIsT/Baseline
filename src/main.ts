import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";

dotenv.config();

secp.hashes.sha256 = (msg: Uint8Array) =>
  createHash("sha256").update(msg).digest();

secp.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = createHmac("sha256", key);
  for (const m of msgs) h.update(m);
  return h.digest();
};
const wallet = WalletManager.generate();

console.log(wallet.address);

console.log(wallet.sign_message("Hello eth!"));
