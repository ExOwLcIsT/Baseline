# strategy/generator.py

from decimal import Decimal
import time
from typing import Optional
from core.base_types import Address
from exchange.exchange_client import ExchangeClient
from exchange.order_book_analyzer import OrderBookAnalyzer
from inventory.tracker import InventoryTracker
from pricing.pricing_engine import PricingEngine, Quote
from strategy.fees import FeeStructure
from strategy.signal import Direction, Signal
from pricing.token import Token


class SignalGenerator:
    def __init__(self, exchange_client, pricing_module, inventory_tracker,
                 fee_structure: FeeStructure, config: dict):
        self.exchange: ExchangeClient = exchange_client
        self.pricing: PricingEngine = pricing_module
        self.inventory: InventoryTracker = inventory_tracker
        self.fees: FeeStructure = fee_structure

        self.min_spread_bps = config.get('min_spread_bps', 50)
        self.min_profit_usd = config.get('min_profit_usd', 5.0)
        self.max_position_usd = config.get('max_position_usd', 10_000)
        self.signal_ttl = config.get('signal_ttl_seconds', 5)
        self.cooldown = config.get('cooldown_seconds', 2)

        self.last_signal_time: dict[str, Decimal] = {}

    async def generate(self, pair: str, size: Decimal) -> Optional[Signal]:
        """
        Attempt to generate a signal for the given pair and size.
        Returns Signal if opportunity found and validated, None otherwise.
        """
        if self._in_cooldown(pair):
            return None

        prices = await self._fetch_prices(pair, size)
        if prices is None:
            return None

        # Calculate spreads both directions
        spread_a = (prices['dex_sell'] - prices['cex_ask']
                    ) / prices['cex_ask'] * 10_000
        spread_b = (prices['cex_bid'] - prices['dex_buy']) / \
            prices['dex_buy'] * 10_000

        # Pick better direction
        if spread_a > spread_b and spread_a >= self.min_spread_bps:
            direction = Direction.BUY_CEX_SELL_DEX
            spread, cex_price, dex_price = spread_a, prices['cex_ask'], prices['dex_sell']
        elif spread_b >= self.min_spread_bps:
            direction = Direction.BUY_DEX_SELL_CEX
            spread, cex_price, dex_price = spread_b, prices['cex_bid'], prices['dex_buy']
        else:
            return None

        # Economics
        trade_value = size * cex_price
        gross_pnl = (spread / 10_000) * trade_value
        fees = (self.fees.total_fee_bps(trade_value) / 10_000) * trade_value
        net_pnl = gross_pnl - fees

        if net_pnl < self.min_profit_usd:
            return None

        # Validation
        inventory_ok = self._check_inventory(pair, direction, size, cex_price)
        within_limits = trade_value <= self.max_position_usd

        signal = Signal.create(
            pair=pair, direction=direction,
            cex_price=cex_price, dex_price=dex_price, spread_bps=spread,
            size=size, expected_gross_pnl=gross_pnl, expected_fees=fees,
            expected_net_pnl=net_pnl, score=0,
            expiry=time.time() + self.signal_ttl,
            inventory_ok=inventory_ok, within_limits=within_limits,
        )

        self.last_signal_time[pair] = time.time()
        return signal

    def _in_cooldown(self, pair: str) -> bool:
        return time.time() - self.last_signal_time.get(pair, 0) < self.cooldown

    def _check_inventory(self, pair, direction, size, price) -> bool:
        base, quote = pair.split('/')
        if direction == Direction.BUY_CEX_SELL_DEX:
            return (Decimal(self.inventory.get_available('binance', quote)) >= size * price * 1.01
                    and Decimal(self.inventory.get_available('wallet', base)) >= size)
        else:
            return (Decimal(self.inventory.get_available('binance', base)) >= size
                    and Decimal(self.inventory.get_available('wallet', quote)) >= size * price * 1.01)

    async def _fetch_prices(self, pair: str, size: Decimal):
        try:
            ob = await self.exchange.fetch_order_book(pair)
            if ob is None:
                raise Exception("Order book is None")
            analyzer = OrderBookAnalyzer(ob)

            bid_walk_result = analyzer.walk_the_book("sell", size)
            ask_walk_result = analyzer.walk_the_book("buy", size)
            base, quote = pair.split("/")

            amount_in = size * Tokens[base].decimals

            simulated: Quote = await self.pricing.get_quote(
                Tokens[base],
                Tokens[quote],
                amount_in,
                0,
            )

            dex_buy = simulated.route.get_input(amount_in)\
                / Tokens[quote].decimals \
                / size

            dex_sell = simulated.expectedOutput \
                / Tokens[quote].decimals\
                / size

            return {
                'cex_bid': bid_walk_result.avgPrice,
                'cex_ask': ask_walk_result.avgPrice,
                'dex_buy': dex_buy,
                'dex_sell': dex_sell,
            }
        except Exception as e:
            print(e)
            return None


Tokens: dict[str, Token] = {
    'USDC':  Token(
        "USDC",
        10 ** 6,
        Address.from_string("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    ),
    'ETH':  Token(
        "WETH",
        10 ** 18,
        Address.from_string("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    ),
    'USDT':  Token(
        "USDT",
        10 ** 6,
        Address.from_string("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    ),
    'SHIB':  Token(
        "SHIB",
        10 ** 18,
        Address.from_string("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
    ),
}
