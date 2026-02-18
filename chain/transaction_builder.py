import math
from chain.chain_client import ChainClient
from core.base_types import Address, TokenAmount, TransactionReceipt, TransactionRequest
from core.wallet import WalletManager

from eth_account.datastructures import SignedTransaction


class TransactionBuilder:
    """
    Fluent builder for transactions.

    Usage:
        tx = (TransactionBuilder(client, wallet)
            .to(recipient)
            .value(TokenAmount.from_human("0.1", 18))
            .data(calldata)
            .with_gas_estimate()
            .with_gas_price("high")
            .build())
    """

    params: dict

    def __init__(self, client: ChainClient, wallet: WalletManager):
        self.client: ChainClient = client
        self.wallet: WalletManager = wallet
        self.params = {}

    def to(self, address: Address) -> "TransactionBuilder":
        self.params["to"] = address
        return self

    def value(self, amount: TokenAmount) -> "TransactionBuilder":
        self.params["value"] = amount
        return self

    def data(self, calldata: bytes) -> "TransactionBuilder":
        self.params["data"] = calldata
        return self

    def nonce(self, nonce: int) -> "TransactionBuilder":
        """Explicit nonce (for replacement or batch)."""
        self.params["nonce"] = nonce
        return self

    def chain_id(self, number: int) -> "TransactionBuilder":
        """Explicit nonce (for replacement or batch)."""
        self.params["chain_id"] = number
        return self

    def gas_limit(self, limit: int) -> "TransactionBuilder":
        self.params["gas_limit"] = limit
        return self

    def with_gas_estimate(self, buffer: float = 1.2) -> "TransactionBuilder":
        """Estimate gas and set limit with buffer."""
        tx = TransactionRequest(
            to=self.params["to"],
            value=self.params.get("value", TokenAmount(0, 0, ",")),
            data=self.params["data"],
            nonce=self.params["nonce"],
        )
        estimated = self.client.estimate_gas(tx)
        self.params["gas_limit"] = math.ceil(estimated * buffer)
        return self

    def with_gas_price(self, priority: str = "medium") -> "TransactionBuilder":
        """Set gas price based on current network conditions."""
        gas = self.client.get_gas_price()
        match priority:
            case "low":
                tip = gas.priority_fee_low
            case "high":
                tip = gas.priority_fee_high
            case _:
                tip = gas.priority_fee_medium

        self.params["max_priority_fee"] = tip
        self.params["max_fee_per_gas"] = gas.get_max_fee()
        return self

    def build(self) -> TransactionRequest:
        """Validate and return transaction request."""
        try:
            tx = TransactionRequest(
                to=self.params["to"],
                value=self.params["value"],
                data=self.params["data"],
                nonce=self.params["nonce"],
                gas_limit=self.params["gas_limit"],
                max_fee_per_gas=self.params["max_fee_per_gas"],
                max_priority_fee=self.params["max_priority_fee"],
                chain_id=self.params.get("chain_id",1),
            )
        except:
            return None
        return tx

    def build_and_sign(self) -> SignedTransaction:
        """Build, sign, and return ready-to-send transaction."""
        tx = self.build()
        signed_tx = self.wallet.sign_transaction(tx)
        return signed_tx

    def send(self) -> str:
        """Build, sign, send, return tx hash."""
        stx = self.build_and_sign()
        tx_hash = self.client.send_transaction(stx)
        return tx_hash

    def send_and_wait(self, timeout: int = 120) -> TransactionReceipt:
        """Build, sign, send, wait for confirmation."""
        tx_hash = self.send()
        tr = self.client.wait_for_receipt(tx_hash=tx_hash, timeout=timeout)
        return tr
