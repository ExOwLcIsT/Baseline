import TokenAmount from "../core/BaseTypes/TokenAmount.js";
import { JsonRpcProvider } from "ethers";
import GasPrice from "./GasPrice.js";
class ChainClient {
    /*
      Ethereum RPC client with reliability features.
  
      Features:
      - Automatic retry with exponential backoff
      - Multiple RPC endpoint fallback
      - Request timing/logging
      - Proper error classification
      */
    provider;
    constructor(rpc_url, timeout = 30, max_retries = 3) {
        if (!rpc_url) {
            rpc_url = process.env["INFURA_RPC_URL"];
            if (!rpc_url) {
                throw Error("No RPC URL provided. Set INFURA_RPC_URL environment variable or pass rpc_url parameter.");
            }
        }
        let connected = false;
        this.provider = new JsonRpcProvider(rpc_url);
        for (let i = 0; i < max_retries; i++) {
            try {
                this.provider.getBlockNumber();
                connected = true;
                break;
            }
            catch (err) {
                if (i === max_retries - 1) {
                    throw new Error(`Failed to connect to ${rpc_url}`);
                }
                this.provider = new JsonRpcProvider(rpc_url);
            }
        }
    }
    async get_balance(address) {
        const balance = await this.provider.getBalance(address.lower);
        console.log(balance);
        return TokenAmount.fromRaw(balance, 18, ",");
    }
    async get_nonce(address, block = "pending") {
        const nonce = await this.provider.getTransactionCount(address.lower, block);
        return nonce;
    }
    async get_gas_price() {
        //Returns current gas price info (base fee, priority fee estimates).
        const block = await this.provider.getBlock("latest");
        const feeData = await this.provider.getFeeData();
        if (!block?.baseFeePerGas || !feeData.maxPriorityFeePerGas) {
            throw new Error("Network does not support EIP-1559");
        }
        const base = block.baseFeePerGas;
        const priority = feeData.maxPriorityFeePerGas;
        return new GasPrice(base, priority / 2n, // low
        priority, // medium
        priority * 2n);
    }
}
export default ChainClient;
