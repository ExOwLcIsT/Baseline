import { Address } from "./Address.js";
import { TokenAmount, TxDict } from "./TokenAmount.js";
export class CustomTransactionRequest {
  readonly to: Address;
  readonly value: TokenAmount;
  readonly data: Uint8Array;

  readonly nonce?: number;
  readonly gasLimit?: number;
  readonly maxFeePerGas?: bigint;
  readonly maxPriorityFee?: bigint;

  readonly chainId: number;

  constructor(params: {
    to: Address;
    value: TokenAmount;
    data?: Uint8Array;
    nonce?: number;
    gasLimit?: number;
    maxFeePerGas?: bigint;
    maxPriorityFee?: bigint;
    chainId?: number;
  }) {
    this.to = params.to;
    this.value = params.value;
    this.data = params.data ?? new Uint8Array();

    this.nonce = params.nonce;
    this.gasLimit = params.gasLimit;
    this.maxFeePerGas = params.maxFeePerGas;
    this.maxPriorityFee = params.maxPriorityFee;

    this.chainId = params.chainId ?? 1;

    Object.freeze(this);
  }
  // convert to web3/ethers compatible
  toDict(): TxDict {
    return {
      to: this.to.checksum,
      value: this.value.raw.toString(),
      data: Buffer.from(this.data).toString("hex"),

      nonce: this.nonce,
      gasLimit: this.gasLimit,
      maxFeePerGas: this.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: this.maxPriorityFee?.toString(),
      chainId: this.chainId,
    };
  }
}
export default TransactionRequest;
