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
  public readonly logs: unknown[];

  constructor(params: {
    txHash: string;
    blockNumber: number;
    status: boolean;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs?: unknown[];
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
   * Parse receipt from web3/ethers result
   */
  static fromWeb3(receipt: Web3Receipt): CustomTransactionReceipt {
    const toBigInt = (v: bigint | number | string) => BigInt(v);

    return new CustomTransactionReceipt({
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      status: Boolean(Number(receipt.status)),
      gasUsed: toBigInt(receipt.gasUsed),
      effectiveGasPrice: toBigInt(receipt.effectiveGasPrice),
      logs: receipt.logs ?? [],
    });
  }
}