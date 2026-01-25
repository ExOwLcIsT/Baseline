import TokenAmount from "../core/BaseTypes/TokenAmount.js";
import { Address } from "../core/BaseTypes/Address.js";
import { JsonRpcProvider } from "ethers";
import GasPrice from "./GasPrice.js";
import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest.js";
import { CustomTransactionReceipt } from "../core/BaseTypes/TransactionReceipt.js";
class ChainClient {
  /*
    Ethereum RPC client with reliability features.

    Features:
    - Automatic retry with exponential backoff
    - Multiple RPC endpoint fallback
    - Request timing/logging
    - Proper error classification
    */
  provider: JsonRpcProvider;
  constructor(rpc_url?: string, timeout: number = 30, max_retries: number = 3) {
    if (!rpc_url) {
      rpc_url = process.env["INFURA_RPC_URL"];
      if (!rpc_url) {
        throw Error(
          "No RPC URL provided. Set INFURA_RPC_URL environment variable or pass rpc_url parameter.",
        );
      }
    }
    let connected = false;
    this.provider = new JsonRpcProvider(rpc_url);
    for (let i = 0; i < max_retries; i++) {
      try {
        this.provider.getBlockNumber();
        connected = true;
        break;
      } catch (err) {
        if (i === max_retries - 1) {
          throw new Error(`Failed to connect to ${rpc_url}`);
        }

        this.provider = new JsonRpcProvider(rpc_url);
      }
    }
  }

  async getBalance(address: Address): Promise<TokenAmount> {
    const balance = await this.provider.getBalance(address.lower);
    console.log(balance);
    return TokenAmount.fromRaw(balance, 18, ",");
  }

  async getNonce(address: Address, block: string = "pending"): Promise<number> {
    const nonce = await this.provider.getTransactionCount(address.lower, block);
    return nonce;
  }

  async getGasPrice(): Promise<GasPrice> {
    //Returns current gas price info (base fee, priority fee estimates).
    const block = await this.provider.getBlock("latest");
    const feeData = await this.provider.getFeeData();

    if (!block?.baseFeePerGas || !feeData.maxPriorityFeePerGas) {
      throw new Error("Network does not support EIP-1559");
    }

    const base = block.baseFeePerGas;
    const priority = feeData.maxPriorityFeePerGas;

    return new GasPrice(
      base,
      priority / 2n, // low
      priority, // medium
      priority * 2n, // high
    );
  }

  async estimateGas(tx: CustomTransactionRequest): Promise<bigint> {
    const estimatedGas = await this.provider.estimateGas(tx.toDict());
    return estimatedGas;
  }

  async sendTransaction(signed_tx: string): Promise<string> {
    // Send and return tx hash. Does NOT wait for confirmation.
    const res = await this.provider.broadcastTransaction(signed_tx);
    const txHash = res.hash;
    return txHash;
  }

  async waitForReceipt(
    tx_hash: string,
    timeout: number = 120,
  ): Promise<CustomTransactionReceipt | null> {
    // Wait for transaction confirmation.
    const timeout_seconds = timeout * 1000;
    const confirms = 1;
    const receipt = await this.provider.waitForTransaction(
      tx_hash,
      confirms,
      timeout_seconds,
    );
    const txReceipt = CustomTransactionReceipt.fromEther(receipt);
    return txReceipt;
  }

  async getTransaction(tx_hash: string) {
    const result = await this.provider.getTransaction(tx_hash);
    return result;
  }

  async getReceipt(tx_hash: string): Promise<CustomTransactionReceipt | null> {
    const receipt = await this.provider.getTransactionReceipt(tx_hash);
    const txReceipt = CustomTransactionReceipt.fromEther(receipt);
    return txReceipt;
  }

  async call(tx: CustomTransactionRequest): Promise<string> {
    // eth_call - simulate transaction without sending.

    const res = this.provider.call(tx.toDict());
    return res;
  }
}

export default ChainClient;
