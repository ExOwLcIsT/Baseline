from dataclasses import dataclass
from typing import Optional
from decimal import Decimal
import re
from eth_hash.auto import keccak

HEX_REGEX = r"^0x[0-9a-fA-F]{40}$"


@dataclass(frozen=False)
class Address:
    """Ethereum address with validation and checksumming."""

    value: str

    def __post_init__(self):
        # Validate and convert to checksum
        if not re.match(HEX_REGEX, self.value):
            raise ValueError("Invalid address")

        self.value = self.checksum

    @classmethod
    def from_string(cls, s: str) -> "Address":
        address = cls(s)
        address.value = s
        return address

    @property
    def checksum(self) -> str:

        addr = self.value[2:].lower()

        # keccak over ASCII string, NOT bytes.fromhex
        hash_hex = keccak(addr.encode("ascii")).hex()

        out = "0x"
        for i, c in enumerate(addr):
            if int(hash_hex[i], 16) >= 8:
                out += c.upper()
            else:
                out += c

        return out

    @property
    def lower(self) -> str:
        lower = self.value.lower()
        return lower

    def __eq__(self: Address, other: Address) -> bool:
        # Case-insensitive comparison
        return self.lower.__eq__(other.lower)


@dataclass(frozen=True)
class TokenAmount:
    """
    Represents a token amount with proper decimal handling.

    Internally stores raw integer (wei-equivalent).
    Provides human-readable formatting.
    """

    raw: int  # Raw amount (e.g., wei)
    decimals: int  # Token decimals (e.g., 18 for ETH, 6 for USDC)
    symbol: Optional[str] = None

    @classmethod
    def from_raw(
        cls, raw: int, decimals: int, symbol: str | None = None
    ) -> "TokenAmount":
        return cls(int(raw), decimals, symbol)

    @classmethod
    def from_human(
        cls, amount: str | Decimal, decimals: int, symbol: str = None
    ) -> "TokenAmount":
        """Create from human-readable amount (e.g., '1.5' ETH)."""
        base = 10**decimals

        # bigint path in TS
        if isinstance(amount, int):
            return cls(amount * base, decimals, symbol)

        # normalize to string (TS splits string)
        if isinstance(amount, Decimal):
            amount = format(amount, "f")

        whole, _, frac = str(amount).partition(".")

        if len(frac) > decimals:
            raise ValueError("Too many decimal places")

        padded = frac.ljust(decimals, "0")

        raw = int(whole) * base + (int(padded) if padded else 0)

        return cls(raw, decimals, symbol)

    @property
    def human(self) -> Decimal:
        """Returns human-readable decimal."""
        base = 10**self.decimals
        whole = self.raw // base
        frac = self.raw % base

        if frac == 0:
            return Decimal(whole)

        frac_str = str(frac).rjust(self.decimals, "0").rstrip("0")
        return Decimal(f"{whole}.{frac_str}")

    def _assert_same_decimals(self, other: "TokenAmount"):
        if self.decimals != other.decimals:
            raise ValueError("Token decimals mismatch")

    def __add__(self, other: "TokenAmount") -> "TokenAmount":
        # Must validate same decimals
        self._assert_same_decimals(other)
        return TokenAmount(self.raw + other.raw, self.decimals, self.symbol)

    def __mul__(self, factor: int | Decimal) -> "TokenAmount":
        if isinstance(factor, Decimal):
            factor = int(factor)
        return TokenAmount(self.raw * int(factor), self.decimals, self.symbol)

    def __str__(self) -> str:
        if self.symbol:
            return f"{self.human} {self.symbol}"
        return f"{self.human}"


@dataclass
class TransactionRequest:
    """A transaction ready to be signed."""

    to: Address
    value: TokenAmount
    data: bytes = "0x"
    nonce: Optional[int] = None
    gas_limit: Optional[int] = None
    max_fee_per_gas: Optional[int] = None
    max_priority_fee: Optional[int] = None
    chain_id: int = 1

    def to_dict(self) -> dict:
        """Convert to web3-compatible dict."""
        tx = {
            "to": self.to.checksum,
            "value": self.value.raw,
            "data": self.data,
            "nonce": self.nonce,
            "chainId": self.chain_id,
        }
        if getattr(self, "gas_limit", None) is not None:
            tx["gas"] = self.gas_limit

        if getattr(self, "max_fee_per_gas", None) is not None:
            tx["maxFeePerGas"] = self.max_fee_per_gas

        if getattr(self, "max_priority_fee", None) is not None:
            tx["maxPriorityFeePerGas"] = self.max_priority_fee

        return tx


@dataclass
class TransactionReceipt:
    """Parsed transaction receipt."""

    tx_hash: str
    block_number: int
    status: bool  # True = success
    gas_used: int
    effective_gas_price: int
    logs: list

    @property
    def tx_fee(self) -> TokenAmount:
        """Returns transaction fee as TokenAmount."""
        return TokenAmount.from_raw(
            self.gas_used * self.effective_gas_price,
            18,
            "WETH",
        )

    @classmethod
    def from_web3(cls, receipt: dict) -> "TransactionReceipt":
        """Parse from web3 receipt dict."""
        if receipt is None:
            return None

        return TransactionReceipt(
            tx_hash=receipt.hash,
            block_number=receipt.blockNumber,
            status=receipt.status,
            gas_used=receipt.gasUsed,
            effective_gas_price=receipt.gasPrice,
            logs=receipt.logs,
        )
