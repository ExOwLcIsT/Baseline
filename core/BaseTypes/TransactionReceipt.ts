import { Log, TransactionReceipt } from "ethers";
import { TokenAmount } from "./TokenAmount.js";

export interface Web3Receipt {
  transactionHash: string;
  blockNumber: number;
  status: boolean | string | number;
  gasUsed: bigint | number | string;
  effectiveGasPrice: bigint | number | string;
  logs: unknown[];
}

export class CustomTransactionReceipt {
  public readonly txHash: string;
  public readonly blockNumber: number;
  public readonly status: boolean;
  public readonly gasUsed: bigint;
  public readonly effectiveGasPrice: bigint;
  public logs: readonly Log[];

  constructor(params: {
    txHash: string;
    blockNumber: number;
    status: boolean;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs?: readonly Log[];
  }) {
    this.txHash = params.txHash;
    this.blockNumber = params.blockNumber;
    this.status = params.status;
    this.gasUsed = params.gasUsed;
    this.effectiveGasPrice = params.effectiveGasPrice;
    this.logs = params.logs ?? [];
  }

  /**
   * Transaction fee in wei as TokenAmount
   * fee = gasUsed * effectiveGasPrice
   */
  get txFee(): TokenAmount {
    return TokenAmount.fromRaw(
      this.gasUsed * this.effectiveGasPrice,
      18,
      "ETH",
    );
  }

  /**
   * Parse receipt from ethers result
   */
  static fromEther(
    receipt: TransactionReceipt | null,
  ): CustomTransactionReceipt | null {
    if (receipt === null) {
      return null;
    }
    return new CustomTransactionReceipt({
      txHash: receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      status: Boolean(Number(receipt.status)),
      gasUsed: BigInt(receipt.gasUsed),
      effectiveGasPrice: BigInt(receipt.gasPrice),
      logs: receipt.logs ?? [],
    });
  }
}
