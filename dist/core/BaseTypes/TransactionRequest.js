export class CustomTransactionRequest {
    to;
    value;
    data;
    nonce;
    gasLimit;
    maxFeePerGas;
    maxPriorityFee;
    chainId;
    constructor(params) {
        this.to = params.to;
        this.value = params.value;
        this.data = params.data ?? new Uint8Array();
        this.nonce = params.nonce;
        this.gasLimit = params.gasLimit;
        this.maxFeePerGas = params.maxFeePerGas;
        this.maxPriorityFee = params.maxPriorityFee;
        this.chainId = params.chainId ?? 1;
    }
    // convert to ethers compatible
    toDict() {
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
