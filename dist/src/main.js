import WalletManager from "../core/WalletManager.js";
import * as dotenv from "dotenv";
dotenv.config();
const wallet = WalletManager.generate();
console.log(wallet);
