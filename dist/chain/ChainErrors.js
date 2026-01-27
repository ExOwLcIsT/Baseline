export class ChainError extends Error {
    //Base class for chain errors.
    constructor(message) {
        super(message);
        this.name = "ChainError";
    }
}
export class RPCError extends ChainError {
    code;
    //RPC request failed.
    constructor(message = "RPC Error", code) {
        super(message);
        this.code = code;
    }
}
export class TransactionFailed extends ChainError {
    // Transaction reverted.
    txHash;
    receipt;
    constructor(txHash, receipt) {
        super(`Transaction ${txHash} reverted`);
        this.txHash = txHash;
        this.receipt = receipt;
    }
}
export class InsufficientFunds extends ChainError {
    constructor(message = "Insufficient funds for transaction") {
        super(message);
        this.name = "InsufficientFunds";
    }
}
export class NonceTooLow extends ChainError {
    constructor(message = "Nonce already used") {
        super(message);
        this.name = "NonceTooLow";
    }
}
export class ReplacementUnderpriced extends ChainError {
    constructor(message = "Replacement transaction gas too low") {
        super(message);
        this.name = "ReplacementUnderpriced";
    }
}
