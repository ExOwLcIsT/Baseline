import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
import * as secp from "@noble/secp256k1";
import { createHash, createHmac } from "crypto";
dotenv.config();
// Hashes configuration
secp.hashes.sha256 = (msg) => createHash("sha256").update(msg).digest();
secp.hashes.hmacSha256 = (key, ...msgs) => {
    const h = createHmac("sha256", key);
    for (const m of msgs)
        h.update(m);
    return h.digest();
};
// Creating wallet from environment
const wallet = WalletManager.fromEnv();
console.log(wallet.address);
// ChainClient connects to sepolia.infura.io
// const cc = new ChainClient();
// const nonce = await cc.getNonce(Address.fromString(wallet.address));
// console.log(nonce);
