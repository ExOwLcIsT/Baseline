from typing import List, Dict, Any
from core.base_types import Address
from pricing.AMM import UniswapV2Pair
from pricing.token import Token


class PriceImpactAnalyzer:
    """
    Analyzes price impact across different trade sizes.
    """

    def __init__(self, pair: UniswapV2Pair):
        self.pair = pair

    def generate_impact_table(
        self, token_in: str, sizes: List[int]
    ) -> List[Dict[str, Any]]:
        """
        Returns list of dicts:
        {
            'amount_in': int,
            'amount_out': int,
            'spot_price': float,
            'execution_price': float,
            'price_impact_pct': float,
        }
        """
        rows: List[Dict[str, Any]] = []
        token = (
            self.pair.token0 if token_in == self.pair.token0.name else self.pair.token1
        )
        spot = self.pair.get_spot_price(token)

        for amount_in in sizes:
            amount_out = self.pair.get_amount_out(amount_in, token)
            execution_price = self.pair.get_execution_price(amount_in, token)
            impact_pct = self.pair.get_price_impact(amount_in, token)

            rows.append(
                {
                    "amount_in": amount_in / token.decimals,
                    "amount_out": amount_out,
                    "spot_price": spot,
                    "execution_price": execution_price,
                    "price_impact_pct": impact_pct,
                }
            )

        return rows

    def find_max_size_for_impact(self, token_in: Token, max_impact_pct: float) -> int:
        """
        Binary search to find largest trade with impact <= max_impact_pct.
        """
        max_value = (
            self.pair.reserve0 if token_in == self.pair.token0 else self.pair.reserve1
        )
        return self._find_max_size_for_impact_recursive(
            token_in, max_impact_pct, 0, max_value
        )

    def _find_max_size_for_impact_recursive(
        self, token_in: Token, max_impact_pct: float, min_val: int, max_val: int
    ) -> int:
        value = (min_val + max_val) // 2
        price_impact = self.pair.get_price_impact(value, token_in)

        if max_val == min_val:
            return value
        if price_impact > max_impact_pct:
            return self._find_max_size_for_impact_recursive(
                token_in, max_impact_pct, min_val, value
            )
        if price_impact < max_impact_pct:
            return self._find_max_size_for_impact_recursive(
                token_in, max_impact_pct, value, max_val
            )
        return value

    def estimate_true_cost(
        self,
        amount_in: int,
        token_in: Token,
        gas_price_gwei: float,
        gas_estimate: int = 150_000,
    ) -> Dict[str, float]:
        token_out = (
            self.pair.token1 if token_in == self.pair.token0 else self.pair.token0
        )

        # Gross output from swap
        gross_out_raw: int = self.pair.get_amount_out(amount_in, token_in)

        # Gas cost in ETH
        gas_cost_eth = (gas_estimate * gas_price_gwei) / 1e9

        # Convert gas cost to output token units via spot price
        spot_price = self.pair.get_spot_price(token_in)  # token_in / token_out

        if token_out.name == "ETH":
            gas_cost_in_output_token = gas_cost_eth
        elif token_in.name == "ETH":
            gas_cost_in_output_token = gas_cost_eth * spot_price
        else:
            # Neither token is ETH, approximate via ETH as intermediate
            gas_cost_in_output_token = gas_cost_eth * spot_price

        net_output = (gross_out_raw / token_out.decimals) - gas_cost_in_output_token
        effective_price = amount_in / net_output if net_output != 0 else float("inf")

        return {
            "gross_output": gross_out_raw,
            "gas_cost_eth": gas_cost_eth,
            "gas_cost_in_output_token": gas_cost_in_output_token,
            "net_output": net_output,
            "effective_price": effective_price,
        }
