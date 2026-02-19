from dataclasses import dataclass
import math
import os
from token import N_TOKENS
from typing import Optional
from web3 import Web3

from chain.chain_errors import RPCException
from core.base_types import Address, TokenAmount, TransactionReceipt, TransactionRequest
from pricing.token import Token


class ChainClient:
    """
    Ethereum RPC client with reliability features.

    Features:
    - Automatic retry with exponential backoff
    - Multiple RPC endpoint fallback
    - Request timing/logging
    - Proper error classification
    """

    w3: Web3

    def __init__(
        self, rpc_url: Optional[str] = None, timeout: int = 30, max_retries: int = 3
    ):
        if not rpc_url:
            rpc_url = os.getenv("INFURA_RPC_URL")
            if not rpc_url:
                raise RPCException(
                    "No RPC URL provided. Set INFURA_RPC_URL environment variable or pass rpc_url parameter."
                )

        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        for i in range(0, max_retries):
            try:
                self.w3.eth.get_block_number()
                break
            except:
                if i == max_retries - 1:
                    raise RPCException(
                        "No RPC URL provided. Set INFURA_RPC_URL environment variable or pass rpc_url parameter."
                    )
                self.w3 = Web3(Web3.HTTPProvider(rpc_url))

    def get_balance(self, address: Address) -> TokenAmount:
        balance = self.w3.eth.get_balance(address.checksum)
        token_balance = TokenAmount.from_raw(balance, 18, "ETH")
        return token_balance

    def get_nonce(self, address: Address, block: str = "pending") -> int:
        nonce = self.w3.eth.get_transaction_count(
            address.checksum, block_identifier=block
        )
        return nonce

    def get_gas_price(self) -> GasPrice:
        """Returns current gas price info (base fee, priority fee estimates)."""
        block = self.w3.eth.get_block("latest")
        max_priority_fee = self.w3.eth.max_priority_fee

        if not block.baseFeePerGas or not max_priority_fee:
            raise RPCException("Network does not support EIP-1559")

        base = block.baseFeePerGas
        priority = max_priority_fee
        gp = GasPrice(
            base,
            priority / 2,  # low
            priority,  # medium
            priority * 2,  # high
        )
        return gp

    def estimate_gas(self, tx: TransactionRequest) -> int:
        tx_dict = tx.to_dict()
        print(tx_dict)
        eg = self.w3.eth.estimate_gas(tx_dict)
        return eg

    def send_transaction(self, signed_tx: bytes) -> str:
        """Send and return tx hash. Does NOT wait for confirmation."""
        result = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        return result

    def wait_for_receipt(
        self, tx_hash: str, timeout: int = 120, poll_interval: float = 1.0
    ) -> TransactionReceipt:
        """Wait for transaction confirmation."""
        tx_result = self.w3.eth.wait_for_transaction_receipt(
            tx_hash, timeout, poll_interval
        )
        return tx_result

    def get_transaction(self, tx_hash: str) -> dict:
        result = self.w3.eth.get_transaction(tx_hash)
        return result

    def get_receipt(self, tx_hash: str) -> Optional[TransactionReceipt]:
        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
        except:
            return None
        return receipt

    def call(self, tx: TransactionRequest, block: str = "latest") -> bytes:
        """eth_call - simulate transaction without sending."""
        res = self.w3.eth.call(tx, block)
        return res

    TOKENS = {
        # native
        "ETH": {"address": None, "decimals": 18},
        "USDC": {
            "address": Address.from_string("0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"),
            "decimals": 6,
        },
        "USDT": {
            "address": Address.from_string("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"),
            "decimals": 6,
        },
        "ARB": {
            "address": Address.from_string("0x912CE59144191C1204E64559FE8253a0e49E6548"),
            "decimals": 18,
        },
        "GMX": {
            "address": Address.from_string("0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"),
            "decimals": 18,
        },
        "LINK": {
            "address": Address.from_string("0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"),
            "decimals": 18,
        },
        "WBTC": {
            "address": Address.from_string("0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"),
            "decimals": 8,
        },
    }

    def get_balances(self, address: Address, tokens: list[Token] = TOKENS):
        """Get balances of wanted tokens"""
        balances = dict()
        for symbol, token in tokens.items():
            try:
                if token["address"] is None:
                    # Native ETH balance
                    raw = self.w3.eth.get_balance(address.checksum)
                else:
                    contract = self.w3.eth.contract(
                        address=token["address"].checksum,
                        abi=ERC20_ABI,
                    )
                    raw = contract.functions.balanceOf(address.checksum).call()

                balances[symbol] = raw / 10 ** token["decimals"]

            except Exception as e:
                print(f"Failed to fetch {symbol}: {e}")
                balances[symbol] = None

        return balances


@dataclass
class GasPrice:
    """Current gas price information."""

    base_fee: int
    priority_fee_low: int
    priority_fee_medium: int
    priority_fee_high: int

    def get_max_fee(self, priority: str = "medium", buffer: float = 1.2) -> int:
        """Calculate maxFeePerGas with buffer for base fee increase."""
        tip: int

        match priority:
            case "low":
                tip = self.priority_fee_low
            case "high":
                tip = self.priority_fee_high
            case _:
                tip = self.priority_fee_medium

        bufferedBase = math.floor(self.base_fee * buffer)

        return bufferedBase + tip


ERC20_ABI = [
    {
        "name": "balanceOf",
        "type": "function",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "name": "decimals",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
    },
    {
        "name": "symbol",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
    },
]
