import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest.js";
import { Address } from "../core/BaseTypes/Address.js";
import WalletManager from "../core/WalletManager.js";
import ChainClient from "./ChainClient.js";
import TokenAmount from "../core/BaseTypes/TokenAmount.js";
import { CustomTransactionReceipt } from "../core/BaseTypes/TransactionReceipt.js";

export class TransactionBuilder {
  /*
    Fluent builder for transactions.

    Usage:
        const tx = (TransactionBuilder(client, wallet)
            .to(recipient)
            .value(TokenAmount.fromHuman("0.1", 18))
            .data(calldata)
            .withGasEstimate()
            .withGasPrice("high")
            .build())
    */

  static readonly transactionGasLimit = 21_000;

  private readonly client: ChainClient;
  private readonly wallet: WalletManager;
  private params = {} as {
    to: Address;
    value: TokenAmount;
    data?: Uint8Array;
    nonce?: number;
    gasLimit?: number;
    maxFeePerGas?: bigint;
    maxPriorityFee?: bigint;
    chainId?: number;
  };
  constructor(client: ChainClient, wallet: WalletManager) {
    this.client = client;
    this.wallet = wallet;
    this.reset();
  }
  reset() {
    this.params = {} as {
      to: Address;
      value: TokenAmount;
      data?: Uint8Array;
      nonce?: number;
      gasLimit?: number;
      maxFeePerGas?: bigint;
      maxPriorityFee?: bigint;
      chainId?: number;
    };
  }
  to(address: Address): TransactionBuilder {
    this.params.to = address;
    return this;
  }

  value(amount: TokenAmount): TransactionBuilder {
    this.params.value = amount;
    return this;
  }

  data(calldata: Uint8Array): TransactionBuilder {
    this.params.data = calldata;
    return this;
  }
  nonce(nonce: number): TransactionBuilder {
    this.params.nonce = nonce;
    return this;
  }
  gasLimit(limit: number): TransactionBuilder {
    this.params.gasLimit = limit;
    return this;
  }
  async withGasEstimate(buffer: number = 1.2): Promise<this> {
    const tx = new CustomTransactionRequest(this.params as any);

    const estimated = await this.client.estimateGas(tx);

    this.params.gasLimit = Math.ceil(Number(estimated) * buffer);

    return this;
  }

  async withGasPrice(
    priority: "low" | "medium" | "high" = "medium",
  ): Promise<this> {
    const gas = await this.client.getGasPrice();

    let tip: bigint;

    switch (priority) {
      case "low":
        tip = gas.priorityFeeLow;
        break;
      case "high":
        tip = gas.priorityFeeHigh;
        break;
      default:
        tip = gas.priorityFeeMedium;
    }

    this.params.maxPriorityFee = tip;
    this.params.maxFeePerGas = gas.getMaxFee();

    return this;
  }
  build(): CustomTransactionRequest {
    //Validate and return transaction request.

    if (!this.params.to) throw Error("Missing 'to'");
    if (!this.params.value) throw Error("Missing 'value'");

    const tx = new CustomTransactionRequest(this.params);
    return tx;
  }
  async buildAndSign(): Promise<string> {
    // Build, sign, and return ready-to-send transaction
    const tx = this.build();
    const signedTx = await this.wallet.signTransaction(tx);
    return signedTx;
  }

  async send(): Promise<string> {
    //Build, sign, send, return tx hash.
    const signedTx = await this.buildAndSign();
    const res = await this.client.sendTransaction(signedTx);
    return res;
  }
  async sendAndWait(
    timeout: number = 120,
  ): Promise<CustomTransactionReceipt | null> {
    // Build, sign, send, wait for confirmation.
    const tx_hash = await this.send();
    const res = await this.client.waitForReceipt(tx_hash, timeout);
    return res;
  }
}
