import asyncio
from dataclasses import dataclass
from typing import Optional, Callable, Dict, Tuple, Any

from web3 import AsyncWeb3, WebSocketProvider
from web3.contract import Contract

from core.base_types import Address

# ----------------------------
# Parsed Swap DTO
# ----------------------------


@dataclass
class ParsedSwap:
    txHash: str
    router: Address
    dex: str
    method: str

    tokenIn: Optional[Address]
    tokenOut: Optional[Address]

    amountIn: int
    minAmountOut: int

    deadline: int
    sender: Address
    gasPrice: int

    slippageTolerance: float


Callback = Callable[[ParsedSwap], None]

# ----------------------------
# ABI
# ----------------------------

V2_ABI = [
    {
        "name": "swapExactTokensForTokens",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "path", "type": "address[]"},
            {"name": "to", "type": "address"},
            {"name": "deadline", "type": "uint256"},
        ],
        "outputs": [{"type": "uint256[]"}],
    },
    {
        "name": "swapExactETHForTokens",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "path", "type": "address[]"},
            {"name": "to", "type": "address"},
            {"name": "deadline", "type": "uint256"},
        ],
        "outputs": [{"type": "uint256[]"}],
    },
    {
        "name": "swapExactTokensForETH",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "path", "type": "address[]"},
            {"name": "to", "type": "address"},
            {"name": "deadline", "type": "uint256"},
        ],
        "outputs": [{"type": "uint256[]"}],
    },
]

# ----------------------------
# Monitor
# ----------------------------


class MempoolMonitor:

    SWAP_SELECTORS: Dict[str, Tuple[str, str]] = {
        "0x38ed1739": ("UniswapV2", "swapExactTokensForTokens"),
        "0x7ff36ab5": ("UniswapV2", "swapExactETHForTokens"),
        "0x18cbafe5": ("UniswapV2", "swapExactTokensForETH"),
        "0x5ae401dc": ("UniswapV3", "multicall"),
    }

    def __init__(self, ws_url: str, callback: Callback):
        self.ws_url = ws_url
        self.callback = callback

    # ----------------------------

    async def start(self):
        print("Listening mempool...")

        async for w3 in AsyncWeb3(WebSocketProvider(self.ws_url)):
            sub_id = await w3.eth.subscribe("newPendingTransactions")
            print(sub_id)
            async for message in w3.socket.process_subscriptions():

                if message.get("subscription") != sub_id:
                    continue

                tx_hash = message["result"]
                try:
                    tx = await w3.eth.get_transaction(tx_hash)
                    if not tx or not tx.input:
                        continue

                    parsed = await self.parse_transaction(tx)
                    if parsed:
                        self.callback(parsed)

                except Exception:
                    pass

    # ----------------------------

    async def parse_transaction(self, tx) -> Optional[ParsedSwap]:

        if not tx.input or len(tx.input) < 10:
            return None

        selector = tx.input[:10].lower()

        meta = self.SWAP_SELECTORS.get(selector)
        if not meta:
            return None

        dex, method = meta

        params = self.decode_swap_params(selector, tx)
        if not params:
            return None

        amount_in = params.get("amountIn", 0)
        min_out = params.get("amountOutMin", 0)

        return ParsedSwap(
            txHash=tx.hash.hex(),
            router=Address.from_string(tx.to),
            dex=dex,
            method=method,
            tokenIn=params.get("tokenIn"),
            tokenOut=params.get("tokenOut"),
            amountIn=amount_in,
            minAmountOut=min_out,
            deadline=params.get("deadline", 0),
            sender=Address.from_string(tx["from"]),
            gasPrice=tx.gasPrice or 0,
            slippageTolerance=self.calc_slippage(amount_in, min_out),
        )

    # ----------------------------

    def decode_swap_params(self, selector: str, tx) -> Optional[Dict[str, Any]]:
        try:
            contract = self.w3.eth.contract(
                address=tx.to, abi=V2_ABI)  # synchronous
            fn, decoded = contract.decode_function_input(tx.input)

            path = decoded.get("path", [])

            if selector == "0x38ed1739":  # tokens -> tokens
                return {
                    "amountIn": decoded["amountIn"],
                    "amountOutMin": decoded["amountOutMin"],
                    "tokenIn": Address.from_string(path[0]),
                    "tokenOut": Address.from_string(path[-1]),
                    "deadline": decoded["deadline"],
                }

            elif selector == "0x7ff36ab5":  # ETH -> tokens
                return {
                    "amountIn": tx.value,  # from tx.value
                    "amountOutMin": decoded["amountOutMin"],
                    "tokenIn": None,
                    "tokenOut": Address.from_string(path[-1]),
                    "deadline": decoded["deadline"],
                }

            elif selector == "0x18cbafe5":  # tokens -> ETH
                return {
                    "amountIn": decoded["amountIn"],
                    "amountOutMin": decoded["amountOutMin"],
                    "tokenIn": Address.from_string(path[0]),
                    "tokenOut": None,
                    "deadline": decoded["deadline"],
                }

        except Exception:
            return None

    # ----------------------------

    @staticmethod
    def calc_slippage(amount_in: int, min_out: int) -> float:
        if amount_in == 0 or min_out == 0:
            return 0.0
        ratio = min_out / amount_in
        return (1 - ratio) * 100
