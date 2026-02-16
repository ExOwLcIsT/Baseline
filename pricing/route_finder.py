from core.base_types import Address
from typing import Optional
from pricing.AMM import UniswapV2Pair
from pricing.route import Route
from pricing.token import Token


class RouteFinder:
    """
    Finds optimal routes between tokens.
    """

    def __init__(self, pools: list[UniswapV2Pair]):
        self.pools: list[UniswapV2Pair] = pools
        self.graph: dict = self._build_graph()

    def _build_graph(self) -> dict:
        """
        Build adjacency graph: token → [(pool, other_token), ...]
        """
        g: dict[str, dict[UniswapV2Pair, Token]] = {}
        for p in self.pools:
            if g.get(p.token0.name) is None:
                g[p.token0.name] = {}
            if g.get(p.token1.name) is None:
                g[p.token1.name] = {}

            g.get(p.token0.name)[p] = p.token1
            g.get(p.token1.name)[p] = p.token0

        return g

    def find_all_routes(
        self, token_in: Token, token_out: Token, max_hops: int = 3
    ) -> list[Route]:
        """
        Find all possible routes up to max_hops.
        """
        routes: list[Route] = []

        def dfs(
            current: Token,
            visited: {str},
            pools_path: list[UniswapV2Pair],
            tokens_path: list[Token],
            hopsLeft: int,
        ):
            if hopsLeft < 0:
                return

            if current.__eq__(token_out):
                routes.append(Route(pools_path.copy(), tokens_path.copy()))
                return

            neighbors: dict[UniswapV2Pair, Token] = self.graph.get(current.name)

            if len(neighbors) == 0:
                return

            for pool, token in neighbors.items():
                if token.name in visited:
                    continue

                visited.add(token.name)

                pools_path.append(pool)
                tokens_path.append(token)

                dfs(token, visited, pools_path, tokens_path, hopsLeft - 1)

                pools_path.pop()
                tokens_path.pop()

                visited.remove(token.name)

        dfs(token_in, {token_in.name}, [], [token_in], max_hops)

        return routes

    def convert_to_output_token(self, gas_wei: int, token_out: Token) -> int:
        if token_out.address.checksum == "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2":
            return gas_wei
        ethToken = Token(
            "WETH",
            10**18,
            Address.from_string("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
        )
        routes = self.find_all_routes(ethToken, token_out, 5)
        minGas = routes[0].get_output(gas_wei)
        for i in range(0, len(routes)):
            out = routes[i].get_output(gas_wei)
            if out < minGas:
                minGas = out

        # simulate swap of gasWei WETH → tokenOut
        return minGas

    def find_best_route(
        self,
        token_in: Token,
        token_out: Token,
        amount_in: int,
        gas_price_gwei: int,
        max_hops: int = 3,
    ) -> tuple[Route, int]:
        """
        Find route that maximizes NET output (after gas).
        Returns (best_route, net_output).
        """
        routes = self.find_all_routes(token_in, token_out, max_hops)
        bestRoute: Optional[Route] = None
        bestNetOutput = 0
        for route in routes:
            grossOutput = route.get_output(amount_in)

            gasCost = route.estimate_gas() * gas_price_gwei * 1_000_000_000
            gasCostInOutputToken = self.convert_to_output_token(gasCost, token_out)
            netOutput = grossOutput - gasCostInOutputToken
            if netOutput > bestNetOutput:
                bestNetOutput = netOutput
                bestRoute = route

        return bestRoute, bestNetOutput

    # def compare_routes(
    #     self,
    #     token_in: Token,
    #     token_out: Token,
    #     amount_in: int,
    #     gas_price_gwei: int
    # ) -> list[dict]:
    #     """
    #     Compare all routes with detailed breakdown:
    #     {
    #         'route': Route,
    #         'gross_output': int,
    #         'gas_estimate': int,
    #         'gas_cost': int,
    #         'net_output': int,
    #     }
    #     """
