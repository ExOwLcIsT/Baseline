import { TokenAmount } from "./TokenAmount.js";
export class CustomTransactionReceipt {
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
     * Parse receipt from ethers result
     */
    static fromEther(receipt) {
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
