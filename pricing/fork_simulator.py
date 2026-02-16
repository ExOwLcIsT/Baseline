from dataclasses import dataclass
import time
from typing import Optional

from web3 import Web3
from web3.contract import Contract

from core.base_types import Address
from pricing.route import Route
from pricing.AMM import UniswapV2Pair
from pricing.token import Token

ROUTER_ABI = [
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
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
    }
]

QUOTE_ABI = [
    {
        "name": "getAmountsOut",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "path", "type": "address[]"},
        ],
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
    }
]

ERC20_ABI = [
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"type": "bool"}],
    },
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"type": "uint256"}],
    },
]

WETH_ABI = [
    {
        "name": "deposit",
        "type": "function",
        "stateMutability": "payable",
        "inputs": [],
        "outputs": [],
    },
    {
        "name": "withdraw",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"type": "uint256"}],
        "outputs": [],
    },
]


@dataclass
class SimulationResult:
    success: bool
    amount_out: int
    gas_used: int
    error: Optional[str]
    logs: list


class ForkSimulator:
    """
    Simulates swaps against a local fork (Anvil/Hardhat/Erigon).
    """

    def __init__(self, fork_url: str):
        self.w3 = Web3(Web3.HTTPProvider(fork_url))

    # --------------------------------------------------

    def _wrap_eth(self, sender: Address, amount_wei: int):
        WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        weth: Contract = self.w3.eth.contract(address=WETH, abi=WETH_ABI)

        tx = weth.functions.deposit().build_transaction(
            {
                "from": sender.checksum,
                "value": amount_wei,
                "gas": 200000,
            }
        )
        self.w3.eth.send_transaction(tx)

    def _approve(self, token: str, owner: Address, spender: Address, amount: int):
        token_contract = self.w3.eth.contract(address=token, abi=ERC20_ABI)
        tx = token_contract.functions.approve(
            spender.checksum, amount
        ).build_transaction({"from": owner.checksum})
        self.w3.eth.send_transaction(tx)

    # --------------------------------------------------

    def simulate_swap(
        self, router: Address, swap_params: dict, sender: Address
    ) -> SimulationResult:

        try:
            self._wrap_eth(sender=sender, amount_wei=10 * 10**18)
            self._approve(swap_params["path"][0], sender, router, 2**256 - 1)
            router_contract: Contract = self.w3.eth.contract(
                address=router.checksum, abi=ROUTER_ABI
            )

            # estimate gas
            tx = router_contract.functions.swapExactTokensForTokens(
                swap_params["amountIn"],
                swap_params["amountOutMin"],
                swap_params["path"],
                sender.checksum,
                swap_params["deadline"],
            ).build_transaction({"from": sender.checksum})

            gas = self.w3.eth.estimate_gas(tx)

            amounts = router_contract.functions.swapExactTokensForTokens(
                swap_params["amountIn"],
                swap_params["amountOutMin"],
                swap_params["path"],
                sender.checksum,
                swap_params["deadline"],
            ).call({"from": sender.checksum})
            return SimulationResult(
                success=True, amount_out=amounts[-1], gas_used=gas, error=None, logs=[]
            )

        except Exception as e:
            return SimulationResult(
                success=False, amount_out=0, gas_used=0, error=str(e), logs=[]
            )

    # --------------------------------------------------

    def simulate_route(
        self, route: Route, amount_in: int, sender: Address
    ) -> SimulationResult:
        path = [t.address.checksum for t in route.path]
        deadline = round(time.time()) + 180

        router = Address("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D")

        return self.simulate_swap(
            router,
            {
                "amountIn": amount_in,
                "amountOutMin": 0,
                "path": path,
                "deadline": deadline,
            },
            sender,
        )

    # --------------------------------------------------

    def compare_simulation_vs_calculation(
        self, pair: UniswapV2Pair, amount_in: int, token_in: Token
    ) -> dict:

        calculated = pair.get_amount_out(amount_in, token_in)

        simulated = self.simulate_swap(
            router=pair.router,
            swap_params={
                "amountIn": amount_in,
                "amountOutMin": 0,
                "path": [pair.token0.address.checksum, pair.token1.address.checksum],
                "deadline": self.w3.eth.get_block("latest")["timestamp"] + 60,
            },
            sender=Address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
        )

        return {
            "calculated": calculated,
            "simulated": simulated.amount_out,
            "difference": abs(calculated - simulated.amount_out),
            "match": calculated == simulated.amount_out,
        }
