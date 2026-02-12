import { Address } from "./Address.js";
import { TokenAmount, TxDict } from "./TokenAmount.js";
export class CustomTransactionRequest {
  to: Address;
  value: TokenAmount;
  data: string;

  nonce?: number;
  gasLimit?: number;
  maxFeePerGas?: bigint;
  maxPriorityFee?: bigint;

  chainId: number;

  constructor(params: {
    to: Address;
    value: TokenAmount;
    data?: string;
    nonce?: number;
    gasLimit?: number;
    maxFeePerGas?: bigint;
    maxPriorityFee?: bigint;
    chainId?: number;
  }) {
    this.to = params.to;
    this.value = params.value;
    this.data = params.data ?? "";

    this.nonce = params.nonce;
    this.gasLimit = params.gasLimit;
    this.maxFeePerGas = params.maxFeePerGas;
    this.maxPriorityFee = params.maxPriorityFee;

    this.chainId = params.chainId ?? 1;
  }

  // convert to ethers compatible
  toDict(): TxDict {
    return {
      to: this.to.checksum,
      value: this.value.raw.toString(),
      data: this.data,

      nonce: this.nonce,
      gasLimit: this.gasLimit,
      maxFeePerGas: this.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: this.maxPriorityFee?.toString(),
      chainId: this.chainId,
    };
  }
}
