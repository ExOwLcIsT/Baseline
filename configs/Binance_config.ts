import * as dotenv from "dotenv";
import "dotenv/config"
dotenv.config();
export const BINANCE_CONFIG = {
  apiKey: process.env.BINANCE_TESTNET_API_KEY,
  secret: process.env.BINANCE_TESTNET_SECRET,
  sandbox: true,
  options: {
    defaultType: "spot",
  },
  enableRateLimit: true,
};


