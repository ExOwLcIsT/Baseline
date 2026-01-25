import { CustomTransactionRequest } from "../core/BaseTypes/TransactionRequest.js";
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
    static transactionGasLimit = 21_000;
    client;
    wallet;
    params = {};
    constructor(client, wallet) {
        this.client = client;
        this.wallet = wallet;
        this.reset();
    }
    reset() {
        this.params = {};
    }
    to(address) {
        this.params.to = address;
        return this;
    }
    value(amount) {
        this.params.value = amount;
        return this;
    }
    data(calldata) {
        this.params.data = calldata;
        return this;
    }
    nonce(nonce) {
        this.params.nonce = nonce;
        return this;
    }
    gasLimit(limit) {
        this.params.gasLimit = limit;
        return this;
    }
    async withGasEstimate(buffer = 1.2) {
        const tx = new CustomTransactionRequest(this.params);
        const estimated = await this.client.estimateGas(tx);
        this.params.gasLimit = Math.ceil(Number(estimated) * buffer);
        return this;
    }
    async withGasPrice(priority = "medium") {
        const gas = await this.client.getGasPrice();
        let tip;
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
    build() {
        //Validate and return transaction request.
        if (!this.params.to)
            throw Error("Missing 'to'");
        if (!this.params.value)
            throw Error("Missing 'value'");
        const tx = new CustomTransactionRequest(this.params);
        return tx;
    }
    async buildAndSign() {
        // Build, sign, and return ready-to-send transaction
        const tx = this.build();
        const signedTx = await this.wallet.signTransaction(tx);
        return signedTx;
    }
    async send() {
        //Build, sign, send, return tx hash.
        const signedTx = await this.buildAndSign();
        const res = await this.client.sendTransaction(signedTx);
        return res;
    }
    async sendAndWait(timeout = 120) {
        // Build, sign, send, wait for confirmation.
        const tx_hash = await this.send();
        const res = await this.client.waitForReceipt(tx_hash, timeout);
        return res;
    }
}
