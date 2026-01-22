import { TokenAmount } from "./TokenAmount.js";
export class TransactionReceipt {
    txHash;
    blockNumber;
    status;
    gasUsed;
    effectiveGasPrice;
    logs;
    constructor(params) {
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
    get txFee() {
        return TokenAmount.fromRaw(this.gasUsed * this.effectiveGasPrice, 18, "ETH");
    }
    /**
     * Parse receipt from web3/ethers result
     */
    static fromWeb3(receipt) {
        const toBigInt = (v) => BigInt(v);
        return new TransactionReceipt({
            txHash: receipt.transactionHash,
            blockNumber: Number(receipt.blockNumber),
            status: Boolean(Number(receipt.status)),
            gasUsed: toBigInt(receipt.gasUsed),
            effectiveGasPrice: toBigInt(receipt.effectiveGasPrice),
            logs: receipt.logs ?? [],
        });
    }
}
