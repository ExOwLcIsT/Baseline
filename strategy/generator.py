# strategy/generator.py

from decimal import Decimal
import time
from typing import Optional
from core.base_types import Address
from exchange.exchange_client import ExchangeClient
from exchange.order_book_analyzer import OrderBookAnalyzer
from inventory.tracker import InventoryTracker
from pricing.pricing_engine import PricingEngine
from strategy.fees import FeeStructure
from strategy.signal import Direction, Signal
from pricing.token import Token


class SignalGenerator:
    def __init__(
        self,
        exchange_client,
        pricing_module,
        inventory_tracker,
        fee_structure: FeeStructure,
        config: dict,
    ):
        self.exchange: ExchangeClient = exchange_client
        self.pricing: PricingEngine = pricing_module
        self.inventory: InventoryTracker = inventory_tracker
        self.fees: FeeStructure = fee_structure

        self.min_spread_bps = config.get("min_spread_bps", 10)
        self.min_profit_usd = config.get("min_profit_usd", 0.01)
        self.max_position_usd = config.get("max_position_usd", 10_000)
        self.signal_ttl = config.get("signal_ttl_seconds", 5)
        self.cooldown = config.get("cooldown_seconds", 2)

        self.last_signal_time: dict[str, Decimal] = {}

    async def generate(
        self, cex_pair: str, dex_pair: str, size: Decimal
    ) -> Optional[Signal]:
        """
        Attempt to generate a signal for the given pair and size.
        Returns Signal if opportunity found and validated, None otherwise.
        """
        if self._in_cooldown(cex_pair):
            return None

        prices = await self._fetch_prices(cex_pair, dex_pair, size)
        if prices is None:
            return None
        size = prices.get("size", size)  # change size if not enough on CEX
        # Calculate spreads both directions
        spread_a = (prices["dex_sell"] - prices["cex_ask"]
                    ) / prices["cex_ask"] * 10_000
        spread_b = (prices["cex_bid"] - prices["dex_buy"]) / \
            prices["dex_buy"] * 10_000
        print("BUY_CEX_SELL_DEX bps", round(spread_a, 2))
        print("BUY_DEX_SELL_CEX bps", round(spread_b, 2))

        # Pick better direction
        if spread_a > spread_b and spread_a >= self.min_spread_bps:
            direction = Direction.BUY_CEX_SELL_DEX
            spread, cex_price, dex_price = (
                spread_a,
                prices["cex_ask"],
                prices["dex_sell"],
            )
        elif spread_b >= self.min_spread_bps:
            direction = Direction.BUY_DEX_SELL_CEX
            spread, cex_price, dex_price = (
                spread_b,
                prices["cex_bid"],
                prices["dex_buy"],
            )
        else:
            print("Spread is too low")
            return None

        # Economics
        trade_value = float(size * cex_price)
        gross_pnl = float(spread / 10_000) * trade_value
        fees = (self.fees.total_fee_bps(trade_value) / 10_000) * trade_value
        net_pnl = gross_pnl - fees
        if net_pnl < self.min_profit_usd:
            print(f"profit is too low ({net_pnl} < {self.min_profit_usd})")
            return None

        # Validation
        inventory_ok = self._check_inventory(
            cex_pair, direction, size, cex_price)
        within_limits = trade_value <= self.max_position_usd

        signal = Signal.create(
            pair=dex_pair,
            direction=direction,
            cex_price=cex_price,
            dex_price=dex_price,
            spread_bps=spread,
            size=size,
            expected_gross_pnl=gross_pnl,
            expected_fees=fees,
            expected_net_pnl=net_pnl,
            score=0,
            expiry=time.time() + self.signal_ttl,
            inventory_ok=inventory_ok,
            within_limits=within_limits,
        )

        self.last_signal_time[cex_pair] = time.time()
        return signal

    def _in_cooldown(self, pair: str) -> bool:
        return time.time() - self.last_signal_time.get(pair, 0) < self.cooldown

    def _check_inventory(self, pair, direction, size, price) -> bool:
        base, quote = pair.split("/")
        if direction == Direction.BUY_CEX_SELL_DEX:
            return (
                Decimal(self.inventory.get_available("binance", quote))
                >= size * price * 1.01
                and Decimal(self.inventory.get_available("wallet", base)) >= size
            )
        else:
            return (
                Decimal(self.inventory.get_available("binance", base)) >= size
                and Decimal(self.inventory.get_available("wallet", quote))
                >= size * price * 1.01
            )

    async def _fetch_prices(self, cex_pair: str, dex_pair: str, size: Decimal):
        try:
            base, quote = dex_pair.split("/")
            ob = self.exchange.fetch_order_book(cex_pair)

            if ob is None:
                raise Exception("Order book is None")
            analyzer = OrderBookAnalyzer(ob)
            bid_walk_result = analyzer.walk_the_book("sell", size)
            ask_walk_result = analyzer.walk_the_book("buy", size)
            if bid_walk_result.get("size") > Decimal(0) and ask_walk_result.get("size") > Decimal(0):
                size = min(bid_walk_result.get("size"),
                        ask_walk_result.get("size"))
            amount_in = int(size * Tokens[base].decimals)

            dex_prices = await self.pricing.get_prices(
                token_in=Tokens[base], token_out=Tokens[quote], amount_in=amount_in
            )
            dex_buy = dex_prices.get("dex_buy") / \
                Tokens[quote].decimals / float(size)

            dex_sell = dex_prices.get("dex_sell") / \
                Tokens[quote].decimals / float(size)
            cex_bid = bid_walk_result.get("avg_price")
            cex_ask = ask_walk_result.get("avg_price")

            if cex_bid == 0 or cex_ask == 0:
                return None

            return {
                "cex_bid": cex_bid,
                "cex_ask": cex_ask,
                "dex_buy": Decimal(dex_buy),
                "dex_sell": Decimal(dex_sell),
                "size": size
            }
        except Exception as e:
            print("Error fetching prices")
            print("Error", e)
            return None


Tokens: dict[str, Token] = {
    "USDC": Token(
        "USDC",
        10**6,
        Address.from_string("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
    ),
    "ARB": Token(
        "ARB",
        10**18,
        Address.from_string("0x912CE59144191C1204E64559FE8253a0e49E6548"),
    ),
    "ETH": Token(
        "WETH",
        10**18,
        Address.from_string("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),
    ),
    "WETH": Token(
        "WETH",
        10**18,
        Address.from_string("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),
    ),
    "USDT": Token(
        "USDT",
        10**6,
        Address.from_string("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    ),
    "USD₮0": Token(
        "USDT",
        10**6,
        Address.from_string("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"),
    ),
    "SHIB": Token(
        "SHIB",
        10**18,
        Address.from_string("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
    ),
}
