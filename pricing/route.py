from decimal import Decimal
from pricing.AMM import UniswapV2Pair
from pricing.token import Token


class Route:
    """Represents a swap route through one or more pools."""

    def __init__(self, pools: list[UniswapV2Pair], path: list[Token]):
        self.pools: list[UniswapV2Pair] = pools
        self.path: list[Token] = path  # token_in → intermediate... → token_out

    @property
    def num_hops(self) -> int:
        return len(self.pools)

    def get_output(self, amount_in: int) -> int:
        """Simulate full route, return final output."""
        amount_out = amount_in
        for i in range(0, self.num_hops):
            amount_out = self.pools[i].get_amount_out(amount_out, self.path[i])

        return amount_out

    def get_input(self, amount_out: int):
        amount_in = amount_out
        for i in range(0, self.num_hops):
            amount_in = self.pools[i].get_amount_in(amount_in, self.path[i])

        return amount_in

    def get_intermediate_amounts(self, amount_in: int) -> list[int]:
        """Return amount at each step: [input, after_hop1, after_hop2, ...]"""
        amounts = []
        amounts.append(amount_in)
        for i in range(0, self.num_hops - 1):
            amount_out = self.pools[i].get_amount_out(amount_in, self.path[i])
            amounts.append(amount_out)
            amount_in = amount_out

        amount_out = self.pools[self.num_hops - 1].get_amount_out(
            amount_in,
            self.path[self.num_hops],
        )
        amounts.append(amount_out)
        return amounts

    def estimate_gas(self) -> int:
        """Estimate gas: ~150k base + ~100k per hop."""
        base = 150_000
        perHop = 100_000
        return base + (self.num_hops - 1) * perHop

    def get_slippage(self, amount_in: int):
        spotPrice = Decimal(1)
        amountOut = self.get_output(amount_in)
        for i in range(0, self.pools.length):
            spotPrice = spotPrice.mul(self.pools[i].getSpotPrice(self.path[i]))

        executionPrice = Decimal(
            amount_in
            / self.path[0].decimals
            / (amountOut / self.path[self.path.length - 1].decimals),
        )
        return round((executionPrice - spotPrice) / spotPrice * 10000, 2)
