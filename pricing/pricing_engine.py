from dataclasses import dataclass
from decimal import Decimal
import os
import time
from typing import Optional

from chain.chain_client import ChainClient
from core.base_types import Address
from core.wallet import WalletManager
from pricing.AMM import UniswapV2Pair
from pricing.fork_simulator import ForkSimulator
from pricing.mempool_monitor import MempoolMonitor, ParsedSwap
from pricing.route import Route
from pricing.route_finder import RouteFinder
from pricing.token import Token


class QuoteError(Exception):
    def __init__(self, message):
        super().__init__(message)


class PricingEngine:
    """
    Main interface for the pricing module.
    Integrates AMM math, routing, simulation, and mempool monitoring.
    """

    def __init__(
        self, chain_client: ChainClient, fork_url: str, ws_url: str  # From Week 1
    ):
        self.client = chain_client
        self.simulator = ForkSimulator(fork_url)
        self.monitor = MempoolMonitor(ws_url, self._on_mempool_swap)
        self.pools: dict[Address, UniswapV2Pair] = {}
        self.router: Optional[RouteFinder] = None

    async def load_pools(self, pool_addresses: list[Address]):
        """Load pool data from chain."""
        for addr in pool_addresses:
            self.pools[addr.checksum] = await UniswapV2Pair.from_chain(
                addr, self.client
            )
        self.router = RouteFinder(list(self.pools.values()))

    def refresh_pool(self, address: Address):
        """Refresh single pool's reserves."""
        pair = self.pools.get(address)
        if pair is None:
            return

        pair.refresh_reserves(self.client)

    async def refresh_all_pools(self):
        """Refresh single pool's reserves."""
        for pair in self.pools.values():
            await pair.refresh_reserves(self.client)

    def get_quote(
        self, token_in: Token, token_out: Token, amount_in: int, gas_price_gwei: int
    ) -> Quote:
        """
        Get best quote for a swap.
        """
        route, net_output = self.router.find_best_route(
            token_in, token_out, amount_in, gas_price_gwei
        )
        # Verify with simulation
        sim_result = self.simulator.simulate_route(
            route,
            amount_in,
            Address.from_string("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        )

        if not sim_result.success:
            raise QuoteError(f"Simulation failed: {sim_result.error}")

        return Quote(
            route=route,
            amount_in=amount_in,
            expected_output=net_output,
            simulated_output=sim_result.amount_out,
            gas_estimate=sim_result.gas_used,
            timestamp=round(time.time()),
        )

    def _on_mempool_swap(self, swap: ParsedSwap):
        """Handle detected mempool swap."""
        # Check if it affects any of our pools
        # Could trigger re-quote or alert
        print("Swap detected:", swap)
        print(f"Detected swap: {swap.dex} {swap.method}")
        print(f"{swap.amountIn} → min {swap.minAmountOut}")
        print(f" Slippage tolerance: {swap.slippageTolerance}")
        if self.pools:
            for pool in self.pools.values():
                if (
                    pool.token0.address.lower == swap.tokenIn.lower
                    or pool.token1.address.lower == swap.tokenIn.lower
                ):
                    self.refreshPool(pool.address)

    async def real_dex_swap(
        self,
        size: Decimal,
        token_in: Token,
        token_out: Token,
        gas_price: str = "medium",
    ):
        # --- amount conversion ---
        decimals = 0
        token_decimals = token_in.decimals
        while token_decimals // 10 > 0:
            token_decimals //= 10
            decimals += 1

        amount_in = int(size * Decimal(10**decimals))

        # --- simulate ---
        simulated: Quote = await self.get_quote(token_in, token_out, amount_in, 0)

        router_address = Address.from_string(os.getenv("UNISWAP_V2_ROUTER_ADDRESS"))
        deadline = int(time.time()) + 180
        wallet = WalletManager.from_env()

        # --- wrap ETH if tokenIn is WETH ---
        if token_in.address.checksum == WETH_ADDRESS:
            weth = self.client.w3.eth.contract(
                address=WETH_ADDRESS,
                abi=WETH_ABI,
            )
            wrap_amount = self.client.w3.to_wei(size, "ether")
            tx = weth.functions.deposit().build_transaction(
                {
                    "from": wallet.address,
                    "value": wrap_amount,
                    "nonce": self.client.get_nonce(wallet.address),
                    "gas": 60_000,
                    "gasPrice": self.client.get_gas_price().get_max_fee(),
                    "chainId": os.getenv("CHAID_ID", 1),
                }
            )
            signed = wallet.sign_transaction(tx)
            tx_hash = self.client.send_transaction(signed.raw_transaction)
            self.client.wait_for_receipt(tx_hash)

        # --- build swap calldata ---
        router = self.client.w3.eth.contract(
            address=router_address, abi=UNISWAP_V2_ROUTER_ABI_SWAP
        )
        path = [token.address.checksum for token in simulated.route.path]

        value = 0 if token_in.address.checksum != WETH_ADDRESS else amount_in

        tx = router.functions.swapExactTokensForTokens(
            amount_in,
            0,  # amountOutMin — see review notes below
            path,
            router_address,
            deadline,
        ).build_transaction(
            {
                "from": wallet.address,
                "value": value,
                "nonce": self.client.get_nonce(wallet.address),
                "gasPrice": self.client.get_gas_price("medium"),
                "chainId": os.getenv("CHAID_ID", 1),
            }
        )
        tx["gas"] = self.client.estimate_gas(tx)

        signed_tx = wallet.sign_transaction(tx)
        tx_hash = self.client.send_transaction(signed_tx.raw_transaction)
        return {"price": simulated.simulated_output / token_out.decimals / size}

    async def get_prices(
        self,
        token_in: Token,
        token_out: Token,
        amount_in: int,
    ):

        await self.refresh_all_pools()
        route, net_output = self.router.find_best_route(
            token_in, token_out, amount_in, 0
        )
        dex_sell = route.get_output(amount_in=amount_in)
        dex_buy = route.get_input(amount_out=amount_in)
        return {"dex_buy": dex_buy, "dex_sell": dex_sell}


@dataclass
class Quote:
    route: Route
    amount_in: int
    expected_output: int
    simulated_output: int
    gas_estimate: int
    timestamp: float

    @property
    def is_valid(self) -> bool:
        """Quote valid if simulation matches expectation within tolerance."""
        tolerance = 0.001  # 0.1%
        diff = abs(self.expected_output - self.simulated_output) / self.expected_output
        return diff < tolerance


WETH_ADDRESS = os.getenv("WETH")
UNISWAP_V2_ROUTER_ABI_SWAP = [
    {
        "name": "swapExactTokensForTokens",
        "type": "function",
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
WETH_ABI = [
    {
        "name": "deposit",
        "type": "function",
        "inputs": [],
        "outputs": [],
        "stateMutability": "payable",
    },
    {
        "name": "withdraw",
        "type": "function",
        "inputs": [{"name": "wad", "type": "uint256"}],
        "outputs": [],
    },
    {
        "name": "balanceOf",
        "type": "function",
        "inputs": [{"name": "", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]
