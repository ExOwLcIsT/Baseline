import os
from secrets import token_hex
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_account.datastructures import SignedMessage
from eth_account.datastructures import SignedTransaction

from core.base_types import TransactionRequest


class WalletManager:
    """
    Manages wallet operations: key loading, signing, verification.

    Keys can be loaded from:
    - Environment variable
    - Encrypted keyfile (optional stretch goal)

    CRITICAL: Private key must never appear in logs, errors, or string representations.
    """

    def __init__(self, wallet: Account):
        self.wallet = wallet

    @classmethod
    def from_env(cls, env_var: str = "PRIVATE_KEY") -> "WalletManager":
        """Load private key from environment variable."""
        key = os.getenv(env_var)
        if not key:
            raise Exception(f"{env_var} not found")

        wallet = Account.from_key(key)
        walletManager = WalletManager(wallet)
        return walletManager

    @classmethod
    def generate(cls) -> "WalletManager":
        """Generate a new random wallet. Returns manager + displays private key ONCE."""
        private_key = token_hex(32)
        print("Private key: " + private_key)
        wallet = Account.from_key(private_key)
        walletManager = WalletManager(wallet)
        return walletManager

    @property
    def address(self) -> str:
        """Returns checksummed address."""
        return self.wallet.address

    def sign_message(self, message: str) -> SignedMessage:
        """Sign an arbitrary message (with EIP-191 prefix)."""
        if not message:
            raise ValueError("Can not sign empty message")
        message = encode_defunct(text=message)
        signed = self.wallet.sign_message(message)
        recovered = Account.recover_message(
            message, (signed.v, signed.r, signed.s), signed.signature
        )
        if recovered != self.wallet.address:
            raise Exception("Signature verification failed!")
        return signed

    def sign_typed_data(self, domain: dict, types: dict, value: dict) -> SignedMessage:
        """Sign EIP-712 typed data (used by many DeFi protocols)."""
        message = self.wallet.sign_typed_data(
            domain_data=domain, message_types=types, message_data=value
        )

        return message

    def sign_transaction(self, tx: TransactionRequest) -> SignedTransaction:
        """Sign a transaction dict."""
        # Sign
        signed: SignedTransaction = self.wallet.sign_transaction(tx.to_dict())

        # Verify before sending (optional but recommended)
        recovered = Account.recover_transaction(signed.raw_transaction)
        if not recovered == self.wallet.address:
            raise Exception("Bad signing")
        return signed

    def __repr__(self) -> str:
        """MUST NOT expose private key."""
        return f"WalletManager(address={self.address})"
