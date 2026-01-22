import { keccak_256 } from "@noble/hashes/sha3";
const HEX_REGEX = /^0x[0-9a-fA-F]{40}$/;
export class Address {
    value; // always stored as lowercase normalized
    // private => immutable like frozen dataclass
    constructor(value) {
        this.value = value.toLowerCase();
    }
    // =========================
    // factory (like from_string)
    // =========================
    static fromString(s) {
        if (!HEX_REGEX.test(s)) {
            throw new Error("Invalid Ethereum address");
        }
        return new Address(s);
    }
    // =========================
    // checksum (EIP-55)
    // =========================
    get checksum() {
        const addr = this.value.slice(2).toLowerCase();
        const hash = Buffer.from(keccak_256(addr)).toString("hex");
        let out = "0x";
        for (let i = 0; i < addr.length; i++) {
            out += parseInt(hash[i], 16) >= 8
                ? addr[i].toUpperCase()
                : addr[i];
        }
        return out;
    }
    // =========================
    // lowercase
    // =========================
    get lower() {
        return this.value;
    }
    // =========================
    // equality (case insensitive)
    // =========================
    equals(other) {
        if (other instanceof Address) {
            return this.value === other.value;
        }
        if (typeof other === "string") {
            return this.value === other.toLowerCase();
        }
        return false;
    }
    // =========================
    // safe printing
    // =========================
    toString() {
        return this.checksum;
    }
    toJSON() {
        return this.checksum;
    }
}
// @dataclass(frozen=True)
// class TokenAmount:
//     """
//     Represents a token amount with proper decimal handling.
//     Internally stores raw integer (wei-equivalent).
//     Provides human-readable formatting.
//     """
//     raw: int  # Raw amount (e.g., wei)
//     decimals: int  # Token decimals (e.g., 18 for ETH, 6 for USDC)
//     symbol: Optional[str] = None
//     @classmethod
//     def from_human(cls, amount: str | Decimal, decimals: int, symbol: str = None) -> "TokenAmount":
//         """Create from human-readable amount (e.g., '1.5' ETH)."""
//         ...
//     @property
//     def human(self) -> Decimal:
//         """Returns human-readable decimal."""
//         ...
//     def __add__(self, other: "TokenAmount") -> "TokenAmount":
//         # Must validate same decimals
//         ...
//     def __mul__(self, factor: int | Decimal) -> "TokenAmount":
//         ...
//     def __str__(self) -> str:
//         return f"{self.human} {self.symbol or ''}"
// @dataclass
// class TransactionRequest:
//     """A transaction ready to be signed."""
//     to: Address
//     value: TokenAmount
//     data: bytes
//     nonce: Optional[int] = None
//     gas_limit: Optional[int] = None
//     max_fee_per_gas: Optional[int] = None
//     max_priority_fee: Optional[int] = None
//     chain_id: int = 1
//     def to_dict(self) -> dict:
//         """Convert to web3-compatible dict."""
//         ...
// @dataclass
// class TransactionReceipt:
//     """Parsed transaction receipt."""
//     tx_hash: str
//     block_number: int
//     status: bool  # True = success
//     gas_used: int
//     effective_gas_price: int
//     logs: list
//     @property
//     def tx_fee(self) -> TokenAmount:
//         """Returns transaction fee as TokenAmount."""
//         ...
//     @classmethod
//     def from_web3(cls, receipt: dict) -> "TransactionReceipt":
//         """Parse from web3 receipt dict."""
//         ...
