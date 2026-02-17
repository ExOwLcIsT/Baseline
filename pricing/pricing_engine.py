from dataclasses import dataclass
import time
from typing import Optional
from chain.chain_client import ChainClient
from core.base_types import Address
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
        diff = abs(self.expected_output - self.simulated_output) / \
            self.expected_output
        return diff < tolerance
