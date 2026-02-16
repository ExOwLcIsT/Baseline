from typing import Optional
from core.base_types import TransactionReceipt


class ChainException(Exception):

    # Base class for chain errors.
    def __init__(self, message: str):
        super(message)
        self.name = "ChainException"


class RPCException(ChainException):
    code: Optional[int]
    # RPC request failed.

    def __init__(self, message: str = "RPC Exception", code: Optional[int] = None):
        super(message)
        self.code = code


class TransactionFailed(ChainException):
    # Transaction reverted.
    txHash: str
    receipt: TransactionReceipt

    def __init__(self, txHash: str, receipt: TransactionReceipt):
        super(f"Transaction {txHash} reverted")
        self.txHash = txHash
        self.receipt = receipt


class InsufficientFunds(ChainException):
    def __init__(self, message="Insufficient funds for transaction"):
        super(message)
        self.name = "InsufficientFunds"


class NonceTooLow(ChainException):
    def __init__(self, message="Nonce already used"):
        super(message)
        self.name = "NonceTooLow"


class ReplacementUnderpriced(ChainException):
    def __init__(self, message="Replacement transaction gas too low"):
        super(message)
        self.name = "ReplacementUnderpriced"
